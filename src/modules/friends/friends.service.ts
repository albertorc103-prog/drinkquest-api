import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { FriendRequestStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeHub } from '../../common/realtime/realtime-hub.service';
import { NotificationsService } from '../notifications/notifications.service';
import { levelFromTotalXp } from '../../common/utils/level-from-xp.util';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeHub,
  ) {}

  private async isBlocked(a: string, b: string) {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { initiatorId: a, targetId: b },
          { initiatorId: b, targetId: a },
        ],
      },
    });
    return !!block;
  }

  private async pushSummary(userId: string) {
    const [chatUnread, pendingRequests, notificationUnread] = await Promise.all([
      this.prisma.chatMessage.count({
        where: {
          deletedAt: null,
          senderId: { not: userId },
          room: { participants: { some: { userId } } },
          reads: { none: { userId } },
        },
      }),
      this.prisma.friendRequest.count({
        where: { receiverId: userId, status: FriendRequestStatus.PENDING },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    this.realtime.emitToUser(userId, 'messenger_summary', {
      chatUnread,
      pendingRequests,
      notificationUnread,
    });
  }

  async sendRequest(senderId: string, receiverId: string, message?: string) {
    if (senderId === receiverId) throw new BadRequestException('No puedes agregarte a ti mismo');
    if (await this.isBlocked(senderId, receiverId)) throw new ForbiddenException('Usuario bloqueado');

    // Ya amigos → respuesta estable para el cliente (no error).
    if (await this.areFriends(senderId, receiverId)) {
      return {
        id: 'already-friends',
        senderId,
        receiverId,
        status: FriendRequestStatus.ACCEPTED,
        message: message ?? null,
        alreadyFriends: true,
      };
    }

    // Si la otra persona ya te envió solicitud, aceptar = quedar amigos al tocar «Agregar».
    const incoming = await this.prisma.friendRequest.findUnique({
      where: { senderId_receiverId: { senderId: receiverId, receiverId: senderId } },
    });
    if (incoming?.status === FriendRequestStatus.PENDING) {
      await this.respond(senderId, incoming.id, true);
      return {
        id: incoming.id,
        senderId: incoming.senderId,
        receiverId: incoming.receiverId,
        status: FriendRequestStatus.ACCEPTED,
        message: incoming.message,
        becameFriends: true,
      };
    }

    const existing = await this.prisma.friendRequest.findUnique({
      where: { senderId_receiverId: { senderId, receiverId } },
    });
    if (existing?.status === FriendRequestStatus.PENDING) {
      throw new BadRequestException('Solicitud ya enviada');
    }

    const req = await this.prisma.friendRequest.upsert({
      where: { senderId_receiverId: { senderId, receiverId } },
      create: { senderId, receiverId, message, status: FriendRequestStatus.PENDING },
      update: { status: FriendRequestStatus.PENDING, message },
      include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    const notif = await this.notifications.create(
      receiverId,
      NotificationType.FRIEND_REQUEST,
      'Nueva solicitud de amistad',
      req.sender.displayName,
      { requestId: req.id, senderId },
    );
    await this.pushSummary(receiverId);
    this.realtime.emitToUser(receiverId, 'notification', {
      type: NotificationType.FRIEND_REQUEST,
      title: 'Nueva solicitud de amistad',
      body: req.sender.displayName,
      requestId: req.id,
      notificationId: notif.id,
    });
    return req;
  }

  async respond(receiverId: string, requestId: string, accept: boolean) {
    const req = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!req || req.receiverId !== receiverId) throw new ForbiddenException();
    if (req.status !== FriendRequestStatus.PENDING) throw new BadRequestException('Solicitud ya procesada');

    if (!accept) {
      const updated = await this.prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: FriendRequestStatus.REJECTED },
      });
      await this.pushSummary(receiverId);
      return updated;
    }

    const [userAId, userBId] = req.senderId < req.receiverId
      ? [req.senderId, req.receiverId]
      : [req.receiverId, req.senderId];

    await this.prisma.$transaction([
      this.prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: FriendRequestStatus.ACCEPTED },
      }),
      // Cierra la solicitud cruzada pendiente (si ambos se agregaron).
      this.prisma.friendRequest.updateMany({
        where: {
          status: FriendRequestStatus.PENDING,
          senderId: req.receiverId,
          receiverId: req.senderId,
        },
        data: { status: FriendRequestStatus.ACCEPTED },
      }),
      this.prisma.friendship.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId },
        update: {},
      }),
    ]);
    const notif = await this.notifications.create(
      req.senderId,
      NotificationType.FRIEND_ACCEPTED,
      'Solicitud aceptada',
      'Ya sois amigos',
      { requestId },
    );
    await this.pushSummary(req.senderId);
    await this.pushSummary(receiverId);
    this.realtime.emitToUser(req.senderId, 'notification', {
      type: NotificationType.FRIEND_ACCEPTED,
      title: 'Solicitud aceptada',
      body: 'Ya sois amigos',
      requestId,
      notificationId: notif.id,
    });
    // Forma estable para Gson en Android (evita Map con fechas anidadas).
    return {
      id: req.id,
      senderId: req.senderId,
      receiverId: req.receiverId,
      status: FriendRequestStatus.ACCEPTED,
      message: req.message,
    };
  }

  async cancelRequest(senderId: string, requestId: string) {
    const req = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!req || req.senderId !== senderId) throw new ForbiddenException();
    if (req.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('Solo puedes cancelar solicitudes pendientes');
    }
    const updated = await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: FriendRequestStatus.CANCELLED },
    });
    await this.pushSummary(req.receiverId);
    return updated;
  }

  async listFriends(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: {
        userA: {
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
        userB: {
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
    });

    // Limpia amistades corruptas (mismo usuario en ambos lados).
    const selfRows = rows.filter((f) => f.userAId === f.userBId);
    if (selfRows.length > 0) {
      await this.prisma.friendship.deleteMany({
        where: { id: { in: selfRows.map((r) => r.id) } },
      });
    }

    const peers = rows
      .filter((f) => f.userAId !== f.userBId)
      .map((f) => (f.userAId === userId ? f.userB : f.userA))
      .filter((p): p is NonNullable<typeof p> => !!p && p.id !== userId);

    // Deduplicar por si hay filas duplicadas históricas.
    const uniquePeers = Array.from(new Map(peers.map((p) => [p.id, p])).values());
    if (uniquePeers.length === 0) return [];

    const ids = uniquePeers.map((p) => p.id);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    let drinkByUser = new Map<string, number>();
    let weeklyByUser = new Map<string, number>();
    try {
      const [drinkCounts, weeklyUnlocks] = await Promise.all([
        this.prisma.userDrinkUnlock.groupBy({
          by: ['userId'],
          where: { userId: { in: ids } },
          _count: { _all: true },
        }),
        this.prisma.userDrinkUnlock.groupBy({
          by: ['userId'],
          where: { userId: { in: ids }, unlockedAt: { gte: weekAgo } },
          _count: { _all: true },
        }),
      ]);
      drinkByUser = new Map(drinkCounts.map((r) => [r.userId, r._count._all]));
      weeklyByUser = new Map(weeklyUnlocks.map((r) => [r.userId, r._count._all]));
    } catch {
      // No bloquear el listado de amigos si falla el conteo de bebidas.
    }

    return uniquePeers.map((p) => {
      const totalXp = p.totalXp ?? 0;
      return {
        id: p.id,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        isOnline: p.isOnline,
        lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
        level: levelFromTotalXp(totalXp),
        totalXp,
        drinkCount: drinkByUser.get(p.id) ?? 0,
        weeklyUnlocks: weeklyByUser.get(p.id) ?? 0,
      };
    });
  }

  async pendingRequests(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: { receiverId: userId, status: FriendRequestStatus.PENDING },
      include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async sentRequests(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: { senderId: userId, status: FriendRequestStatus.PENDING },
      include: { receiver: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeFriend(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new BadRequestException('No puedes eliminarte a ti mismo');
    }
    const [userAId, userBId] =
      userId < friendId ? [userId, friendId] : [friendId, userId];
    const deleted = await this.prisma.friendship.deleteMany({
      where: { userAId, userBId },
    });
    if (deleted.count === 0) {
      throw new BadRequestException('No sois amigos');
    }
    await this.prisma.friendRequest.updateMany({
      where: {
        status: FriendRequestStatus.PENDING,
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
      data: { status: FriendRequestStatus.CANCELLED },
    });
    await this.hideDirectRoomsBetween(userId, friendId);
    await this.pushSummary(userId);
    await this.pushSummary(friendId);
    return { removed: true };
  }

  async block(initiatorId: string, targetId: string) {
    if (initiatorId === targetId) {
      throw new BadRequestException('No puedes bloquearte a ti mismo');
    }
    const [userAId, userBId] =
      initiatorId < targetId ? [initiatorId, targetId] : [targetId, initiatorId];
    await this.prisma.$transaction([
      this.prisma.userBlock.upsert({
        where: { initiatorId_targetId: { initiatorId, targetId } },
        create: { initiatorId, targetId },
        update: {},
      }),
      this.prisma.friendship.deleteMany({
        where: { userAId, userBId },
      }),
      this.prisma.friendRequest.updateMany({
        where: {
          status: FriendRequestStatus.PENDING,
          OR: [
            { senderId: initiatorId, receiverId: targetId },
            { senderId: targetId, receiverId: initiatorId },
          ],
        },
        data: { status: FriendRequestStatus.CANCELLED },
      }),
    ]);
    await this.hideDirectRoomsBetween(initiatorId, targetId, /* bothSides */ true);
    await this.pushSummary(initiatorId);
    await this.pushSummary(targetId);
    return { blocked: true };
  }

  /** Oculta salas 1:1 entre dos usuarios para quien elimina (o ambos si bloquea). */
  private async hideDirectRoomsBetween(
    userId: string,
    peerId: string,
    bothSides = false,
  ) {
    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: peerId } } },
        ],
      },
      include: { participants: { select: { userId: true } } },
    });
    const directRoomIds = rooms
      .filter((r) => r.participants.length === 2)
      .map((r) => r.id);
    if (directRoomIds.length === 0) return;

    const now = new Date();
    const userIds = bothSides ? [userId, peerId] : [userId];
    await this.prisma.chatParticipant.updateMany({
      where: {
        roomId: { in: directRoomIds },
        userId: { in: userIds },
      },
      data: { hiddenAt: now },
    });
  }

  async areFriends(userA: string, userB: string): Promise<boolean> {
    if (!userA || !userB || userA === userB) return false;
    const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
    const f = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId: a, userBId: b } },
    });
    return !!f;
  }
}
