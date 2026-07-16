import { Injectable, Logger } from '@nestjs/common';
import {
  RooftopPackageApprovalStatus,
  RooftopPackageStatus,
  RooftopVerificationStatus,
  SubscriptionPlan,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { mapRooftopPackage } from './mappers/rooftop-package.mapper';

@Injectable()
export class RooftopFeedService {
  private readonly logger = new Logger(RooftopFeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForUsers(page = 1, limit = 20) {
    const now = new Date();
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const where = {
      deletedAt: null,
      approvalStatus: RooftopPackageApprovalStatus.APPROVED,
      status: RooftopPackageStatus.ACTIVE,
      startsAt: { lte: now },
      endsAt: { gte: now },
      bar: {
        deletedAt: null,
        isActive: true,
        rooftopStatus: RooftopVerificationStatus.APPROVED,
        hasOutdoorSpace: true,
        subscription: {
          plan: SubscriptionPlan.LEGEND,
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
      this.prisma.barRooftopPackage.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: [{ startsAt: 'desc' }],
        include: {
          bar: {
            select: {
              id: true,
              businessName: true,
              slug: true,
              logoUrl: true,
              city: true,
            },
          },
        },
      }),
      this.prisma.barRooftopPackage.count({ where }),
    ]);

    this.logger.debug(
      JSON.stringify({
        event: 'rooftop_feed_list',
        page: safePage,
        limit: safeLimit,
        total,
        returned: rows.length,
      }),
    );

    return {
      items: rows.map(mapRooftopPackage),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }
}
