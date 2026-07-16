import { Injectable, Logger } from '@nestjs/common';
import {
  SpecialDrinkApprovalStatus,
  SpecialDrinkStatus,
  SubscriptionPlan,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { mapSpecialDrink } from './mappers/special-drink.mapper';

@Injectable()
export class SpecialDrinksFeedService {
  private readonly logger = new Logger(SpecialDrinksFeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForUsers(page = 1, limit = 20) {
    const now = new Date();
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const where = {
      deletedAt: null,
      approvalStatus: SpecialDrinkApprovalStatus.APPROVED,
      status: SpecialDrinkStatus.ACTIVE,
      bar: {
        deletedAt: null,
        isActive: true,
        subscription: {
          plan: { in: [SubscriptionPlan.INTERMEDIATE, SubscriptionPlan.LEGEND] },
          OR: [
            {
              status: 'TRIAL' as const,
              OR: [{ trialEndsAt: null }, { trialEndsAt: { gte: now } }],
            },
            {
              status: 'ACTIVE' as const,
              OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: now } }],
            },
          ],
        },
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.barSpecialDrink.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          bar: {
            select: { id: true, businessName: true, slug: true, logoUrl: true, city: true },
          },
          materializedDrink: { select: { id: true } },
        },
      }),
      this.prisma.barSpecialDrink.count({ where }),
    ]);

    const barIds = [...new Set(rows.map((r) => r.barId))];
    const counts =
      barIds.length === 0
        ? []
        : await this.prisma.barSpecialDrink.groupBy({
            by: ['barId'],
            where: {
              barId: { in: barIds },
              deletedAt: null,
              approvalStatus: SpecialDrinkApprovalStatus.APPROVED,
              status: SpecialDrinkStatus.ACTIVE,
            },
            _count: { _all: true },
          });
    const countByBar = new Map(counts.map((c) => [c.barId, c._count._all]));

    this.logger.debug(
      JSON.stringify({
        event: 'special_drinks_feed_list',
        page: safePage,
        limit: safeLimit,
        total,
        returned: rows.length,
      }),
    );

    return {
      items: rows.map((row) => ({
        ...mapSpecialDrink(row),
        specialCountForBar: countByBar.get(row.barId) ?? 1,
      })),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }
}
