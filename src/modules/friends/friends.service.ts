import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { FriendRequestStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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

  async sendRequest(senderId: string, receiverId: string, message?: string) {
    if (senderId === receiverId) throw new BadRequestException('No puedes agregarte a ti mismo');
    if (await this.isBlocked(senderId, receiverId)) throw new ForbiddenException('Usuario bloqueado');

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
    });
    await this.notifications.create(receiverId, NotificationType.FRIEND_REQUEST, 'Nueva solicitud de amistad');
    return req;
  }

  async respond(receiverId: string, requestId: string, accept: boolean) {
    const req = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!req || req.receiverId !== receiverId) throw new ForbiddenException();
    if (req.status !== FriendRequestStatus.PENDING) throw new BadRequestException('Solicitud ya procesada');

    if (!accept) {
      return this.prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: FriendRequestStatus.REJECTED },
      });
    }

    const [userAId, userBId] = req.senderId < req.receiverId
      ? [req.senderId, req.receiverId]
      : [req.receiverId, req.senderId];

    const [friendship] = await this.prisma.$transaction([
      this.prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: FriendRequestStatus.ACCEPTED },
      }),
      this.prisma.friendship.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId },
        update: {},
      }),
    ]);
    await this.notifications.create(req.senderId, NotificationType.FRIEND_ACCEPTED, 'Solicitud aceptada');
    return friendship;
  }

  async listFriends(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: true, userB: true },
    });
    return rows.map((f) => (f.userAId === userId ? f.userB : f.userA));
  }

  async pendingRequests(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: { receiverId: userId, status: FriendRequestStatus.PENDING },
      include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
  }

  async block(initiatorId: string, targetId: string) {
    await this.prisma.userBlock.upsert({
      where: { initiatorId_targetId: { initiatorId, targetId } },
      create: { initiatorId, targetId },
      update: {},
    });
    return { blocked: true };
  }

  async areFriends(userA: string, userB: string): Promise<boolean> {
    const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
    const f = await this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId: a, userBId: b } },
    });
    return !!f;
  }
}
