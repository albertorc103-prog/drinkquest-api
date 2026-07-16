import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMissionSeasonStatus,
  BarMissionTemplate,
  NotificationType,
  SubscriptionPlan,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import {
  barMissionsEnabledForPlan,
  normalizeSubscriptionPlan,
} from '../subscriptions/subscription-plan.util';
import {
  assertHealthyMissionCopy,
  resolveTemplate,
} from './bar-mission-templates';
import {
  CreateBarMissionSeasonDto,
  UpdateBarMissionSeasonDto,
} from './dto/bar-mission-season.dto';

@Injectable()
export class BarMissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async listTemplates() {
    return Object.values(BarMissionTemplate).map((t) => resolveTemplate(t));
  }

  async listSeasonsForOwner(ownerUserId: string) {
    const { bar } = await this.assertOwnerLegend(ownerUserId);
    const seasons = await this.prisma.barMissionSeason.findMany({
      where: { barId: bar.id, deletedAt: null },
      include: { missions: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return { items: seasons.map((s) => this.mapSeason(s)) };
  }

  async createSeason(ownerUserId: string, dto: CreateBarMissionSeasonDto) {
    const { bar } = await this.assertOwnerLegend(ownerUserId);
    this.validateSeasonCopy(dto.title, dto.medalTitle, dto.medalDescription);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!(startsAt < endsAt)) {
      throw new BadRequestException('La fecha de fin debe ser posterior al inicio.');
    }
    const missionDefs = this.resolveMissionDefs(dto.missions.map((m) => m.template));

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.activate) {
        await tx.barMissionSeason.updateMany({
          where: {
            barId: bar.id,
            deletedAt: null,
            status: BarMissionSeasonStatus.ACTIVE,
          },
          data: { status: BarMissionSeasonStatus.ENDED },
        });
      }

      return tx.barMissionSeason.create({
        data: {
          barId: bar.id,
          title: dto.title.trim(),
          startsAt,
          endsAt,
          status: dto.activate
            ? BarMissionSeasonStatus.ACTIVE
            : BarMissionSeasonStatus.DRAFT,
          medalTitle: dto.medalTitle.trim(),
          medalDescription: dto.medalDescription.trim(),
          missions: {
            create: missionDefs.map((m, index) => ({
              template: m.template,
              title: m.title,
              description: m.description,
              targetCount: m.targetCount,
              sortOrder: index,
            })),
          },
        },
        include: { missions: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return this.mapSeason(created);
  }

  async updateSeason(
    ownerUserId: string,
    seasonId: string,
    dto: UpdateBarMissionSeasonDto,
  ) {
    const { bar } = await this.assertOwnerLegend(ownerUserId);
    const season = await this.requireOwnedSeason(bar.id, seasonId);
    if (season.status === BarMissionSeasonStatus.ENDED) {
      throw new BadRequestException('No se puede editar una temporada finalizada.');
    }
    if (season.status === BarMissionSeasonStatus.ACTIVE && dto.missions) {
      throw new BadRequestException(
        'No se pueden cambiar las misiones de una temporada activa. Finalízala y crea otra.',
      );
    }

    const title = dto.title?.trim() ?? season.title;
    const medalTitle = dto.medalTitle?.trim() ?? season.medalTitle;
    const medalDescription =
      dto.medalDescription?.trim() ?? season.medalDescription;
    this.validateSeasonCopy(title, medalTitle, medalDescription);

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : season.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : season.endsAt;
    if (!(startsAt < endsAt)) {
      throw new BadRequestException('La fecha de fin debe ser posterior al inicio.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.missions && season.status === BarMissionSeasonStatus.DRAFT) {
        const missionDefs = this.resolveMissionDefs(
          dto.missions.map((m) => m.template),
        );
        await tx.barMission.deleteMany({ where: { seasonId: season.id } });
        await tx.barMission.createMany({
          data: missionDefs.map((m, index) => ({
            seasonId: season.id,
            template: m.template,
            title: m.title,
            description: m.description,
            targetCount: m.targetCount,
            sortOrder: index,
          })),
        });
      }

      return tx.barMissionSeason.update({
        where: { id: season.id },
        data: {
          title,
          medalTitle,
          medalDescription,
          startsAt,
          endsAt,
        },
        include: { missions: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return this.mapSeason(updated);
  }

  async activateSeason(ownerUserId: string, seasonId: string) {
    const { bar } = await this.assertOwnerLegend(ownerUserId);
    const season = await this.requireOwnedSeason(bar.id, seasonId);
    if (season.status === BarMissionSeasonStatus.ENDED) {
      throw new BadRequestException('La temporada ya finalizó.');
    }
    if (season.missions.length !== 3) {
      throw new BadRequestException('La temporada debe tener exactamente 3 misiones.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.barMissionSeason.updateMany({
        where: {
          barId: bar.id,
          deletedAt: null,
          status: BarMissionSeasonStatus.ACTIVE,
          id: { not: season.id },
        },
        data: { status: BarMissionSeasonStatus.ENDED },
      });
      return tx.barMissionSeason.update({
        where: { id: season.id },
        data: { status: BarMissionSeasonStatus.ACTIVE },
        include: { missions: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    return this.mapSeason(updated);
  }

  async endSeason(ownerUserId: string, seasonId: string) {
    const { bar } = await this.assertOwnerLegend(ownerUserId);
    const season = await this.requireOwnedSeason(bar.id, seasonId);
    const updated = await this.prisma.barMissionSeason.update({
      where: { id: season.id },
      data: { status: BarMissionSeasonStatus.ENDED },
      include: { missions: { orderBy: { sortOrder: 'asc' } } },
    });
    return this.mapSeason(updated);
  }

  /** Feed de usuario: temporadas activas vigentes, agrupadas por bar. */
  async listActiveForUser(userId: string) {
    const now = new Date();
    const seasons = await this.prisma.barMissionSeason.findMany({
      where: {
        deletedAt: null,
        status: BarMissionSeasonStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gte: now },
        bar: {
          deletedAt: null,
          isActive: true,
          subscription: { plan: SubscriptionPlan.LEGEND },
        },
      },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            bannerUrl: true,
          },
        },
        missions: { orderBy: { sortOrder: 'asc' } },
        medalUnlocks: { where: { userId }, take: 1 },
      },
      orderBy: { startsAt: 'desc' },
    });

    const missionIds = seasons.flatMap((s) => s.missions.map((m) => m.id));
    const progressRows =
      missionIds.length === 0
        ? []
        : await this.prisma.userBarMissionProgress.findMany({
            where: { userId, missionId: { in: missionIds } },
          });
    const progressByMission = new Map(
      progressRows.map((p) => [p.missionId, p] as const),
    );

    return {
      items: seasons.map((season) => {
        const missions = season.missions.map((m) => {
          const p = progressByMission.get(m.id);
          const progress = p?.progress ?? 0;
          const completed = !!p?.completedAt || progress >= m.targetCount;
          return {
            id: m.id,
            template: m.template,
            title: m.title,
            description: m.description,
            targetCount: m.targetCount,
            sortOrder: m.sortOrder,
            progress: Math.min(progress, m.targetCount),
            completed,
            completedAt: p?.completedAt?.toISOString() ?? null,
          };
        });
        const completedCount = missions.filter((m) => m.completed).length;
        const medalUnlocked = season.medalUnlocks.length > 0;
        return {
          seasonId: season.id,
          title: season.title,
          startsAt: season.startsAt.toISOString(),
          endsAt: season.endsAt.toISOString(),
          medalTitle: season.medalTitle,
          medalDescription: season.medalDescription,
          medalUnlocked,
          completedMissions: completedCount,
          totalMissions: missions.length,
          bar: {
            id: season.bar.id,
            businessName: season.bar.businessName,
            slug: season.bar.slug,
            logoUrl: season.bar.logoUrl,
            bannerUrl: season.bar.bannerUrl,
          },
          missions,
        };
      }),
    };
  }

  /** Tras canje QR: actualiza progreso de misiones activas del bar. */
  async onQrUnlock(userId: string, barId: string) {
    const now = new Date();
    const season = await this.prisma.barMissionSeason.findFirst({
      where: {
        barId,
        deletedAt: null,
        status: BarMissionSeasonStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: { missions: true },
    });
    if (!season || season.missions.length === 0) return;

    const unlocks = await this.prisma.userDrinkUnlock.findMany({
      where: {
        userId,
        barId,
        unlockedAt: { gte: season.startsAt, lte: season.endsAt },
      },
      select: { drinkId: true, unlockedAt: true },
      orderBy: { unlockedAt: 'asc' },
    });

    for (const mission of season.missions) {
      const value = this.computeProgress(mission.template, unlocks);
      const completed = value >= mission.targetCount;
      await this.prisma.userBarMissionProgress.upsert({
        where: {
          userId_missionId: { userId, missionId: mission.id },
        },
        create: {
          userId,
          missionId: mission.id,
          progress: Math.min(value, mission.targetCount),
          completedAt: completed ? now : null,
        },
        update: {
          progress: Math.min(value, mission.targetCount),
          completedAt: completed ? now : null,
        },
      });
    }

    await this.maybeUnlockMedal(userId, season.id, barId, season.missions.length);
  }

  private async maybeUnlockMedal(
    userId: string,
    seasonId: string,
    barId: string,
    totalMissions: number,
  ) {
    const completed = await this.prisma.userBarMissionProgress.count({
      where: {
        userId,
        completedAt: { not: null },
        mission: { seasonId },
      },
    });
    if (completed < totalMissions) return;

    const existing = await this.prisma.userBarMedal.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });
    if (existing) return;

    const season = await this.prisma.barMissionSeason.findUnique({
      where: { id: seasonId },
      include: { bar: { select: { businessName: true } } },
    });
    if (!season) return;

    await this.prisma.userBarMedal.create({
      data: { userId, barId, seasonId },
    });

    await this.notifications.create(
      userId,
      NotificationType.SYSTEM,
      `Medalla de ${season.bar.businessName}`,
      `Desbloqueaste «${season.medalTitle}» completando las 3 misiones del local.`,
      { barId, seasonId, category: 'bar_medal' },
    );
  }

  private computeProgress(
    template: BarMissionTemplate,
    unlocks: { drinkId: string; unlockedAt: Date }[],
  ): number {
    switch (template) {
      case BarMissionTemplate.SCAN_ONCE:
        return unlocks.length > 0 ? 1 : 0;
      case BarMissionTemplate.SCAN_TWO_DRINKS: {
        const drinks = new Set(unlocks.map((u) => u.drinkId));
        return drinks.size;
      }
      case BarMissionTemplate.SCAN_TWO_DAYS: {
        const days = new Set(
          unlocks.map((u) => u.unlockedAt.toISOString().slice(0, 10)),
        );
        return days.size;
      }
      default:
        return 0;
    }
  }

  private resolveMissionDefs(templates: BarMissionTemplate[]) {
    if (templates.length !== 3) {
      throw new BadRequestException('Debes configurar exactamente 3 misiones.');
    }
    const unique = new Set(templates);
    if (unique.size !== 3) {
      throw new BadRequestException(
        'Las 3 misiones deben usar plantillas distintas.',
      );
    }
    return templates.map((t) => resolveTemplate(t));
  }

  private validateSeasonCopy(
    title: string,
    medalTitle: string,
    medalDescription: string,
  ) {
    try {
      assertHealthyMissionCopy(title, 'El título de la temporada');
      assertHealthyMissionCopy(medalTitle, 'El título de la medalla');
      assertHealthyMissionCopy(medalDescription, 'La descripción de la medalla');
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Texto no permitido por políticas.',
      );
    }
  }

  private mapSeason(season: {
    id: string;
    barId: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    status: BarMissionSeasonStatus;
    medalTitle: string;
    medalDescription: string;
    createdAt: Date;
    updatedAt: Date;
    missions: Array<{
      id: string;
      template: BarMissionTemplate;
      title: string;
      description: string;
      targetCount: number;
      sortOrder: number;
    }>;
  }) {
    return {
      id: season.id,
      barId: season.barId,
      title: season.title,
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      status: season.status,
      medalTitle: season.medalTitle,
      medalDescription: season.medalDescription,
      createdAt: season.createdAt.toISOString(),
      updatedAt: season.updatedAt.toISOString(),
      missions: season.missions.map((m) => ({
        id: m.id,
        template: m.template,
        title: m.title,
        description: m.description,
        targetCount: m.targetCount,
        sortOrder: m.sortOrder,
      })),
    };
  }

  private async assertOwnerLegend(ownerUserId: string) {
    const ctx = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    if (!this.barAccess.isSubscriptionActive(ctx)) {
      throw new ForbiddenException(
        'Tu suscripción no está activa. Renueva el plan para gestionar misiones del local.',
      );
    }
    const plan = normalizeSubscriptionPlan(ctx.subscription?.plan);
    if (!barMissionsEnabledForPlan(plan)) {
      throw new ForbiddenException(
        'Las misiones del local y la medalla son exclusivas del plan Legend.',
      );
    }
    return { bar: ctx.bar, plan };
  }

  private async requireOwnedSeason(barId: string, seasonId: string) {
    const season = await this.prisma.barMissionSeason.findFirst({
      where: { id: seasonId, barId, deletedAt: null },
      include: { missions: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!season) throw new NotFoundException('Temporada no encontrada.');
    return season;
  }
}
