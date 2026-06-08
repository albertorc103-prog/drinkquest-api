import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  PromotionAnalyticsEventType,
  PromotionApprovalStatus,
  PromotionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PromotionAnalyticsSummaryDto } from './dto/promotion-response.dto';

@Injectable()
export class PromotionAnalyticsService {
  private readonly logger = new Logger(PromotionAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async trackEvent(
    promotionId: string,
    eventType: PromotionAnalyticsEventType,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ tracked: true }> {
    await this.assertTrackablePromotion(promotionId);

    await this.prisma.promotionAnalyticsEvent.create({
      data: {
        promotionId,
        userId,
        eventType,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });
    this.logger.log(
      JSON.stringify({
        event: 'promotion_analytics_track',
        promotionId,
        userId,
        eventType,
      }),
    );
    return { tracked: true };
  }

  async getSummaryForPromotionIds(
    promotionIds: string[],
  ): Promise<Record<string, PromotionAnalyticsSummaryDto>> {
    if (promotionIds.length === 0) return {};
    const grouped = await this.prisma.promotionAnalyticsEvent.groupBy({
      by: ['promotionId', 'eventType'],
      _count: { _all: true },
      where: { promotionId: { in: promotionIds } },
    });

    const result: Record<string, PromotionAnalyticsSummaryDto> = {};
    for (const id of promotionIds) {
      result[id] = { impressions: 0, opens: 0, qrScans: 0 };
    }
    for (const row of grouped) {
      const target = result[row.promotionId] ?? { impressions: 0, opens: 0, qrScans: 0 };
      if (row.eventType === PromotionAnalyticsEventType.IMPRESSION) target.impressions = row._count._all;
      if (row.eventType === PromotionAnalyticsEventType.OPEN) target.opens = row._count._all;
      if (row.eventType === PromotionAnalyticsEventType.QR_SCAN) target.qrScans = row._count._all;
      result[row.promotionId] = target;
    }
    return result;
  }

  private async assertTrackablePromotion(promotionId: string): Promise<void> {
    const now = new Date();
    const promo = await this.prisma.barPromotion.findFirst({
      where: {
        id: promotionId,
        status: PromotionStatus.ACTIVE,
        approvalStatus: PromotionApprovalStatus.APPROVED,
        startsAt: { lte: now },
        endsAt: { gt: now },
        bar: {
          deletedAt: null,
          isActive: true,
        },
      },
      select: { id: true },
    });
    if (!promo) {
      throw new NotFoundException('Promoción no disponible para tracking.');
    }
  }
}

