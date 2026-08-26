import { Injectable, Logger } from '@nestjs/common';
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

const NEWS_ROOFTOP_TYPES: NotificationType[] = [
  NotificationType.ROOFTOP_PACKAGE_PUBLISHED,
];

/** Inbox de la app (campana): solo etiquetas en publicaciones. */
const INBOX_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.FEED_MENTION,
];

export type NewsNotificationCategory = 'cocktails' | 'promotions' | 'rooftop';

function typesForNewsCategory(category: NewsNotificationCategory): NotificationType[] {
  switch (category) {
    case 'cocktails':
      return NEWS_COCKTAIL_TYPES;
    case 'promotions':
      return NEWS_PROMO_TYPES;
    case 'rooftop':
      return NEWS_ROOFTOP_TYPES;
  }
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeHub,
    private readonly fcm: FcmService,
  ) {}

  async registerDeviceToken(userId: string, token: string, platform = 'android') {
    const trimmed = token.trim();
    const existing = await this.prisma.deviceToken.findUnique({
      where: { token: trimmed },
    });
    if (existing) {
      return this.prisma.deviceToken.update({
        where: { token: trimmed },
        data: { userId, platform },
      });
    }
    return this.prisma.deviceToken.create({
      data: { userId, token: trimmed, platform },
    });
  }

  async unregisterDeviceToken(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({
      where: { userId, token: token.trim() },
    });
    return { ok: true };
  }

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
    void this.pushSafe(userId, title, body, type, payload);
    return row;
  }

  /** Push FCM sin guardar ni refrescar el inbox (p. ej. mensajes de chat). */
  async pushOnly(
    userId: string,
    type: NotificationType,
    title: string,
    body?: string,
    payload?: Prisma.InputJsonValue,
    options?: { emitInboxEvent?: boolean },
  ) {
    if (options?.emitInboxEvent) {
      this.realtime.emitToUser(userId, 'notification', {
        type,
        title,
        body,
        ...(payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {}),
      });
    }
    void this.pushSafe(userId, title, body, type, payload);
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
      }
      void this.fcm.sendToUsers(
        chunk.map((u) => u.id),
        title,
        body,
        this.fcmData(type, payload),
      );
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

  async list(userId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const where = { userId, type: { in: INBOX_NOTIFICATION_TYPES } };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.unreadCount(userId),
    ]);
    return { items, total, page, limit, unreadCount };
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
        type: { in: INBOX_NOTIFICATION_TYPES },
      },
    });
  }

  async unreadByCategory(userId: string) {
    const [cocktails, promotions, rooftop, total] = await Promise.all([
      this.prisma.notification.count({
        where: { userId, readAt: null, type: { in: NEWS_COCKTAIL_TYPES } },
      }),
      this.prisma.notification.count({
        where: { userId, readAt: null, type: { in: NEWS_PROMO_TYPES } },
      }),
      this.prisma.notification.count({
        where: { userId, readAt: null, type: { in: NEWS_ROOFTOP_TYPES } },
      }),
      this.unreadCount(userId),
    ]);
    return { cocktails, promotions, rooftop, total };
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
      where: {
        userId,
        readAt: null,
        type: { in: INBOX_NOTIFICATION_TYPES },
      },
      data: { readAt: new Date() },
    });
    const summary = await this.messengerSummary(userId);
    this.realtime.emitToUser(userId, 'messenger_summary', summary);
    return { ok: true };
  }

  async markCategoryRead(userId: string, category: NewsNotificationCategory) {
    const types = typesForNewsCategory(category);
    if (types.length > 0) {
      await this.prisma.notification.updateMany({
        where: { userId, readAt: null, type: { in: types } },
        data: { readAt: new Date() },
      });
      const summary = await this.messengerSummary(userId);
      this.realtime.emitToUser(userId, 'messenger_summary', summary);
    }
    return this.unreadByCategory(userId);
  }

  private async pushSafe(
    userId: string,
    title: string,
    body: string | undefined,
    type: NotificationType,
    payload?: Prisma.InputJsonValue,
  ) {
    try {
      const data = this.fcmData(type, payload);
      const roomId = data.roomId?.trim();
      const isChat = type === NotificationType.CHAT_MESSAGE && !!roomId;
      await this.fcm.sendToUser(userId, title, body, data, {
        // Data-only: la app pinta el texto completo y agrupa por sala.
        dataOnly: isChat,
        collapseKey: isChat ? `chat_${roomId}` : undefined,
        androidTag: isChat ? `chat_${roomId}` : undefined,
      });
    } catch (err) {
      this.logger.warn(
        `Push FCM omitido: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private fcmData(
    type: NotificationType,
    payload?: Prisma.InputJsonValue,
  ): Record<string, string> {
    const data: Record<string, string> = { type: String(type) };
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
        if (v == null) continue;
        data[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }
    return data;
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
