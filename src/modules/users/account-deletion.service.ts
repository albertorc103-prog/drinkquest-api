import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BarReservationStatus,
  ChatRoomType,
  Prisma,
  Role,
  SubscriptionEventType,
  SubscriptionStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { verifyPassword } from '../../common/utils/crypto.util';
import { StorageService } from '../uploads/storage.service';
import { StripeService } from '../payments/stripe.service';
import { BarSubscriptionService } from '../subscriptions/bar-subscription.service';

/**
 * Eliminación hard de cuenta (Fase 1).
 *
 * Fase 3.1 Proactive Discovery: el anti-spam / pool de candidatos vive en Room (Android).
 * No hay tablas Prisma de discovery ni coordenadas de usuario que borrar en servidor.
 * Al eliminar cuenta: LocalUserProgressCleaner limpia discovery_candidates + cooldowns + geofences.
 */
export type AccountDeletionResult = {
  deleted: true;
  mode: 'hard_delete';
  role: Role;
  barDeactivated: boolean;
  stripeCanceled: boolean;
  storageDeleted: number;
  storageFailed: number;
};

/**
 * Único punto de verdad para eliminación de cuenta (app Android y futura web).
 * Orden: externos que deben abortar (Stripe) → inventario media → TX Postgres → Redis → MinIO best-effort.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly stripe: StripeService,
    private readonly subscriptions: BarSubscriptionService,
  ) {}

  /** Flujo autenticado: verifica contraseña y ejecuta borrado. */
  async deleteOwnAccountWithPassword(
    userId: string,
    password: string,
  ): Promise<AccountDeletionResult> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, passwordHash: true, role: true, email: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const plain = password?.trim() ?? '';
    if (!plain || !(await verifyPassword(plain, user.passwordHash))) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    return this.executeDeletion(userId, { role: user.role });
  }

  /**
   * Entrada reutilizable (FASE WEB): tras verificar identidad por email/token,
   * llamar a este método. No duplicar lógica de borrado.
   */
  async executeDeletion(
    userId: string,
    hints?: { role?: Role },
  ): Promise<AccountDeletionResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        avatarUrl: true,
        deletedAt: true,
        bar: { select: { id: true, deletedAt: true } },
      },
    });
    if (!user || user.deletedAt) {
      // Idempotencia: ya no existe o ya estaba soft-deleted legacy.
      if (!user) {
        return {
          deleted: true,
          mode: 'hard_delete',
          role: hints?.role ?? Role.USER,
          barDeactivated: false,
          stripeCanceled: false,
          storageDeleted: 0,
          storageFailed: 0,
        };
      }
    }

    const role = user.role;
    let stripeCanceled = false;
    let barDeactivated = false;

    // 1) Stripe ANTES de tocar Postgres: si falla con Stripe activo, abortar.
    if (user.bar?.id) {
      stripeCanceled = await this.cancelBarBillingOrThrow(user.bar.id);
    }

    // 2) Inventario de objetos de storage (antes de borrar filas).
    const objectKeys = await this.collectOwnedObjectKeys(userId, user.avatarUrl);

    // 3) Transacción PostgreSQL
    await this.prisma.$transaction(async (tx) => {
      await this.handleBarOwnership(tx, userId, user.bar?.id ?? null);
      if (user.bar?.id) barDeactivated = true;

      await this.handleReservations(tx, userId);
      await this.handleReports(tx, userId);
      await this.handleQrSessions(tx, userId);
      await this.handlePromotionAnalytics(tx, userId);

      await tx.placeVisit.deleteMany({ where: { userId } });
      await tx.placeReview.deleteMany({ where: { userId } });

      await this.wipeSocialAndGamification(tx, userId);
      await this.wipeAuthArtifacts(tx, userId);

      await tx.user.delete({ where: { id: userId } });
    });

    // 4) Redis presence
    await this.clearRedisPresence(userId);

    // 5) MinIO best-effort (no revierte DB)
    const storage = await this.storage.deleteObjectsBestEffort(objectKeys);

    this.logger.log(
      JSON.stringify({
        event: 'account_deleted',
        userIdHash: createHash('sha256').update(userId).digest('hex').slice(0, 12),
        role,
        barDeactivated,
        stripeCanceled,
        storageDeleted: storage.deleted,
        storageFailed: storage.failed,
      }),
    );

    return {
      deleted: true,
      mode: 'hard_delete',
      role,
      barDeactivated,
      stripeCanceled,
      storageDeleted: storage.deleted,
      storageFailed: storage.failed,
    };
  }

  /**
   * Cancela suscripción Stripe si existe; marca CANCELED en DB.
   * Si Stripe está configurado y la cancelación remota falla → lanza (no borrar cuenta).
   */
  private async cancelBarBillingOrThrow(barId: string): Promise<boolean> {
    const sub = await this.prisma.barSubscription.findUnique({ where: { barId } });
    if (!sub) return false;

    let remoteCanceled = false;
    if (this.stripe.enabled() && sub.stripeSubscriptionId) {
      try {
        const client = this.stripe.requireClient();
        await client.subscriptions.cancel(sub.stripeSubscriptionId);
        remoteCanceled = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'stripe_error';
        this.logger.error(
          JSON.stringify({
            event: 'stripe_cancel_failed_on_account_delete',
            barId,
            message: msg,
          }),
        );
        throw new ServiceUnavailableException(
          'No se pudo cancelar la suscripción de pago. Inténtalo de nuevo o contacta soporte.',
        );
      }
    } else if (!this.stripe.enabled()) {
      this.stripe.logDisabledOnce('account_deletion_local_cancel');
    }

    await this.subscriptions.mutate(
      barId,
      {
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
        qrEnabled: false,
        promoEnabled: false,
      },
      { actorSource: 'system', reason: 'account_deletion' },
      { eventType: SubscriptionEventType.STATUS_CHANGED, statusChange: true },
      sub,
    );
    return remoteCanceled || !this.stripe.enabled();
  }

  private async handleBarOwnership(
    tx: Prisma.TransactionClient,
    userId: string,
    barId: string | null,
  ): Promise<void> {
    if (!barId) return;
    const now = new Date();
    await tx.bar.update({
      where: { id: barId },
      data: {
        ownerUserId: null,
        isActive: false,
        deletedAt: now,
        phone: null,
      },
    });
  }

  private async handleReservations(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const now = new Date();
    await tx.barReservation.updateMany({
      where: {
        userId,
        status: { in: [BarReservationStatus.PENDING, BarReservationStatus.CONFIRMED] },
        reservedFor: { gte: now },
      },
      data: {
        status: BarReservationStatus.CANCELLED,
        resolvedAt: now,
        guestName: 'Cliente',
        notes: null,
        userId: null,
        barResponse: 'Cancelada automáticamente: cuenta eliminada.',
      },
    });
    await tx.barReservation.updateMany({
      where: { userId },
      data: {
        guestName: 'Cliente',
        notes: null,
        userId: null,
      },
    });
  }

  private async handleReports(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.report.updateMany({
      where: { reporterId: userId },
      data: { reporterId: null },
    });
    await tx.report.updateMany({
      where: { targetUserId: userId },
      data: { targetUserId: null },
    });
  }

  private async handleQrSessions(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.qrSession.updateMany({
      where: { scannedById: userId },
      data: { scannedById: null },
    });
  }

  private async handlePromotionAnalytics(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    // Sin FK a User; solo desvincular identificador personal.
    await tx.promotionAnalyticsEvent.updateMany({
      where: { userId },
      data: { userId: null },
    });
  }

  private async wipeSocialAndGamification(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await tx.postLike.deleteMany({ where: { userId } });
    await tx.postCommentLike.deleteMany({ where: { userId } });
    await tx.feedPost.deleteMany({ where: { authorId: userId } });
    await tx.postComment.deleteMany({ where: { authorId: userId } });
    await tx.userDrinkUnlock.deleteMany({ where: { userId } });
    await tx.drinkHistoryEntry.deleteMany({ where: { userId } });
    await tx.userFavoriteDrink.deleteMany({ where: { userId } });
    await tx.userMission.deleteMany({ where: { userId } });
    await tx.userAchievement.deleteMany({ where: { userId } });
    await tx.userBarMissionProgress.deleteMany({ where: { userId } });
    await tx.userBarMedal.deleteMany({ where: { userId } });
    await tx.userGlobalEventProgress.deleteMany({ where: { userId } });
    await tx.userGlobalEventMedal.deleteMany({ where: { userId } });
    await tx.gamificationReward.deleteMany({ where: { userId } });
    await tx.uploadAsset.deleteMany({ where: { ownerUserId: userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.userPromotionActivation.deleteMany({ where: { userId } });

    const chatMemberships = await tx.chatParticipant.findMany({
      where: { userId },
      select: {
        roomId: true,
        room: { select: { type: true } },
      },
    });
    const directRoomIds = chatMemberships
      .filter((row) => row.room.type === ChatRoomType.DIRECT)
      .map((row) => row.roomId);
    if (directRoomIds.length > 0) {
      // DIRECT: eliminar sala completa (mensajes del otro participante en ese 1:1 también).
      await tx.chatRoom.deleteMany({ where: { id: { in: directRoomIds } } });
    }

    await tx.messageRead.deleteMany({ where: { userId } });
    await tx.messageReaction.deleteMany({ where: { userId } });
    // GROUP: solo mensajes propios; el grupo continúa.
    await tx.chatMessage.deleteMany({ where: { senderId: userId } });
    await tx.chatParticipant.deleteMany({ where: { userId } });
    await tx.chatRoom.updateMany({
      where: { createdById: userId },
      data: { createdById: null },
    });

    await tx.friendship.deleteMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
    });
    await tx.friendRequest.deleteMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    });
    await tx.userBlock.deleteMany({
      where: { OR: [{ initiatorId: userId }, { targetId: userId }] },
    });
  }

  private async wipeAuthArtifacts(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const now = new Date();
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.emailVerification.deleteMany({ where: { userId } });
    await tx.passwordReset.deleteMany({ where: { userId } });
    await tx.deviceToken.deleteMany({ where: { userId } });
    await tx.userNotificationPreferences.deleteMany({ where: { userId } });
  }

  private async collectOwnedObjectKeys(
    userId: string,
    avatarUrl: string | null,
  ): Promise<string[]> {
    const keys = new Set<string>();
    const add = (urlOrKey: string | null | undefined) => {
      const key = this.storage.tryExtractObjectKey(urlOrKey);
      if (key) keys.add(key);
    };
    add(avatarUrl);

    const posts = await this.prisma.feedPost.findMany({
      where: { authorId: userId },
      select: { imageKey: true, imageUrl: true },
    });
    for (const p of posts) {
      if (p.imageKey) keys.add(p.imageKey);
      else add(p.imageUrl);
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: { senderId: userId },
      select: { imageKey: true, imageUrl: true, audioUrl: true },
    });
    for (const m of messages) {
      if (m.imageKey) keys.add(m.imageKey);
      else add(m.imageUrl);
      add(m.audioUrl);
    }

    return [...keys];
  }

  private async clearRedisPresence(userId: string): Promise<void> {
    try {
      await this.redis.del(`online:${userId}`);
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: 'redis_presence_clear_failed',
          message: err instanceof Error ? err.message : 'unknown',
        }),
      );
    }
  }
}

/** Placeholder FASE WEB: solicitud por email + token, luego executeDeletion. */
export function buildAccountDeletionRequestToken(): string {
  return randomBytes(32).toString('hex');
}
