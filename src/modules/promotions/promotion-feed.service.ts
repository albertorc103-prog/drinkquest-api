import { Injectable } from '@nestjs/common';
import { Prisma, PromotionApprovalStatus, PromotionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PromotionFeedPageDto } from './dto/promotion-response.dto';
import { mapPromotion } from './mappers/promotion.mapper';
import { activePromoSubscriptionWhere } from './utils/promotion-feed-subscription.where';

export type PromotionFeedSort = 'ranking' | 'ending_soon' | 'newest';

@Injectable()
export class PromotionFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUsers(
    page = 1,
    limit = 20,
    sort: PromotionFeedSort = 'ranking',
  ): Promise<PromotionFeedPageDto> {
    const now = new Date();
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    const where: Prisma.BarPromotionWhereInput = {
      status: PromotionStatus.ACTIVE,
      approvalStatus: PromotionApprovalStatus.APPROVED,
      startsAt: { lte: now },
      endsAt: { gt: now },
      bar: {
        deletedAt: null,
        isActive: true,
        subscription: activePromoSubscriptionWhere(now),
      },
    };

    const orderBy = this.resolveOrderBy(sort);

    const [rows, total] = await Promise.all([
      this.prisma.barPromotion.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy,
        include: {
          bar: {
            select: { id: true, businessName: true, slug: true, logoUrl: true, city: true },
          },
        },
      }),
      this.prisma.barPromotion.count({ where }),
    ]);

    return {
      items: rows.map((row) => mapPromotion(row)),
      page: Math.max(page, 1),
      limit: safeLimit,
      total,
    };
  }

  private resolveOrderBy(sort: PromotionFeedSort): Prisma.BarPromotionOrderByWithRelationInput[] {
    switch (sort) {
      case 'ending_soon':
        return [{ endsAt: 'asc' }, { rankingScore: 'desc' }];
      case 'newest':
        return [{ createdAt: 'desc' }];
      case 'ranking':
      default:
        return [
          { placementType: 'desc' },
          { rankingScore: 'desc' },
          { priority: 'desc' },
          { createdAt: 'desc' },
        ];
    }
  }
}
