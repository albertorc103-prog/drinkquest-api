import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ChatRoomType, NotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeHub } from '../../common/realtime/realtime-hub.service';
import { levelFromTotalXp } from '../../common/utils/level-from-xp.util';
import { NotificationsService } from '../notifications/notifications.service';
import { FriendsService } from '../friends/friends.service';

/** Duración máxima de notas de voz (ms). */
export const CHAT_VOICE_MAX_MS = 30_000;
const GROUP_MAX_MEMBERS = 40;

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
        type: ChatRoomType.DIRECT,
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
        type: ChatRoomType.DIRECT,
        participants: {
          create: [{ userId }, { userId: friendId }],
        },
      },
      include: { participants: true },
    });
  }

  /** Chat comunitario: creador + amigos seleccionados. */
  async createGroup(
    creatorId: string,
    input: {
      name: string;
      description?: string;
      avatarUrl?: string;
      coverUrl?: string;
      memberIds: string[];
    },
  ) {
    const name = input.name?.trim() ?? '';
    if (name.length < 2) {
      throw new BadRequestException('El nombre del grupo debe tener al menos 2 caracteres');
    }
    if (name.length > 30) {
      throw new BadRequestException('El nombre del grupo es demasiado largo');
    }
    const description = input.description?.trim() || null;
    if (description && description.length > 100) {
      throw new BadRequestException('La descripción es demasiado larga');
    }
    const uniqueMembers = [...new Set((input.memberIds ?? []).map((id) => id.trim()).filter(Boolean))];
    const withoutSelf = uniqueMembers.filter((id) => id !== creatorId);
    if (withoutSelf.length < 1) {
      throw new BadRequestException('Selecciona al menos un amigo para el grupo');
    }
    if (withoutSelf.length + 1 > GROUP_MAX_MEMBERS) {
      throw new BadRequestException(`Máximo ${GROUP_MAX_MEMBERS} miembros en el grupo`);
    }
    for (const memberId of withoutSelf) {
      if (!(await this.friends.areFriends(creatorId, memberId))) {
        throw new ForbiddenException('Solo puedes agregar amigos al grupo');
      }
    }
    const avatarUrl = input.avatarUrl?.trim() || null;
    const coverUrl = input.coverUrl?.trim() || null;
    const room = await this.prisma.chatRoom.create({
      data: {
        type: ChatRoomType.GROUP,
        name,
        description,
        avatarUrl,
        coverUrl,
        createdById: creatorId,
        participants: {
          create: [{ userId: creatorId }, ...withoutSelf.map((userId) => ({ userId }))],
        },
      },
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
      },
    });
    return this.mapRoomSummary(room, creatorId, null, 0, false);
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
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: { type: true },
    });
    if (!room) throw new ForbiddenException('Sala no encontrada');
    if (room.type === ChatRoomType.DIRECT) {
      const peer = await this.prisma.chatParticipant.findFirst({
        where: { roomId, userId: { not: senderId } },
        select: { userId: true },
      });
      if (!peer || !(await this.friends.areFriends(senderId, peer.userId))) {
        throw new ForbiddenException('Solo puedes chatear con amigos');
      }
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
    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
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
    sender?: { displayName?: string | null; avatarUrl?: string | null } | null;
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
      senderName: message.sender?.displayName?.trim() || null,
      senderAvatarUrl: message.sender?.avatarUrl?.trim() || null,
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
      sender?: { displayName?: string | null; avatarUrl?: string | null };
    },
  ) {
    const payload = this.toRealtimeMessagePayload(message);
    const [participants, room] = await Promise.all([
      this.prisma.chatParticipant.findMany({
        where: { roomId },
        select: { userId: true },
      }),
      this.prisma.chatRoom.findUnique({
        where: { id: roomId },
        select: { type: true, name: true },
      }),
    ]);
    const preview =
      message.body?.trim() ||
      (message.audioUrl ? '🎤 Nota de voz' : null) ||
      (message.imageUrl ? '📷 Foto' : 'Nuevo mensaje');
    const senderName = message.sender?.displayName?.trim() || 'Alguien';
    const notifTitle =
      room?.type === ChatRoomType.GROUP && room.name?.trim()
        ? `${senderName} · ${room.name.trim()}`
        : senderName;

    for (const p of participants) {
      // Entrega por usuario: llega aunque el cliente no haya hecho join_room en esa sala.
      this.realtime.emitToUser(p.userId, 'message', payload);
      if (p.userId === senderId) continue;
      await this.notifications.pushOnly(
        p.userId,
        NotificationType.CHAT_MESSAGE,
        notifTitle,
        preview,
        {
          roomId,
          messageId: message.id,
          senderId,
          senderName,
          groupName: room?.type === ChatRoomType.GROUP ? room.name : null,
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

    return Promise.all(
      participations.map(async (p) => {
        const last = p.room.messages[0] ?? null;
        const unreadCount = await this.unreadCountForRoom(p.roomId, userId);
        const lastReadByPeer = last
          ? last.reads.some((r) => r.userId !== userId)
          : false;
        return this.mapRoomSummary(p.room, userId, last, unreadCount, lastReadByPeer);
      }),
    );
  }

  private mapRoomSummary(
    room: {
      id: string;
      type: ChatRoomType;
      name: string | null;
      description?: string | null;
      avatarUrl: string | null;
      coverUrl?: string | null;
      participants: Array<{
        userId: string;
        user: {
          id: string;
          displayName: string;
          avatarUrl: string | null;
          isOnline: boolean;
          lastSeenAt: Date | null;
          level: number;
          totalXp: number;
        };
      }>;
    },
    viewerId: string,
    last: {
      body: string | null;
      imageUrl: string | null;
      audioUrl?: string | null;
      createdAt: Date;
      reads: Array<{ userId: string }>;
      sender?: { id: string; displayName: string; avatarUrl: string | null } | null;
    } | null,
    unreadCount: number,
    lastMessageReadByPeer: boolean,
  ) {
    const isGroup = room.type === ChatRoomType.GROUP;
    const peerUser = isGroup
      ? null
      : room.participants.find((x) => x.userId !== viewerId)?.user ?? null;
    const peer = peerUser
      ? {
          id: peerUser.id,
          displayName: peerUser.displayName,
          avatarUrl: peerUser.avatarUrl,
          isOnline: peerUser.isOnline,
          lastSeenAt: peerUser.lastSeenAt?.toISOString() ?? null,
          level: levelFromTotalXp(peerUser.totalXp ?? 0),
          totalXp: peerUser.totalXp,
        }
      : null;
    return {
      roomId: room.id,
      type: room.type,
      name: isGroup ? room.name : null,
      description: isGroup ? room.description ?? null : null,
      avatarUrl: isGroup ? room.avatarUrl : null,
      coverUrl: isGroup ? room.coverUrl ?? null : null,
      memberCount: room.participants.length,
      peer,
      lastMessage: last,
      unreadCount,
      isOnline: peer?.isOnline ?? false,
      lastMessageReadByPeer,
    };
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
