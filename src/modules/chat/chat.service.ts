import { ForbiddenException, Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeHub } from '../../common/realtime/realtime-hub.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FriendsService } from '../friends/friends.service';

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
    if (existing) return existing;

    return this.prisma.chatRoom.create({
      data: {
        participants: {
          create: [{ userId }, { userId: friendId }],
        },
      },
      include: { participants: true },
    });
  }

  async sendMessage(roomId: string, senderId: string, body?: string, imageUrl?: string) {
    await this.assertParticipant(roomId, senderId);
    const message = await this.prisma.chatMessage.create({
      data: { roomId, senderId, body, imageUrl },
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true } },
        reads: true,
      },
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
    createdAt: Date;
  }) {
    return {
      id: message.id,
      roomId: message.roomId,
      senderId: message.senderId,
      body: message.body ?? '',
      imageUrl: message.imageUrl,
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
      createdAt: Date;
      sender?: { displayName?: string | null };
    },
  ) {
    const payload = this.toRealtimeMessagePayload(message);
    const participants = await this.prisma.chatParticipant.findMany({
      where: { roomId },
      select: { userId: true },
    });
    const preview = message.body?.trim() || '📷 Foto';
    const senderName = message.sender?.displayName ?? 'Alguien';

    for (const p of participants) {
      // Entrega por usuario: llega aunque el cliente no haya hecho join_room en esa sala.
      this.realtime.emitToUser(p.userId, 'message', payload);
      if (p.userId === senderId) continue;
      await this.notifications.create(
        p.userId,
        NotificationType.CHAT_MESSAGE,
        `Mensaje de ${senderName}`,
        preview,
        { roomId, messageId: message.id, senderId },
      );
      const summary = await this.getSummary(p.userId);
      this.realtime.emitToUser(p.userId, 'messenger_summary', summary);
      this.realtime.emitToUser(p.userId, 'notification', {
        type: NotificationType.CHAT_MESSAGE,
        title: `Mensaje de ${senderName}`,
        body: preview,
        roomId,
        messageId: message.id,
      });
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
      where: { userId },
      include: {
        room: {
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true, displayName: true, avatarUrl: true, isOnline: true },
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
          peer,
          lastMessage: last,
          unreadCount,
          isOnline: peer?.isOnline ?? false,
          lastMessageReadByPeer: lastReadByPeer,
        };
      }),
    );
    return enriched;
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
