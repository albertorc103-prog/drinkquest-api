import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeHub } from '../../common/realtime/realtime-hub.service';
import { levelFromTotalXp } from '../../common/utils/level-from-xp.util';
import { NotificationsService } from '../notifications/notifications.service';
import { FriendsService } from '../friends/friends.service';

/** Duración máxima de notas de voz (ms). */
export const CHAT_VOICE_MAX_MS = 30_000;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeHub,
  ) {}

  async assertParticipant(roomId: string, userId: string) {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) throw new ForbiddenException('No perteneces a esta sala');
    return participant;
  }

  async getOrCreateRoom(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new ForbiddenException('No puedes chatear contigo mismo');
    }
    if (!(await this.friends.areFriends(userId, friendId))) {
      throw new ForbiddenException('Solo puedes chatear con amigos');
    }
    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: friendId } } },
        ],
      },
      include: { participants: true },
    });
    const existing = rooms.find((r) => r.participants.length === 2);
    if (existing) {
      // Reabrir conversación ocultada por el usuario.
      await this.prisma.chatParticipant.updateMany({
        where: { roomId: existing.id, userId, hiddenAt: { not: null } },
        data: { hiddenAt: null },
      });
      return existing;
    }

    return this.prisma.chatRoom.create({
      data: {
        participants: {
          create: [{ userId }, { userId: friendId }],
        },
      },
      include: { participants: true },
    });
  }

  async sendMessage(
    roomId: string,
    senderId: string,
    body?: string,
    imageUrl?: string,
    audioUrl?: string,
    audioDurationMs?: number,
  ) {
    await this.assertParticipant(roomId, senderId);
    const peer = await this.prisma.chatParticipant.findFirst({
      where: { roomId, userId: { not: senderId } },
      select: { userId: true },
    });
    if (!peer || !(await this.friends.areFriends(senderId, peer.userId))) {
      throw new ForbiddenException('Solo puedes chatear con amigos');
    }
    const trimmedBody = body?.trim() || null;
    const trimmedImage = imageUrl?.trim() || null;
    const trimmedAudio = audioUrl?.trim() || null;
    let duration: number | null = null;
    if (trimmedAudio) {
      const ms = Number(audioDurationMs);
      if (!Number.isFinite(ms) || ms <= 0) {
        throw new BadRequestException('La nota de voz necesita duración válida');
      }
      duration = Math.min(Math.round(ms), CHAT_VOICE_MAX_MS);
    }
    if (!trimmedBody && !trimmedImage && !trimmedAudio) {
      throw new BadRequestException('Mensaje vacío');
    }
    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        senderId,
        body: trimmedBody,
        imageUrl: trimmedImage,
        audioUrl: trimmedAudio,
        audioDurationMs: duration,
      },
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true } },
        reads: true,
      },
    });
    // Si el peer había ocultado el chat, vuelve a mostrárselo al recibir mensaje.
    await this.prisma.chatParticipant.updateMany({
      where: { roomId, userId: { not: senderId }, hiddenAt: { not: null } },
      data: { hiddenAt: null },
    });
    await this.broadcastMessage(roomId, senderId, message);
    return message;
  }

  /** Payload estable para Socket.IO (mismos campos que espera la app Android). */
  toRealtimeMessagePayload(message: {
    id: string;
    roomId: string;
    senderId: string;
    body: string | null;
    imageUrl: string | null;
    audioUrl?: string | null;
    audioDurationMs?: number | null;
    createdAt: Date;
  }) {
    return {
      id: message.id,
      roomId: message.roomId,
      senderId: message.senderId,
      body: message.body ?? '',
      imageUrl: message.imageUrl,
      audioUrl: message.audioUrl ?? null,
      audioDurationMs: message.audioDurationMs ?? null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async listRoomIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.chatParticipant.findMany({
      where: { userId },
      select: { roomId: true },
    });
    return rows.map((r) => r.roomId);
  }

  async broadcastMessage(
    roomId: string,
    senderId: string,
    message: {
      id: string;
      roomId: string;
      senderId: string;
      body: string | null;
      imageUrl: string | null;
      audioUrl?: string | null;
      audioDurationMs?: number | null;
      createdAt: Date;
      sender?: { displayName?: string | null };
    },
  ) {
    const payload = this.toRealtimeMessagePayload(message);
    const participants = await this.prisma.chatParticipant.findMany({
      where: { roomId },
      select: { userId: true },
    });
    const preview =
      message.body?.trim() ||
      (message.audioUrl ? '🎤 Nota de voz' : null) ||
      (message.imageUrl ? '📷 Foto' : 'Nuevo mensaje');
    const senderName = message.sender?.displayName?.trim() || 'Alguien';

    for (const p of participants) {
      // Entrega por usuario: llega aunque el cliente no haya hecho join_room en esa sala.
      this.realtime.emitToUser(p.userId, 'message', payload);
      if (p.userId === senderId) continue;
      await this.notifications.pushOnly(
        p.userId,
        NotificationType.CHAT_MESSAGE,
        senderName,
        preview,
        {
          roomId,
          messageId: message.id,
          senderId,
          senderName,
        },
      );
      const summary = await this.getSummary(p.userId);
      this.realtime.emitToUser(p.userId, 'messenger_summary', summary);
    }
  }

  async messages(roomId: string, userId: string, cursor?: string, limit = 50) {
    await this.assertParticipant(roomId, userId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { roomId, deletedAt: null, ...(cursor && { id: { lt: cursor } }) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true } },
        reads: true,
      },
    });
    return rows.reverse();
  }

  async markRead(messageId: string, userId: string, roomId?: string) {
    const read = await this.prisma.messageRead.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: { readAt: new Date() },
    });
    if (roomId) {
      this.realtime.emitToRoom(roomId, 'read', { messageId, userId, roomId });
    }
    return read;
  }

  async markRoomRead(roomId: string, userId: string) {
    await this.assertParticipant(roomId, userId);
    const now = new Date();
    await this.prisma.chatParticipant.update({
      where: { roomId_userId: { roomId, userId } },
      data: { lastReadAt: now },
    });

    const unread = await this.prisma.chatMessage.findMany({
      where: {
        roomId,
        senderId: { not: userId },
        deletedAt: null,
        reads: { none: { userId } },
      },
      select: { id: true },
    });
    for (const m of unread) {
      await this.markRead(m.id, userId, roomId);
    }

    const summary = await this.getSummary(userId);
    this.realtime.emitToUser(userId, 'messenger_summary', summary);
    return { ok: true, marked: unread.length };
  }

  async unreadCountForRoom(roomId: string, userId: string): Promise<number> {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) return 0;
    const since = participant.lastReadAt ?? participant.joinedAt;
    return this.prisma.chatMessage.count({
      where: {
        roomId,
        senderId: { not: userId },
        deletedAt: null,
        createdAt: { gt: since },
      },
    });
  }

  async myRooms(userId: string) {
    const participations = await this.prisma.chatParticipant.findMany({
      where: { userId, hiddenAt: null },
      include: {
        room: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    isOnline: true,
                    lastSeenAt: true,
                    level: true,
                    totalXp: true,
                  },
                },
              },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: {
                sender: { select: { id: true, displayName: true, avatarUrl: true } },
                reads: true,
              },
            },
          },
        },
      },
      orderBy: { room: { updatedAt: 'desc' } },
    });

    const enriched = await Promise.all(
      participations.map(async (p) => {
        const peer = p.room.participants.find((x) => x.userId !== userId)?.user;
        const last = p.room.messages[0] ?? null;
        const unreadCount = await this.unreadCountForRoom(p.roomId, userId);
        const lastReadByPeer = last
          ? last.reads.some((r) => r.userId !== userId)
          : false;
        return {
          roomId: p.roomId,
          peer: peer
            ? {
                id: peer.id,
                displayName: peer.displayName,
                avatarUrl: peer.avatarUrl,
                isOnline: peer.isOnline,
                lastSeenAt: peer.lastSeenAt?.toISOString() ?? null,
                level: levelFromTotalXp(peer.totalXp ?? 0),
                totalXp: peer.totalXp,
              }
            : null,
          lastMessage: last,
          unreadCount,
          isOnline: peer?.isOnline ?? false,
          lastMessageReadByPeer: lastReadByPeer,
        };
      }),
    );
    return enriched;
  }

  /** Oculta la conversación solo para este usuario (no borra mensajes). */
  async hideRoom(roomId: string, userId: string) {
    await this.assertParticipant(roomId, userId);
    await this.prisma.chatParticipant.update({
      where: { roomId_userId: { roomId, userId } },
      data: { hiddenAt: new Date() },
    });
    const summary = await this.getSummary(userId);
    this.realtime.emitToUser(userId, 'messenger_summary', summary);
    return { hidden: true };
  }

  async getSummary(userId: string) {
    const rooms = await this.myRooms(userId);
    const chatUnread = rooms.reduce((sum, r) => sum + r.unreadCount, 0);
    const [pendingRequests, notificationUnread] = await Promise.all([
      this.prisma.friendRequest.count({
        where: { receiverId: userId, status: 'PENDING' },
      }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);
    return { chatUnread, pendingRequests, notificationUnread };
  }
}
