import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeHub } from '../../common/realtime/realtime-hub.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeHub,
  ) {}

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    body?: string,
    payload?: Prisma.InputJsonValue,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, payload },
    });
  }

  async list(userId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.unreadCount(userId),
    ]);
    return { items, total, page, limit, unreadCount };
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
    if (result.count > 0) {
      const summary = await this.messengerSummary(userId);
      this.realtime.emitToUser(userId, 'messenger_summary', summary);
    }
    return result;
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    const summary = await this.messengerSummary(userId);
    this.realtime.emitToUser(userId, 'messenger_summary', summary);
    return { ok: true };
  }

  private async messengerSummary(userId: string) {
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
        where: { receiverId: userId, status: 'PENDING' },
      }),
      this.unreadCount(userId),
    ]);
    return { chatUnread, pendingRequests, notificationUnread };
  }
}
