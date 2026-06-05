import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  PromotionApprovalStatus,
  PromotionEventType,
  PromotionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PromotionResponseDto } from './dto/promotion-response.dto';
import { mapPromotion } from './mappers/promotion.mapper';

@Injectable()
export class AdminPromotionModerationService {
  private readonly logger = new Logger(AdminPromotionModerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async inspectFeedEligibility(promotionId: string) {
    const now = new Date();
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

    const sub = promo.bar.subscription;
    const subscriptionActive =
      !!sub &&
      sub.promoEnabled &&
      ((sub.status === 'TRIAL' &&
        (sub.trialEndsAt == null || sub.trialEndsAt >= now)) ||
        (sub.status === 'ACTIVE' &&
          (sub.currentPeriodEnd == null || sub.currentPeriodEnd >= now)));

    const checks = {
      statusIsActive: promo.status === PromotionStatus.ACTIVE,
      approvalIsApproved: promo.approvalStatus === PromotionApprovalStatus.APPROVED,
      startsAtLteNow: promo.startsAt <= now,
      endsAtGtNow: promo.endsAt > now,
      barActive: promo.bar.deletedAt == null && promo.bar.isActive,
      subscriptionPromoEnabled: subscriptionActive,
    };

    return {
      id: promo.id,
      approvalStatus: promo.approvalStatus,
      status: promo.status,
      startsAt: promo.startsAt,
      endsAt: promo.endsAt,
      barId: promo.barId,
      barName: promo.bar.businessName,
      now,
      subscription: sub,
      checks,
      passesFeedFilter: Object.values(checks).every(Boolean),
    };
  }

  async listRecentForFeedDebug(limit = 15) {
    const rows = await this.prisma.barPromotion.findMany({
      take: Math.min(Math.max(limit, 1), 50),
      orderBy: { updatedAt: 'desc' },
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
    return Promise.all(rows.map((row) => this.inspectFeedEligibility(row.id)));
  }

  async listPending(limit = 100): Promise<PromotionResponseDto[]> {
    const rows = await this.prisma.barPromotion.findMany({
      where: { approvalStatus: PromotionApprovalStatus.PENDING_REVIEW },
      take: Math.min(Math.max(limit, 1), 200),
      orderBy: [{ createdAt: 'asc' }],
      include: {
        bar: { select: { id: true, businessName: true, slug: true, logoUrl: true, city: true } },
      },
    });
    return rows.map((row) => mapPromotion(row));
  }

  async approve(promotionId: string, adminId: string): Promise<PromotionResponseDto> {
    const promo = await this.requirePromotion(promotionId);
    if (promo.approvalStatus === PromotionApprovalStatus.APPROVED) {
      throw new BadRequestException('La promoción ya fue aprobada.');
    }
    const now = new Date();
    if (promo.status === PromotionStatus.EXPIRED || promo.endsAt <= now) {
      throw new BadRequestException('No se puede aprobar una promoción expirada.');
    }

    // El feed de clientes exige status ACTIVE + approval APPROVED (promotion-feed.service).
    const publishNow = promo.startsAt <= now && promo.endsAt > now;
    const nextStatus = publishNow ? PromotionStatus.ACTIVE : promo.status;

    const updated = await this.prisma.barPromotion.update({
      where: { id: promo.id },
      data: {
        approvalStatus: PromotionApprovalStatus.APPROVED,
        rejectionReason: null,
        moderatedByAdminId: adminId,
        moderatedAt: now,
        status: nextStatus,
      },
      include: {
        bar: { select: { id: true, businessName: true, slug: true, logoUrl: true, city: true } },
      },
    });
    await this.createEvent(promo.id, promo.barId, PromotionEventType.APPROVAL, adminId);
    if (nextStatus === PromotionStatus.ACTIVE && promo.status !== PromotionStatus.ACTIVE) {
      await this.createEvent(promo.id, promo.barId, PromotionEventType.ACTIVATION, adminId);
    }
    this.logger.log(
      JSON.stringify({
        event: 'promotion_approve',
        promotionId: promo.id,
        barId: promo.barId,
        adminId,
      }),
    );
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
    return mapPromotion(updated);
  }

  private async requirePromotion(promotionId: string) {
    const promo = await this.prisma.barPromotion.findUnique({ where: { id: promotionId } });
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

