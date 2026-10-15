import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ReportStatus, Role, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { mapAdminBarRow } from './mappers/admin-bar.mapper';

const barAdminInclude = {
  owner: { select: { email: true, displayName: true } },
  subscription: {
    select: {
      status: true,
      plan: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      qrEnabled: true,
      promoEnabled: true,
    },
  },
} as const;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async analytics() {
    const [users, bars, unlocks, reports, activeSubscriptions, subscriptionDistribution] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.bar.count({ where: { deletedAt: null } }),
        this.prisma.userDrinkUnlock.count(),
        this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
        this.prisma.barSubscription.count({
          where: {
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
            bar: { deletedAt: null, isActive: true },
          },
        }),
        this.subscriptionDistribution(),
      ]);
    return {
      users,
      bars,
      unlocks,
      openReports: reports,
      activeSubscriptions,
      subscriptionDistribution,
    };
  }

  async growthAnalytics(range: string) {
    const normalized = (range ?? '6m').toLowerCase();
    switch (normalized) {
      case '7d':
        return this.growthDaily(7);
      case '30d':
        return this.growthDaily(30);
      case '12m':
        return this.growthMonthly(12);
      case '6m':
      default:
        return this.growthMonthly(6);
    }
  }

  private activeSubscriptionWhere() {
    return {
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
      bar: { deletedAt: null, isActive: true },
    };
  }

  private async subscriptionDistribution() {
    const rows = await this.prisma.barSubscription.findMany({
      where: this.activeSubscriptionWhere(),
      select: { plan: true },
    });
    const counts = { explorer: 0, mixologist: 0, legend: 0 };
    for (const row of rows) {
      const bucket = this.normalizePlanBucket(row.plan ?? SubscriptionPlan.EXPLORER);
      counts[bucket] += 1;
    }
    return counts;
  }

  private normalizePlanBucket(plan: SubscriptionPlan): 'explorer' | 'mixologist' | 'legend' {
    switch (plan) {
      case SubscriptionPlan.EXPLORER:
      case SubscriptionPlan.BASIC:
        return 'explorer';
      case SubscriptionPlan.INTERMEDIATE:
      case SubscriptionPlan.PRO:
        return 'mixologist';
      case SubscriptionPlan.LEGEND:
        return 'legend';
      default:
        return 'explorer';
    }
  }

  private async growthMonthly(monthCount: number) {
    const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const now = new Date();
    const points: { label: string; users: number; bars: number }[] = [];
    for (let i = monthCount - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const [userCount, barCount] = await Promise.all([
        this.prisma.user.count({
          where: { deletedAt: null, createdAt: { lte: monthEnd } },
        }),
        this.prisma.bar.count({
          where: { deletedAt: null, createdAt: { lte: monthEnd } },
        }),
      ]);
      points.push({
        label: monthLabels[monthStart.getMonth()],
        users: userCount,
        bars: barCount,
      });
    }
    return { range: monthCount === 12 ? '12m' : '6m', points };
  }

  private async growthDaily(dayCount: number) {
    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const now = new Date();
    const points: { label: string; users: number; bars: number }[] = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(end.getDate() - i);
      end.setHours(23, 59, 59, 999);
      const label =
        dayCount <= 7
          ? dayLabels[end.getDay()]
          : `${end.getDate()}/${end.getMonth() + 1}`;
      const [userCount, barCount] = await Promise.all([
        this.prisma.user.count({
          where: { deletedAt: null, createdAt: { lte: end } },
        }),
        this.prisma.bar.count({
          where: { deletedAt: null, createdAt: { lte: end } },
        }),
      ]);
      points.push({ label, users: userCount, bars: barCount });
    }
    return { range: dayCount === 7 ? '7d' : '30d', points };
  }

  async listUsers(page = 1, limit = 50) {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    });
  }

  async listBars() {
    const bars = await this.prisma.bar.findMany({
      where: { deletedAt: null },
      include: barAdminInclude,
      orderBy: { createdAt: 'desc' },
    });
    return bars.map((bar) => mapAdminBarRow(bar));
  }

  async getBar(id: string) {
    const bar = await this.prisma.bar.findFirst({
      where: { id, deletedAt: null },
      include: barAdminInclude,
    });
    if (!bar) {
      throw new NotFoundException('Local no encontrado');
    }
    return mapAdminBarRow(bar);
  }

  async listReports(status?: ReportStatus) {
    return this.prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async resolveReport(
    id: string,
    status: ReportStatus,
    adminNotes?: string,
    adminId?: string,
  ) {
    const updated = await this.prisma.report.update({
      where: { id },
      data: { status, adminNotes },
    });
    this.logger.log(
      JSON.stringify({
        event: 'moderation_resolve_report',
        reportId: id,
        targetType: updated.targetType,
        targetId:
          updated.targetUserId ??
          updated.targetPostId ??
          updated.targetReviewId ??
          updated.targetMessageId ??
          null,
        adminIdHash: adminId ? adminId.slice(0, 8) : undefined,
        action: status,
        timestamp: new Date().toISOString(),
      }),
    );
    return updated;
  }

  async setUserRole(userId: string, role: Role) {
    return this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  async softDeleteUser(userId: string) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.users.wipeUserProgressData(tx, userId);
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          isOnline: false,
          totalXp: 0,
          level: 1,
          coins: 0,
          loginStreakDays: 0,
          lastLoginEpochDay: 0,
          streakBonusTierClaimed: 0,
          dailyChestClaimedDay: 0,
          questProgress: Prisma.DbNull,
          achievementProgress: Prisma.DbNull,
        },
      });
    });
    return { deleted: true as const };
  }
}
