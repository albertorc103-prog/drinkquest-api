import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BarMissionMedalConditionType,
  BarMissionSeasonStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { mapMedalVisualFields } from './bar-medal-visual.util';
import { BarMissionMedalActiveResolver } from './bar-mission-medal-active.resolver';
import { BarMissionMedalProgressService } from './bar-mission-medal-progress.service';

function publicVisual(version: {
  designConfig?: unknown;
  visualMode?: import('@prisma/client').BarMedalVisualMode | null;
  artworkUrl?: string | null;
} | null) {
  return mapMedalVisualFields({
    designConfig: version?.designConfig ?? null,
    visualMode: version?.visualMode,
    artworkUrl: version?.artworkUrl,
  });
}

/**
 * APIs de lectura FASE 7: medalla pública, progreso por bar, historial usuario.
 * Reutiliza ProgressService / ActiveResolver (sin recalcular condiciones).
 */
@Injectable()
export class BarMissionMedalPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activeResolver: BarMissionMedalActiveResolver,
    private readonly medalProgress: BarMissionMedalProgressService,
  ) {}

  /** GET /bars/:barId/medal — solo versión ACTIVE. */
  async getPublicBarMedal(barId: string) {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!bar) throw new NotFoundException('Bar no encontrado.');

    const season = await this.resolveVisibleSeason(barId);
    if (!season) {
      return { available: false as const };
    }

    const active = await this.activeResolver.findActiveMedalVersionForSeason(season.id);
    if (!active) {
      return { available: false as const };
    }

    const missionIds = active.conditions
      .filter((c) => c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId)
      .map((c) => c.referenceId!);
    const missions =
      missionIds.length === 0
        ? []
        : await this.prisma.barMission.findMany({
            where: { id: { in: missionIds }, seasonId: season.id },
            select: { id: true, title: true, description: true },
          });
    const missionById = new Map(missions.map((m) => [m.id, m]));

    return {
      available: true as const,
      barId,
      seasonId: season.id,
      medalVersionId: active.id,
      title: active.title,
      description: active.description,
      xpReward: active.xpReward,
      conditionMode: active.conditionMode,
      templateId: active.templateId,
      ...publicVisual(active),
      conditions: active.conditions.map((c) => ({
        type: c.type,
        target: c.targetValue,
        referenceId: c.referenceId,
        mission:
          c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId
            ? missionById.get(c.referenceId) ?? null
            : null,
      })),
    };
  }

  /** GET /bars/:barId/medal/progress — fachada por barId. */
  async getProgressByBarId(userId: string, barId: string) {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!bar) throw new NotFoundException('Bar no encontrado.');

    const earned = await this.prisma.userBarMedal.findFirst({
      where: { userId, barId },
      orderBy: { unlockedAt: 'desc' },
      select: { seasonId: true },
    });

    const season =
      (earned
        ? await this.prisma.barMissionSeason.findFirst({
            where: { id: earned.seasonId, deletedAt: null },
            select: { id: true },
          })
        : null) ?? (await this.resolveVisibleSeason(barId));

    if (!season) {
      return { available: false as const, unlocked: false, overallProgress: 0 };
    }

    const progress = await this.medalProgress.getSeasonMedalProgress(userId, season.id);
    if (progress.status === 'NO_ACTIVE_MEDAL' && !progress.unlocked) {
      return { available: false as const, unlocked: false, overallProgress: 0 };
    }

    let xpReward: number | null = null;
    let versionRow: {
      xpReward: number;
      designConfig: unknown;
      templateId: string | null;
      visualMode: import('@prisma/client').BarMedalVisualMode;
      artworkUrl: string | null;
    } | null = null;
    const versionId = progress.earnedMedalVersionId ?? progress.medalVersionId;
    if (versionId) {
      versionRow = await this.prisma.barMissionMedalVersion.findUnique({
        where: { id: versionId },
        select: {
          xpReward: true,
          designConfig: true,
          templateId: true,
          visualMode: true,
          artworkUrl: true,
        },
      });
      xpReward = versionRow?.xpReward ?? null;
    }

    const missionIds = progress.conditions
      .filter((c) => c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId)
      .map((c) => c.referenceId!);
    const missions =
      missionIds.length === 0
        ? []
        : await this.prisma.barMission.findMany({
            where: { id: { in: missionIds } },
            select: { id: true, title: true, description: true },
          });
    const missionById = new Map(missions.map((m) => [m.id, m]));

    return {
      available: true as const,
      seasonId: progress.seasonId,
      unlocked: progress.unlocked,
      unlockedAt: progress.unlockedAt,
      medalVersionId: progress.earnedMedalVersionId ?? progress.medalVersionId,
      title: progress.title,
      description: progress.description,
      xpReward,
      overallProgress: progress.overallProgress,
      conditionMode: progress.conditionMode,
      eligibleToUnlock: progress.eligibleToUnlock,
      templateId: versionRow?.templateId ?? null,
      ...publicVisual(versionRow),
      conditions: progress.conditions.map((c) => ({
        type: c.type,
        current: c.current,
        target: c.target,
        progress: c.progress,
        completed: c.completed,
        referenceId: c.referenceId,
        mission:
          c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId
            ? missionById.get(c.referenceId) ?? null
            : null,
      })),
    };
  }

  async listMyBarMedals(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const where = { userId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.userBarMedal.count({ where }),
      this.prisma.userBarMedal.findMany({
        where,
        include: {
          bar: {
            select: { id: true, businessName: true, logoUrl: true, slug: true },
          },
          season: {
            select: { id: true, medalTitle: true, medalDescription: true },
          },
          medalVersion: {
            select: {
              id: true,
              title: true,
              description: true,
              xpReward: true,
              templateId: true,
              designConfig: true,
              visualMode: true,
              artworkUrl: true,
            },
          },
        },
        orderBy: { unlockedAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    return {
      page: safePage,
      limit: safeLimit,
      total,
      items: rows.map((m) => {
        const legacy = !m.medalVersionId;
        return {
          userBarMedalId: m.id,
          medalVersionId: m.medalVersionId,
          title: m.medalVersion?.title ?? m.season.medalTitle,
          description: m.medalVersion?.description ?? m.season.medalDescription,
          barId: m.bar.id,
          barName: m.bar.businessName,
          barLogoUrl: m.bar.logoUrl,
          templateId: m.medalVersion?.templateId ?? null,
          ...publicVisual(m.medalVersion),
          xpReward: m.medalVersion?.xpReward ?? 0,
          unlockedAt: m.unlockedAt.toISOString(),
          seasonId: m.season.id,
          ...(legacy ? { legacy: true } : {}),
        };
      }),
    };
  }

  async getMyBarMedalDetail(userId: string, userBarMedalId: string) {
    const medal = await this.prisma.userBarMedal.findUnique({
      where: { id: userBarMedalId },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            logoUrl: true,
            slug: true,
            bannerUrl: true,
          },
        },
        season: {
          select: {
            id: true,
            title: true,
            medalTitle: true,
            medalDescription: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
        },
        medalVersion: {
          include: { conditions: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!medal || medal.userId !== userId) {
      throw new NotFoundException('Medalla no encontrada.');
    }

    const legacy = !medal.medalVersionId;
    const rawConditions = medal.medalVersion?.conditions ?? [];
    const missionIds = rawConditions
      .filter((c) => c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId)
      .map((c) => c.referenceId!);
    const missions =
      missionIds.length === 0
        ? []
        : await this.prisma.barMission.findMany({
            where: { id: { in: missionIds } },
            select: { id: true, title: true, description: true },
          });
    const missionById = new Map(missions.map((m) => [m.id, m]));

    return {
      userBarMedalId: medal.id,
      unlockedAt: medal.unlockedAt.toISOString(),
      legacy,
      bar: medal.bar,
      season: {
        id: medal.season.id,
        title: medal.season.title,
        startsAt: medal.season.startsAt.toISOString(),
        endsAt: medal.season.endsAt.toISOString(),
        status: medal.season.status,
      },
      medalVersionId: medal.medalVersionId,
      title: medal.medalVersion?.title ?? medal.season.medalTitle,
      description: medal.medalVersion?.description ?? medal.season.medalDescription,
      xpReward: medal.medalVersion?.xpReward ?? 0,
      conditionMode: medal.medalVersion?.conditionMode ?? null,
      templateId: medal.medalVersion?.templateId ?? null,
      ...publicVisual(medal.medalVersion),
      conditions: rawConditions.map((c) => ({
        id: c.id,
        type: c.type,
        targetValue: c.targetValue,
        referenceId: c.referenceId,
        position: c.position,
        mission:
          c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId
            ? missionById.get(c.referenceId) ?? null
            : null,
      })),
    };
  }

  private async resolveVisibleSeason(barId: string) {
    const now = new Date();
    return this.prisma.barMissionSeason.findFirst({
      where: {
        barId,
        deletedAt: null,
        status: BarMissionSeasonStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      select: { id: true, barId: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: 'desc' },
    });
  }
}
