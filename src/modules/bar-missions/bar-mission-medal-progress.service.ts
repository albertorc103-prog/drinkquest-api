import { Injectable } from '@nestjs/common';
import {
  BarMissionMedalConditionMode,
  BarMissionMedalConditionType,
  QrSessionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  ActiveMedalVersionWithConditions,
  BarMissionMedalActiveResolver,
} from './bar-mission-medal-active.resolver';

export type MedalConditionProgress = {
  id: string;
  type: BarMissionMedalConditionType;
  current: number;
  target: number;
  progress: number;
  completed: boolean;
  referenceId: string | null;
  unsupported?: boolean;
};

export type MedalProgressState = {
  seasonId: string;
  status: 'UNLOCKED' | 'IN_PROGRESS' | 'NO_ACTIVE_MEDAL';
  medalVersionId: string | null;
  earnedMedalVersionId: string | null;
  unlocked: boolean;
  unlockedAt: string | null;
  eligibleToUnlock: boolean;
  conditionMode: BarMissionMedalConditionMode | null;
  overallProgress: number;
  title: string | null;
  description: string | null;
  conditions: MedalConditionProgress[];
};

type SeasonWindow = {
  id: string;
  barId: string;
  startsAt: Date;
  endsAt: Date;
  medalTitle: string;
  medalDescription: string;
};

type ConditionRow = ActiveMedalVersionWithConditions['conditions'][number];

/**
 * Motor central de progreso/evaluación de medallas de local (FASE 4).
 * Scope temporal = [season.startsAt, season.endsAt] (no activatedAt de la versión).
 */
@Injectable()
export class BarMissionMedalProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activeResolver: BarMissionMedalActiveResolver,
  ) {}

  async evaluateVersion(
    userId: string,
    medalVersionId: string,
  ): Promise<MedalProgressState> {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: medalVersionId },
      include: {
        conditions: { orderBy: { position: 'asc' } },
        season: {
          select: {
            id: true,
            barId: true,
            startsAt: true,
            endsAt: true,
            medalTitle: true,
            medalDescription: true,
          },
        },
      },
    });
    if (!version) {
      return this.emptyState(null, 'NO_ACTIVE_MEDAL');
    }
    return this.buildEvaluation(userId, version.season, version);
  }

  async getSeasonMedalProgress(
    userId: string,
    seasonId: string,
  ): Promise<MedalProgressState> {
    const season = await this.prisma.barMissionSeason.findFirst({
      where: { id: seasonId, deletedAt: null },
      select: {
        id: true,
        barId: true,
        startsAt: true,
        endsAt: true,
        medalTitle: true,
        medalDescription: true,
      },
    });
    if (!season) {
      return this.emptyState(seasonId, 'NO_ACTIVE_MEDAL');
    }

    const earned = await this.prisma.userBarMedal.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
      include: {
        medalVersion: {
          include: { conditions: { orderBy: { position: 'asc' } } },
        },
      },
    });

    if (earned) {
      return this.mapUnlocked(season, earned);
    }

    const active = await this.activeResolver.findActiveMedalVersionForSeason(seasonId);
    if (!active) {
      return this.emptyState(seasonId, 'NO_ACTIVE_MEDAL');
    }
    return this.buildEvaluation(userId, season, active);
  }

  /** Elegibilidad pura (sin crear unlock). */
  async isEligibleToUnlock(userId: string, seasonId: string): Promise<{
    eligible: boolean;
    activeVersion: ActiveMedalVersionWithConditions | null;
  }> {
    const existing = await this.prisma.userBarMedal.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
      select: { id: true },
    });
    if (existing) {
      return { eligible: false, activeVersion: null };
    }
    const active = await this.activeResolver.findActiveMedalVersionForSeason(seasonId);
    if (!active) {
      return { eligible: false, activeVersion: null };
    }
    const season = await this.prisma.barMissionSeason.findFirst({
      where: { id: seasonId, deletedAt: null },
      select: {
        id: true,
        barId: true,
        startsAt: true,
        endsAt: true,
        medalTitle: true,
        medalDescription: true,
      },
    });
    if (!season) {
      return { eligible: false, activeVersion: null };
    }
    const state = await this.buildEvaluation(userId, season, active);
    return { eligible: state.eligibleToUnlock, activeVersion: active };
  }

  private async buildEvaluation(
    userId: string,
    season: SeasonWindow,
    version: ActiveMedalVersionWithConditions & {
      title: string;
      description: string;
      conditionMode: BarMissionMedalConditionMode;
    },
  ): Promise<MedalProgressState> {
    const conditions = await this.evaluateConditions(
      userId,
      season,
      version.conditions,
    );
    const { overallProgress, eligibleToUnlock } = this.combine(
      version.conditionMode,
      conditions,
    );
    return {
      seasonId: season.id,
      status: 'IN_PROGRESS',
      medalVersionId: version.id,
      earnedMedalVersionId: null,
      unlocked: false,
      unlockedAt: null,
      eligibleToUnlock,
      conditionMode: version.conditionMode,
      overallProgress,
      title: version.title,
      description: version.description,
      conditions,
    };
  }

  private mapUnlocked(
    season: SeasonWindow,
    earned: {
      medalVersionId: string | null;
      unlockedAt: Date;
      medalVersion: (ActiveMedalVersionWithConditions & {
        title: string;
        description: string;
        conditionMode: BarMissionMedalConditionMode;
      }) | null;
    },
  ): MedalProgressState {
    const version = earned.medalVersion;
    const conditions =
      version?.conditions.map((c) => ({
        id: c.id,
        type: c.type,
        current: c.targetValue ?? 1,
        target: c.type === BarMissionMedalConditionType.MISSION_COMPLETED ? 1 : (c.targetValue ?? 1),
        progress: 100,
        completed: true,
        referenceId: c.referenceId,
      })) ?? [];

    return {
      seasonId: season.id,
      status: 'UNLOCKED',
      medalVersionId: earned.medalVersionId,
      earnedMedalVersionId: earned.medalVersionId,
      unlocked: true,
      unlockedAt: earned.unlockedAt.toISOString(),
      eligibleToUnlock: false,
      conditionMode: version?.conditionMode ?? null,
      overallProgress: 100,
      title: version?.title ?? season.medalTitle,
      description: version?.description ?? season.medalDescription,
      conditions,
    };
  }

  private emptyState(
    seasonId: string | null,
    status: 'NO_ACTIVE_MEDAL',
  ): MedalProgressState {
    return {
      seasonId: seasonId ?? '',
      status,
      medalVersionId: null,
      earnedMedalVersionId: null,
      unlocked: false,
      unlockedAt: null,
      eligibleToUnlock: false,
      conditionMode: null,
      overallProgress: 0,
      title: null,
      description: null,
      conditions: [],
    };
  }

  private async evaluateConditions(
    userId: string,
    season: SeasonWindow,
    conditions: ConditionRow[],
  ): Promise<MedalConditionProgress[]> {
    const visitNeeded = conditions.some(
      (c) => c.type === BarMissionMedalConditionType.VISITS,
    );
    const drinksNeeded = conditions.some(
      (c) => c.type === BarMissionMedalConditionType.DRINKS_UNLOCKED,
    );
    const missionIds = conditions
      .filter((c) => c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId)
      .map((c) => c.referenceId!);

    const [visitCount, distinctDrinks, missionProgress] = await Promise.all([
      visitNeeded
        ? this.prisma.placeVisit.count({
            where: {
              userId,
              barId: season.barId,
              visitedAt: { gte: season.startsAt, lte: season.endsAt },
            },
          })
        : Promise.resolve(0),
      drinksNeeded
        ? this.countDistinctDrinksViaQr(userId, season)
        : Promise.resolve(0),
      missionIds.length
        ? this.prisma.userBarMissionProgress.findMany({
            where: {
              userId,
              missionId: { in: missionIds },
              completedAt: { not: null },
              mission: { seasonId: season.id },
            },
            select: { missionId: true },
          })
        : Promise.resolve([] as { missionId: string }[]),
    ]);

    const completedMissions = new Set(missionProgress.map((p) => p.missionId));

    return conditions.map((c) =>
      this.resolveCondition(c, {
        visitCount,
        distinctDrinks,
        completedMissions,
      }),
    );
  }

  /**
   * CASO A: QrSession USED es procedencia autoritativa
   * (userId=scannedById, barId, drinkId, usedAt).
   * COUNT DISTINCT drinkId — no BarMenuItem actual.
   */
  private async countDistinctDrinksViaQr(userId: string, season: SeasonWindow) {
    const rows = await this.prisma.qrSession.findMany({
      where: {
        scannedById: userId,
        barId: season.barId,
        status: QrSessionStatus.USED,
        usedAt: { gte: season.startsAt, lte: season.endsAt },
      },
      select: { drinkId: true },
      distinct: ['drinkId'],
    });
    return rows.length;
  }

  private resolveCondition(
    condition: ConditionRow,
    ctx: {
      visitCount: number;
      distinctDrinks: number;
      completedMissions: Set<string>;
    },
  ): MedalConditionProgress {
    switch (condition.type) {
      case BarMissionMedalConditionType.VISITS: {
        const target = Math.max(1, condition.targetValue ?? 1);
        const current = ctx.visitCount;
        return this.numericProgress(condition, current, target);
      }
      case BarMissionMedalConditionType.DRINKS_UNLOCKED: {
        const target = Math.max(1, condition.targetValue ?? 1);
        const current = ctx.distinctDrinks;
        return this.numericProgress(condition, current, target);
      }
      case BarMissionMedalConditionType.MISSION_COMPLETED: {
        const done =
          !!condition.referenceId && ctx.completedMissions.has(condition.referenceId);
        return {
          id: condition.id,
          type: condition.type,
          current: done ? 1 : 0,
          target: 1,
          progress: done ? 100 : 0,
          completed: done,
          referenceId: condition.referenceId,
        };
      }
      case BarMissionMedalConditionType.EVENT_PARTICIPATION:
      default:
        return {
          id: condition.id,
          type: condition.type,
          current: 0,
          target: 1,
          progress: 0,
          completed: false,
          referenceId: condition.referenceId,
          unsupported: true,
        };
    }
  }

  private numericProgress(
    condition: ConditionRow,
    current: number,
    target: number,
  ): MedalConditionProgress {
    const ratio = Math.min(current / target, 1);
    return {
      id: condition.id,
      type: condition.type,
      current,
      target,
      progress: ratio * 100,
      completed: current >= target,
      referenceId: condition.referenceId,
    };
  }

  private combine(
    mode: BarMissionMedalConditionMode,
    conditions: MedalConditionProgress[],
  ): { overallProgress: number; eligibleToUnlock: boolean } {
    if (conditions.length === 0) {
      return { overallProgress: 0, eligibleToUnlock: false };
    }
    const hasUnsupported = conditions.some((c) => c.unsupported);
    const ratios = conditions.map((c) => Math.min(c.progress / 100, 1));

    if (mode === BarMissionMedalConditionMode.ANY) {
      const maxRatio = Math.max(...ratios);
      // Fail-closed: cualquier unsupported bloquea elegibilidad también en ANY.
      if (hasUnsupported) {
        return {
          overallProgress: this.formatOverall(maxRatio, false),
          eligibleToUnlock: false,
        };
      }
      const eligibleAny = conditions.some((c) => c.completed);
      return {
        overallProgress: this.formatOverall(maxRatio, eligibleAny),
        eligibleToUnlock: eligibleAny,
      };
    }

    // ALL — EVENT_PARTICIPATION (unsupported) bloquea elegibilidad
    const allComplete =
      !hasUnsupported && conditions.every((c) => c.completed && !c.unsupported);
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    return {
      overallProgress: this.formatOverall(avg, allComplete),
      eligibleToUnlock: allComplete,
    };
  }

  /** Nunca devolver 100 si no está completo (evita redondeo engañoso). */
  private formatOverall(ratio: number, fullyComplete: boolean): number {
    if (fullyComplete) return 100;
    const pct = ratio * 100;
    if (pct >= 100) return 99.99;
    return Math.round(pct * 100) / 100;
  }
}
