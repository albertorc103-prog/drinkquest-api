import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMissionMedalConditionType,
  QrSessionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PLACE_VISIT_CONFIG } from '../place-visits/place-visit.config';
import { BarAccessService } from '../subscriptions/bar-access.service';
import {
  barCustomMedalEnabledForPlan,
  normalizeSubscriptionPlan,
} from '../subscriptions/subscription-plan.util';
import { BarMissionMedalActiveResolver } from './bar-mission-medal-active.resolver';

const TZ = PLACE_VISIT_CONFIG.VISIT_CALENDAR_TIMEZONE;

/**
 * Estadísticas agregadas FASE 7 (sin PII).
 *
 * Season metrics: totalUnlocked / trends (cualquier versión).
 * Current-version metrics: started / inProgress / conditionBreakdown (ACTIVE).
 *
 * averageProgress: pospuesto (requeriría ProgressService por usuario = N+1).
 *
 * Queries ~O(condiciones), no O(usuarios×ProgressService).
 */
@Injectable()
export class BarMissionMedalStatsService {
  private readonly logger = new Logger(BarMissionMedalStatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
    private readonly activeResolver: BarMissionMedalActiveResolver,
  ) {}

  async getSeasonStats(ownerUserId: string, seasonId: string) {
    const { bar } = await this.assertOwnerEntitlement(ownerUserId);
    const season = await this.prisma.barMissionSeason.findFirst({
      where: { id: seasonId, barId: bar.id, deletedAt: null },
      select: {
        id: true,
        barId: true,
        startsAt: true,
        endsAt: true,
        medalTitle: true,
      },
    });
    if (!season) throw new NotFoundException('Temporada no encontrada.');

    const active = await this.activeResolver.findActiveMedalVersionForSeason(season.id);
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 86_400_000);
    const d30 = new Date(now.getTime() - 30 * 86_400_000);

    const [totalUnlocked, unlocksLast7Days, unlocksLast30Days, unlockTrend] =
      await Promise.all([
        this.prisma.userBarMedal.count({ where: { seasonId: season.id } }),
        this.prisma.userBarMedal.count({
          where: { seasonId: season.id, unlockedAt: { gte: d7 } },
        }),
        this.prisma.userBarMedal.count({
          where: { seasonId: season.id, unlockedAt: { gte: d30 } },
        }),
        this.unlockTrend(season.id, d7),
      ]);

    const unlockedRows = await this.prisma.userBarMedal.findMany({
      where: { seasonId: season.id },
      select: { userId: true },
    });
    const unlockedSet = new Set(unlockedRows.map((r) => r.userId));

    let startedUsers = 0;
    let inProgressUsers = 0;
    let conditionBreakdown: Array<{
      type: BarMissionMedalConditionType;
      target: number | null;
      referenceId: string | null;
      missionTitle?: string | null;
      usersCompleted: number;
    }> = [];

    if (active) {
      const started = await this.collectStartedUserIds(
        season.barId,
        season.startsAt,
        season.endsAt,
        active.conditions,
      );
      startedUsers = started.size;
      inProgressUsers = [...started].filter((id) => !unlockedSet.has(id)).length;
      conditionBreakdown = await this.conditionBreakdown(
        season.barId,
        season.id,
        season.startsAt,
        season.endsAt,
        active.conditions,
      );
    }

    const completionRate =
      startedUsers === 0
        ? 0
        : Math.min(100, Math.round((totalUnlocked / startedUsers) * 10000) / 100);

    return {
      seasonId: season.id,
      medalVersionId: active?.id ?? null,
      medalTitle: active?.title ?? season.medalTitle,
      totalUnlocked,
      unlocksLast7Days,
      unlocksLast30Days,
      unlockTrend,
      startedUsers,
      inProgressUsers,
      completionRate,
      conditionBreakdown,
      averageProgress: null as null,
    };
  }

  private async assertOwnerEntitlement(ownerUserId: string) {
    const ctx = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    if (!this.barAccess.isSubscriptionActive(ctx)) {
      throw new ForbiddenException(
        'Tu suscripción no está activa. Renueva el plan para ver estadísticas.',
      );
    }
    const plan = normalizeSubscriptionPlan(ctx.subscription?.plan);
    if (!barCustomMedalEnabledForPlan(plan)) {
      throw new ForbiddenException('ENTITLEMENT_REQUIRED');
    }
    return { bar: ctx.bar, plan };
  }

  private async unlockTrend(seasonId: string, since: Date) {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
        SELECT
          ((unlocked_at AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date AS date,
          COUNT(*)::bigint AS count
        FROM user_bar_medals
        WHERE season_id = ${seasonId}::uuid
          AND unlocked_at >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `;
      return rows.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
        count: Number(r.count),
      }));
    } catch (err) {
      this.logger.warn(
        `unlockTrend fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
      const medals = await this.prisma.userBarMedal.findMany({
        where: { seasonId, unlockedAt: { gte: since } },
        select: { unlockedAt: true },
      });
      const map = new Map<string, number>();
      for (const m of medals) {
        const key = m.unlockedAt.toISOString().slice(0, 10);
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
    }
  }

  private async collectStartedUserIds(
    barId: string,
    startsAt: Date,
    endsAt: Date,
    conditions: Array<{ type: BarMissionMedalConditionType; referenceId: string | null }>,
  ): Promise<Set<string>> {
    const started = new Set<string>();
    const needsVisits = conditions.some((c) => c.type === BarMissionMedalConditionType.VISITS);
    const needsDrinks = conditions.some(
      (c) => c.type === BarMissionMedalConditionType.DRINKS_UNLOCKED,
    );
    const missionIds = conditions
      .filter((c) => c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId)
      .map((c) => c.referenceId!);

    const tasks: Promise<void>[] = [];
    if (needsVisits) {
      tasks.push(
        this.prisma.placeVisit
          .findMany({
            where: { barId, visitedAt: { gte: startsAt, lte: endsAt } },
            distinct: ['userId'],
            select: { userId: true },
          })
          .then((rows) => rows.forEach((r) => started.add(r.userId))),
      );
    }
    if (needsDrinks) {
      tasks.push(
        this.prisma.qrSession
          .findMany({
            where: {
              barId,
              status: QrSessionStatus.USED,
              usedAt: { gte: startsAt, lte: endsAt },
              scannedById: { not: null },
            },
            distinct: ['scannedById'],
            select: { scannedById: true },
          })
          .then((rows) =>
            rows.forEach((r) => {
              if (r.scannedById) started.add(r.scannedById);
            }),
          ),
      );
    }
    if (missionIds.length) {
      tasks.push(
        this.prisma.userBarMissionProgress
          .findMany({
            where: {
              missionId: { in: missionIds },
              OR: [{ progress: { gt: 0 } }, { completedAt: { not: null } }],
            },
            distinct: ['userId'],
            select: { userId: true },
          })
          .then((rows) => rows.forEach((r) => started.add(r.userId))),
      );
    }
    await Promise.all(tasks);
    return started;
  }

  private async conditionBreakdown(
    barId: string,
    seasonId: string,
    startsAt: Date,
    endsAt: Date,
    conditions: Array<{
      type: BarMissionMedalConditionType;
      targetValue: number | null;
      referenceId: string | null;
    }>,
  ) {
    const missionIds = conditions
      .filter((c) => c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId)
      .map((c) => c.referenceId!);
    const missions =
      missionIds.length === 0
        ? []
        : await this.prisma.barMission.findMany({
            where: { id: { in: missionIds }, seasonId },
            select: { id: true, title: true },
          });
    const missionTitle = new Map(missions.map((m) => [m.id, m.title]));

    const out: Array<{
      type: BarMissionMedalConditionType;
      target: number | null;
      referenceId: string | null;
      missionTitle?: string | null;
      usersCompleted: number;
    }> = [];

    for (const c of conditions) {
      if (c.type === BarMissionMedalConditionType.EVENT_PARTICIPATION) {
        out.push({
          type: c.type,
          target: c.targetValue,
          referenceId: c.referenceId,
          usersCompleted: 0,
        });
        continue;
      }
      if (c.type === BarMissionMedalConditionType.VISITS) {
        const target = Math.max(1, c.targetValue ?? 1);
        const grouped = await this.prisma.placeVisit.groupBy({
          by: ['userId'],
          where: { barId, visitedAt: { gte: startsAt, lte: endsAt } },
          _count: { _all: true },
        });
        out.push({
          type: c.type,
          target,
          referenceId: null,
          usersCompleted: grouped.filter((g) => g._count._all >= target).length,
        });
        continue;
      }
      if (c.type === BarMissionMedalConditionType.DRINKS_UNLOCKED) {
        const target = Math.max(1, c.targetValue ?? 1);
        out.push({
          type: c.type,
          target,
          referenceId: null,
          usersCompleted: await this.countUsersWithDistinctDrinks(
            barId,
            startsAt,
            endsAt,
            target,
          ),
        });
        continue;
      }
      if (c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId) {
        const usersCompleted = await this.prisma.userBarMissionProgress.count({
          where: { missionId: c.referenceId, completedAt: { not: null } },
        });
        out.push({
          type: c.type,
          target: 1,
          referenceId: c.referenceId,
          missionTitle: missionTitle.get(c.referenceId) ?? null,
          usersCompleted,
        });
      }
    }
    return out;
  }

  private async countUsersWithDistinctDrinks(
    barId: string,
    startsAt: Date,
    endsAt: Date,
    target: number,
  ): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(*)::bigint AS cnt FROM (
          SELECT scanned_by_id
          FROM qr_sessions
          WHERE bar_id = ${barId}::uuid
            AND status = 'USED'::"QrSessionStatus"
            AND used_at >= ${startsAt}
            AND used_at <= ${endsAt}
            AND scanned_by_id IS NOT NULL
          GROUP BY scanned_by_id
          HAVING COUNT(DISTINCT drink_id) >= ${target}
        ) t
      `;
      return Number(rows[0]?.cnt ?? 0);
    } catch {
      const sessions = await this.prisma.qrSession.findMany({
        where: {
          barId,
          status: QrSessionStatus.USED,
          usedAt: { gte: startsAt, lte: endsAt },
          scannedById: { not: null },
        },
        select: { scannedById: true, drinkId: true },
      });
      const byUser = new Map<string, Set<string>>();
      for (const s of sessions) {
        if (!s.scannedById) continue;
        if (!byUser.has(s.scannedById)) byUser.set(s.scannedById, new Set());
        byUser.get(s.scannedById)!.add(s.drinkId);
      }
      let n = 0;
      for (const set of byUser.values()) {
        if (set.size >= target) n += 1;
      }
      return n;
    }
  }
}
