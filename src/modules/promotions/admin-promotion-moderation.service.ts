import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationType,
  PromotionApprovalStatus,
  PromotionEventType,
  PromotionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PromotionResponseDto } from './dto/promotion-response.dto';
import { mapPromotion } from './mappers/promotion.mapper';
import {
  assertApprovablePromotion,
  buildClientPromotionFeedWhere,
  computeApprovalPublishPatch,
  evaluateFeedEligibility,
  isSubscriptionActiveForPromoFeed,
} from './utils/promotion-client-feed.util';

@Injectable()
export class AdminPromotionModerationService {
  private readonly logger = new Logger(AdminPromotionModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async inspectFeedEligibility(promotionId: string) {
    const now = new Date();
    const promo = await this.requirePromotionWithBar(promotionId);
    const { checks, passesFeedFilter } = evaluateFeedEligibility(
      promo,
      promo.bar,
      now,
    );

    return {
      id: promo.id,
      approvalStatus: promo.approvalStatus,
      status: promo.status,
      startsAt: promo.startsAt,
      endsAt: promo.endsAt,
      barId: promo.barId,
      barName: promo.bar.businessName,
      now,
      subscription: promo.bar.subscription,
      checks,
      passesFeedFilter,
    };
  }

  async listRecentForFeedDebug(limit = 15) {
    const rows = await this.prisma.barPromotion.findMany({
      take: Math.min(Math.max(limit, 1), 50),
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return Promise.all(rows.map((row) => this.inspectFeedEligibility(row.id)));
  }

  async listPending(limit = 100): Promise<PromotionResponseDto[]> {
    return this.listByApprovalStatus(PromotionApprovalStatus.PENDING_REVIEW, limit);
  }

  async moderationCounts(): Promise<{ pending: number; approved: number; rejected: number }> {
    const [pending, approved, rejected] = await Promise.all([
      this.prisma.barPromotion.count({
        where: { approvalStatus: PromotionApprovalStatus.PENDING_REVIEW },
      }),
      this.prisma.barPromotion.count({
        where: { approvalStatus: PromotionApprovalStatus.APPROVED },
      }),
      this.prisma.barPromotion.count({
        where: { approvalStatus: PromotionApprovalStatus.REJECTED },
      }),
    ]);
    return { pending, approved, rejected };
  }

  async listByApprovalStatus(
    approvalStatus: PromotionApprovalStatus | string,
    limit = 50,
  ): Promise<PromotionResponseDto[]> {
    const status = this.resolveApprovalStatus(approvalStatus);
    const orderBy =
      status === PromotionApprovalStatus.PENDING_REVIEW
        ? [{ createdAt: 'asc' as const }]
        : [{ moderatedAt: 'desc' as const }, { createdAt: 'desc' as const }];
    const rows = await this.prisma.barPromotion.findMany({
      where: { approvalStatus: status },
      take: Math.min(Math.max(limit, 1), 200),
      orderBy,
      include: {
        bar: { select: { id: true, businessName: true, slug: true, logoUrl: true, city: true } },
      },
    });
    return rows.map((row) => mapPromotion(row));
  }

  private resolveApprovalStatus(value: PromotionApprovalStatus | string): PromotionApprovalStatus {
    const normalized = String(value).trim().toUpperCase();
    if (normalized in PromotionApprovalStatus) {
      return PromotionApprovalStatus[normalized as keyof typeof PromotionApprovalStatus];
    }
    throw new BadRequestException(
      `approvalStatus inválido. Valores: ${Object.values(PromotionApprovalStatus).join(', ')}`,
    );
  }

  /**
   * Corrige promociones ya aprobadas que no cumplen el filtro del feed (DRAFT/PAUSED o startsAt futuro).
   */
  async syncApprovedForClientFeed(): Promise<{
    activatedCount: number;
    startsAtAdjustedCount: number;
    feedVisibleCount: number;
  }> {
    const now = new Date();

    const activated = await this.prisma.barPromotion.updateMany({
      where: {
        approvalStatus: PromotionApprovalStatus.APPROVED,
        endsAt: { gt: now },
        status: { not: PromotionStatus.ACTIVE },
      },
      data: { status: PromotionStatus.ACTIVE },
    });

    const startsAdjusted = await this.prisma.barPromotion.updateMany({
      where: {
        approvalStatus: PromotionApprovalStatus.APPROVED,
        endsAt: { gt: now },
        startsAt: { gt: now },
      },
      data: { startsAt: now },
    });

    const feedVisibleCount = await this.prisma.barPromotion.count({
      where: buildClientPromotionFeedWhere(now),
    });

    this.logger.log(
      JSON.stringify({
        event: 'promotion_sync_approved_feed',
        activatedCount: activated.count,
        startsAtAdjustedCount: startsAdjusted.count,
        feedVisibleCount,
      }),
    );

    return {
      activatedCount: activated.count,
      startsAtAdjustedCount: startsAdjusted.count,
      feedVisibleCount,
    };
  }

  async approve(promotionId: string, adminId: string): Promise<PromotionResponseDto> {
    const promo = await this.requirePromotionWithBar(promotionId);
    if (promo.approvalStatus === PromotionApprovalStatus.APPROVED) {
      throw new BadRequestException('La promoción ya fue aprobada.');
    }

    const now = new Date();
    assertApprovablePromotion(promo, now);

    if (!isSubscriptionActiveForPromoFeed(promo.bar.subscription, now)) {
      throw new BadRequestException(
        'El local no tiene suscripción activa con promociones habilitadas. Activa el plan del bar antes de aprobar.',
      );
    }

    const publish = computeApprovalPublishPatch(promo, now);

    const updated = await this.prisma.barPromotion.update({
      where: { id: promo.id },
      data: {
        approvalStatus: PromotionApprovalStatus.APPROVED,
        rejectionReason: null,
        moderatedByAdminId: adminId,
        moderatedAt: now,
        status: publish.status,
        ...(publish.startsAt ? { startsAt: publish.startsAt } : {}),
      },
      include: {
        bar: { select: { id: true, businessName: true, slug: true, logoUrl: true, city: true } },
      },
    });

    await this.createEvent(promo.id, promo.barId, PromotionEventType.APPROVAL, adminId);
    if (publish.activated) {
      await this.createEvent(promo.id, promo.barId, PromotionEventType.ACTIVATION, adminId);
    }

    const { passesFeedFilter } = evaluateFeedEligibility(updated, promo.bar, now);
    this.logger.log(
      JSON.stringify({
        event: 'promotion_approve',
        promotionId: promo.id,
        barId: promo.barId,
        adminId,
        activated: publish.activated,
        startsAtAdjusted: publish.startsAtAdjusted,
        passesFeedFilter,
      }),
    );

    await this.notifications.notifyBarOwner(
      promo.barId,
      NotificationType.PROMOTION_APPROVED,
      'Promoción aprobada',
      `"${updated.title}" ya puede verse en Promos.`,
      { promotionId: updated.id, barId: promo.barId },
    );
    if (passesFeedFilter) {
      await this.notifications.notifyAllUsers(
        NotificationType.PROMOTION_PUBLISHED,
        'Nueva promoción',
        `${updated.bar.businessName} publicó "${updated.title}" en Promos.`,
        { promotionId: updated.id, barId: promo.barId, category: 'promotions' },
      );
    }

    return mapPromotion(updated);
  }

  async reject(promotionId: string, adminId: string, reason: string): Promise<PromotionResponseDto> {
    const promo = await this.requirePromotion(promotionId);
    const updated = await this.prisma.barPromotion.update({
      where: { id: promo.id },
      data: {
        approvalStatus: PromotionApprovalStatus.REJECTED,
        rejectionReason: reason.trim(),
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
        status: promo.status === PromotionStatus.ACTIVE ? PromotionStatus.PAUSED : promo.status,
      },
      include: {
        bar: { select: { id: true, businessName: true, slug: true, logoUrl: true, city: true } },
      },
    });
    await this.createEvent(promo.id, promo.barId, PromotionEventType.REJECTION, adminId, reason.trim());
    this.logger.log(
      JSON.stringify({
        event: 'promotion_reject',
        promotionId: promo.id,
        barId: promo.barId,
        adminId,
      }),
    );

    await this.notifications.notifyBarOwner(
      promo.barId,
      NotificationType.PROMOTION_REJECTED,
      'Promoción rechazada',
      `"${updated.title}": ${reason.trim()}`,
      { promotionId: updated.id, barId: promo.barId, reason: reason.trim() },
    );

    return mapPromotion(updated);
  }

  async flag(promotionId: string, adminId: string, reason: string): Promise<PromotionResponseDto> {
    const promo = await this.requirePromotion(promotionId);
    const updated = await this.prisma.barPromotion.update({
      where: { id: promo.id },
      data: {
        approvalStatus: PromotionApprovalStatus.FLAGGED,
        rejectionReason: reason.trim(),
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
        status: promo.status === PromotionStatus.ACTIVE ? PromotionStatus.PAUSED : promo.status,
      },
      include: {
        bar: { select: { id: true, businessName: true, slug: true, logoUrl: true, city: true } },
      },
    });
    await this.createEvent(promo.id, promo.barId, PromotionEventType.FLAGGING, adminId, reason.trim());
    this.logger.log(
      JSON.stringify({
        event: 'promotion_flag',
        promotionId: promo.id,
        barId: promo.barId,
        adminId,
      }),
    );

    await this.notifications.notifyBarOwner(
      promo.barId,
      NotificationType.PROMOTION_FLAGGED,
      'Promoción marcada',
      `"${updated.title}" requiere revisión: ${reason.trim()}`,
      { promotionId: updated.id, barId: promo.barId, reason: reason.trim() },
    );

    return mapPromotion(updated);
  }

  private async requirePromotion(promotionId: string) {
    const promo = await this.prisma.barPromotion.findUnique({ where: { id: promotionId } });
    if (!promo) throw new NotFoundException('Promoción no encontrada.');
    return promo;
  }

  private async requirePromotionWithBar(promotionId: string) {
    const promo = await this.prisma.barPromotion.findUnique({
      where: { id: promotionId },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            isActive: true,
            deletedAt: true,
            subscription: {
              select: {
                status: true,
                promoEnabled: true,
                trialEndsAt: true,
                currentPeriodEnd: true,
              },
            },
          },
        },
      },
    });
    if (!promo) throw new NotFoundException('Promoción no encontrada.');
    return promo;
  }

  private async createEvent(
    promotionId: string,
    barId: string,
    eventType: PromotionEventType,
    actorUserId: string,
    reason?: string,
  ) {
    await this.prisma.barPromotionEvent.create({
      data: {
        promotionId,
        barId,
        eventType,
        actorUserId,
        reason,
      },
    });
  }
}
