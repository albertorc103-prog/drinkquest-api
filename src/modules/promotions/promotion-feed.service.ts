import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PromotionEventTheme } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PromotionFeedPageDto } from './dto/promotion-response.dto';
import { mapPromotion } from './mappers/promotion.mapper';
import { buildClientPromotionFeedWhere } from './utils/promotion-client-feed.util';

export type PromotionFeedSort = 'ranking' | 'ending_soon' | 'newest';
export type PromotionFeedThemeFilter = 'ALL' | 'THEMED' | PromotionEventTheme;

@Injectable()
export class PromotionFeedService {
  private readonly logger = new Logger(PromotionFeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForUsers(
    page = 1,
    limit = 20,
    sort: PromotionFeedSort = 'ranking',
    theme: PromotionFeedThemeFilter = 'ALL',
  ): Promise<PromotionFeedPageDto> {
    const now = new Date();
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * safeLimit;
    const where: Prisma.BarPromotionWhereInput = {
      AND: [buildClientPromotionFeedWhere(now), this.themeWhere(theme)],
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

    this.logger.debug(
      JSON.stringify({
        event: 'promotion_feed_list',
        page: Math.max(page, 1),
        limit: safeLimit,
        theme,
        total,
        returned: rows.length,
      }),
    );

    return {
      items: rows.map((row) => mapPromotion(row)),
      page: Math.max(page, 1),
      limit: safeLimit,
      total,
    };
  }

  private themeWhere(theme: PromotionFeedThemeFilter): Prisma.BarPromotionWhereInput {
    if (theme === 'ALL') return {};
    if (theme === 'THEMED') {
      return { eventTheme: { not: PromotionEventTheme.STANDARD } };
    }
    if (Object.values(PromotionEventTheme).includes(theme)) {
      return { eventTheme: theme };
    }
    return {};
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
          { eventTheme: 'desc' },
          { placementType: 'desc' },
          { rankingScore: 'desc' },
          { priority: 'desc' },
          { createdAt: 'desc' },
        ];
    }
  }
}
