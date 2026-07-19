import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeHub } from '../../common/realtime/realtime-hub.service';
import { FcmService } from './fcm.service';

const NEWS_COCKTAIL_TYPES: NotificationType[] = [
  NotificationType.SPECIAL_DRINK_PUBLISHED,
];

const NEWS_PROMO_TYPES: NotificationType[] = [
  NotificationType.PROMOTION_PUBLISHED,
];

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeHub,
    private readonly fcm: FcmService,
  ) {}

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    body?: string,
    payload?: Prisma.InputJsonValue,
  ) {
    const row = await this.prisma.notification.create({
      data: { userId, type, title, body, payload },
    });
    this.realtime.emitToUser(userId, 'notification', row);
    const summary = await this.messengerSummary(userId);
    this.realtime.emitToUser(userId, 'messenger_summary', summary);
    void this.fcm.sendToUser(userId, title, body, {
      type,
      notificationId: row.id,
    });
    return row;
  }

  /** Fan-out a todos los usuarios finales (Role.USER). */
  async notifyAllUsers(
    type: NotificationType,
    title: string,
    body?: string,
    payload?: Prisma.InputJsonValue,
  ) {
    const users = await this.prisma.user.findMany({
      where: { role: Role.USER, deletedAt: null },
      select: { id: true },
    });
    if (users.length === 0) return { created: 0 };

    const chunkSize = 400;
    let created = 0;
    for (let i = 0; i < users.length; i += chunkSize) {
      const chunk = users.slice(i, i + chunkSize);
      const result = await this.prisma.notification.createMany({
        data: chunk.map((u) => ({
          userId: u.id,
          type,
          title,
          body: body ?? null,
          payload: payload ?? undefined,
        })),
      });
      created += result.count;
      for (const u of chunk) {
        this.realtime.emitToUser(u.id, 'notification', { type, title, body });
        void this.fcm.sendToUser(u.id, title, body, { type });
      }
    }
    return { created };
  }

  async notifyBarOwner(
    barId: string,
    type: NotificationType,
    title: string,
    body?: string,
    payload?: Prisma.InputJsonValue,
  ) {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null },
      select: { ownerUserId: true },
    });
    if (!bar?.ownerUserId) return null;
    return this.create(bar.ownerUserId, type, title, body, payload);
  }

  async registerDeviceToken(userId: string, token: string, platform?: string) {
    return this.fcm.registerToken(userId, token, platform ?? 'android');
  }

  async unregisterDeviceToken(userId: string, token: string) {
    return this.fcm.unregisterToken(userId, token);
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

  /** Contadores de no leídas para badges de Noticias (Cócteles / Promos). */
  async unreadByCategory(userId: string) {
    const [cocktails, promotions, total] = await Promise.all([
      this.prisma.notification.count({
        where: { userId, readAt: null, type: { in: NEWS_COCKTAIL_TYPES } },
      }),
      this.prisma.notification.count({
        where: { userId, readAt: null, type: { in: NEWS_PROMO_TYPES } },
      }),
      this.unreadCount(userId),
    ]);
    return { cocktails, promotions, total };
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

  /** Marca leídas las notificaciones de una categoría de noticias. */
  async markCategoryRead(userId: string, category: 'cocktails' | 'promotions') {
    const types =
      category === 'cocktails' ? NEWS_COCKTAIL_TYPES : NEWS_PROMO_TYPES;
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, type: { in: types } },
      data: { readAt: new Date() },
    });
    const summary = await this.messengerSummary(userId);
    this.realtime.emitToUser(userId, 'messenger_summary', summary);
    return this.unreadByCategory(userId);
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
