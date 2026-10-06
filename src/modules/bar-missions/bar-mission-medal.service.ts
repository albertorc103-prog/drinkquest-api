import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMissionMedalConditionMode,
  BarMissionMedalConditionType,
  BarMissionMedalVersionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import {
  BarFeature,
  barCustomMedalEnabledForPlan,
  normalizeSubscriptionPlan,
} from '../subscriptions/subscription-plan.util';
import { assertHealthyMissionCopy } from './bar-mission-templates';
import {
  UpdateBarMedalDto,
  UpsertBarMedalDto,
} from './dto/bar-mission-medal.dto';

const MAX_CONDITIONS = 10;
const EDITABLE: BarMissionMedalVersionStatus[] = [
  BarMissionMedalVersionStatus.DRAFT,
  BarMissionMedalVersionStatus.CHANGES_REQUESTED,
];

type ConditionInput = {
  type: BarMissionMedalConditionType;
  targetValue?: number;
  referenceId?: string;
};

/**
 * Semántica `currentMedalVersionId`:
 * versión más reciente de configuración/trabajo de la temporada
 * (DRAFT / PENDING_REVIEW / APPROVED / ACTIVE / …).
 * NO implica desbloqueable → buscar status=ACTIVE explícitamente.
 */
@Injectable()
export class BarMissionMedalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
  ) {}

  async getCurrent(ownerUserId: string, seasonId: string) {
    const { bar } = await this.assertOwnerFeature(ownerUserId);
    const season = await this.requireOwnedSeason(bar.id, seasonId);
    const version =
      (season.currentMedalVersionId
        ? await this.prisma.barMissionMedalVersion.findUnique({
            where: { id: season.currentMedalVersionId },
            include: { conditions: { orderBy: { position: 'asc' } } },
          })
        : null) ??
      (await this.prisma.barMissionMedalVersion.findFirst({
        where: { seasonId: season.id },
        orderBy: { version: 'desc' },
        include: { conditions: { orderBy: { position: 'asc' } } },
      }));
    if (!version) {
      return { seasonId: season.id, version: null };
    }
    return { seasonId: season.id, version: this.mapVersion(version) };
  }

  async listVersions(ownerUserId: string, seasonId: string) {
    const { bar } = await this.assertOwnerFeature(ownerUserId);
    await this.requireOwnedSeason(bar.id, seasonId);
    const rows = await this.prisma.barMissionMedalVersion.findMany({
      where: { seasonId },
      include: { conditions: { orderBy: { position: 'asc' } } },
      orderBy: { version: 'desc' },
    });
    return { items: rows.map((v) => this.mapVersion(v)) };
  }

  /** Crea DRAFT v1, o falla si ya hay versiones (usar createNextVersion). */
  async createDraft(ownerUserId: string, seasonId: string, dto: UpsertBarMedalDto) {
    const { bar } = await this.assertOwnerFeature(ownerUserId);
    const season = await this.requireOwnedSeason(bar.id, seasonId);
    const existing = await this.prisma.barMissionMedalVersion.count({
      where: { seasonId: season.id },
    });
    if (existing > 0) {
      throw new ConflictException(
        'Ya existe una versión de medalla. Edita el borrador o crea una nueva versión desde la última disponible.',
      );
    }
    const conditions = await this.validateConditions(season.id, bar.id, dto.conditions);
    this.validateCopy(dto.title, dto.description);

    const created = await this.prisma.$transaction(async (tx) => {
      const version = await tx.barMissionMedalVersion.create({
        data: {
          seasonId: season.id,
          version: 1,
          title: dto.title.trim(),
          description: dto.description.trim(),
          status: BarMissionMedalVersionStatus.DRAFT,
          conditionMode: dto.conditionMode ?? BarMissionMedalConditionMode.ALL,
          xpReward: 0,
          conditions: { create: this.toConditionCreates(conditions) },
        },
        include: { conditions: { orderBy: { position: 'asc' } } },
      });
      await tx.barMissionSeason.update({
        where: { id: season.id },
        data: {
          currentMedalVersionId: version.id,
          medalTitle: version.title,
          medalDescription: version.description,
        },
      });
      return version;
    });
    return this.mapVersion(created);
  }

  async updateDraft(
    ownerUserId: string,
    seasonId: string,
    versionId: string,
    dto: UpdateBarMedalDto,
  ) {
    const { bar } = await this.assertOwnerFeature(ownerUserId);
    const season = await this.requireOwnedSeason(bar.id, seasonId);
    const version = await this.requireOwnedVersion(season.id, versionId);
    if (!EDITABLE.includes(version.status)) {
      throw new BadRequestException('MEDAL_VERSION_NOT_EDITABLE');
    }

    const title = dto.title?.trim() ?? version.title;
    const description = dto.description?.trim() ?? version.description;
    this.validateCopy(title, description);
    const conditionMode = dto.conditionMode ?? version.conditionMode;
    const conditions = dto.conditions
      ? await this.validateConditions(season.id, bar.id, dto.conditions)
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (conditions) {
        await tx.barMissionMedalCondition.deleteMany({
          where: { medalVersionId: version.id },
        });
        await tx.barMissionMedalCondition.createMany({
          data: conditions.map((c, i) => ({
            medalVersionId: version.id,
            type: c.type,
            targetValue: c.targetValue,
            referenceId: c.referenceId,
            position: i,
          })),
        });
      }
      const row = await tx.barMissionMedalVersion.update({
        where: { id: version.id },
        data: { title, description, conditionMode },
        include: { conditions: { orderBy: { position: 'asc' } } },
      });
      await tx.barMissionSeason.update({
        where: { id: season.id },
        data: {
          currentMedalVersionId: row.id,
          medalTitle: row.title,
          medalDescription: row.description,
        },
      });
      return row;
    });
    return this.mapVersion(updated);
  }

  /** Nueva versión DRAFT desde la ACTIVE (o la más reciente si se indica). */
  async createNextVersion(ownerUserId: string, seasonId: string) {
    const { bar } = await this.assertOwnerFeature(ownerUserId);
    const season = await this.requireOwnedSeason(bar.id, seasonId);

    const source =
      (await this.prisma.barMissionMedalVersion.findFirst({
        where: { seasonId: season.id, status: BarMissionMedalVersionStatus.ACTIVE },
        include: { conditions: { orderBy: { position: 'asc' } } },
      })) ??
      (await this.prisma.barMissionMedalVersion.findFirst({
        where: { seasonId: season.id },
        orderBy: { version: 'desc' },
        include: { conditions: { orderBy: { position: 'asc' } } },
      }));
    if (!source) {
      throw new NotFoundException('No hay versión base para clonar.');
    }
    const openDraft = await this.prisma.barMissionMedalVersion.findFirst({
      where: {
        seasonId: season.id,
        status: {
          in: [
            BarMissionMedalVersionStatus.DRAFT,
            BarMissionMedalVersionStatus.CHANGES_REQUESTED,
            BarMissionMedalVersionStatus.PENDING_REVIEW,
            BarMissionMedalVersionStatus.APPROVED,
          ],
        },
      },
    });
    if (openDraft) {
      throw new BadRequestException(
        'Ya existe una versión en curso (DRAFT / PENDING_REVIEW / CHANGES_REQUESTED / APPROVED).',
      );
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const agg = await tx.barMissionMedalVersion.aggregate({
            where: { seasonId: season.id },
            _max: { version: true },
          });
          const nextVersion = (agg._max.version ?? 0) + 1;
          const version = await tx.barMissionMedalVersion.create({
            data: {
              seasonId: season.id,
              version: nextVersion,
              title: source.title,
              description: source.description,
              status: BarMissionMedalVersionStatus.DRAFT,
              conditionMode: source.conditionMode,
              xpReward: source.xpReward,
              templateId: source.templateId,
              designConfig: source.designConfig ?? Prisma.JsonNull,
              conditions: {
                create: source.conditions.map((c, i) => ({
                  type: c.type,
                  targetValue: c.targetValue,
                  referenceId: c.referenceId,
                  metadata: c.metadata ?? undefined,
                  position: i,
                })),
              },
            },
            include: { conditions: { orderBy: { position: 'asc' } } },
          });
          await tx.barMissionSeason.update({
            where: { id: season.id },
            data: { currentMedalVersionId: version.id },
          });
          return version;
        });
        return this.mapVersion(created);
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          attempt < 2
        ) {
          continue;
        }
        throw e;
      }
    }
    throw new ConflictException('No se pudo asignar número de versión.');
  }

  async submit(ownerUserId: string, seasonId: string, versionId: string) {
    const { bar } = await this.assertOwnerFeature(ownerUserId);
    const season = await this.requireOwnedSeason(bar.id, seasonId);
    const version = await this.requireOwnedVersion(season.id, versionId, true);
    if (
      version.status !== BarMissionMedalVersionStatus.DRAFT &&
      version.status !== BarMissionMedalVersionStatus.CHANGES_REQUESTED
    ) {
      throw new BadRequestException('INVALID_STATUS_TRANSITION');
    }
    if (version.conditions.length === 0) {
      throw new BadRequestException('MEDAL_CONDITIONS_REQUIRED');
    }
    this.validateCopy(version.title, version.description);
    await this.validateConditions(
      season.id,
      bar.id,
      version.conditions.map((c) => ({
        type: c.type,
        targetValue: c.targetValue ?? undefined,
        referenceId: c.referenceId ?? undefined,
      })),
    );

    const updated = await this.prisma.barMissionMedalVersion.update({
      where: { id: version.id },
      data: {
        status: BarMissionMedalVersionStatus.PENDING_REVIEW,
        submittedAt: new Date(),
        submittedByUserId: ownerUserId,
        reviewNote: null,
      },
      include: { conditions: { orderBy: { position: 'asc' } } },
    });
    await this.prisma.barMissionSeason.update({
      where: { id: season.id },
      data: { currentMedalVersionId: updated.id },
    });
    return this.mapVersion(updated);
  }

  mapVersion(version: {
    id: string;
    seasonId: string;
    version: number;
    title: string;
    description: string;
    status: BarMissionMedalVersionStatus;
    conditionMode: BarMissionMedalConditionMode;
    xpReward: number;
    templateId: string | null;
    designConfig: Prisma.JsonValue | null;
    reviewNote: string | null;
    moderatedByAdminId: string | null;
    moderatedAt: Date | null;
    submittedByUserId?: string | null;
    submittedAt: Date | null;
    approvedAt: Date | null;
    activatedAt: Date | null;
    disabledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    conditions: Array<{
      id: string;
      type: BarMissionMedalConditionType;
      targetValue: number | null;
      referenceId: string | null;
      position: number;
    }>;
  }) {
    return {
      id: version.id,
      seasonId: version.seasonId,
      version: version.version,
      title: version.title,
      description: version.description,
      status: version.status,
      conditionMode: version.conditionMode,
      xpReward: version.xpReward,
      templateId: version.templateId,
      designConfig: version.designConfig,
      reviewComment: version.reviewNote,
      moderatedByAdminId: version.moderatedByAdminId,
      moderatedAt: version.moderatedAt?.toISOString() ?? null,
      submittedByUserId: version.submittedByUserId ?? null,
      submittedAt: version.submittedAt?.toISOString() ?? null,
      approvedAt: version.approvedAt?.toISOString() ?? null,
      activatedAt: version.activatedAt?.toISOString() ?? null,
      disabledAt: version.disabledAt?.toISOString() ?? null,
      createdAt: version.createdAt.toISOString(),
      updatedAt: version.updatedAt.toISOString(),
      conditions: version.conditions.map((c) => ({
        id: c.id,
        type: c.type,
        targetValue: c.targetValue,
        referenceId: c.referenceId,
        position: c.position,
      })),
    };
  }

  private validateCopy(title: string, description: string) {
    const t = title.trim();
    const d = description.trim();
    if (t.length < 1 || t.length > 40) {
      throw new BadRequestException('El título debe tener entre 1 y 40 caracteres.');
    }
    if (d.length < 1 || d.length > 120) {
      throw new BadRequestException('La descripción debe tener entre 1 y 120 caracteres.');
    }
    try {
      assertHealthyMissionCopy(t, 'El título de la medalla');
      assertHealthyMissionCopy(d, 'La descripción de la medalla');
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Texto no permitido por políticas.',
      );
    }
  }

  private async validateConditions(
    seasonId: string,
    barId: string,
    conditions: ConditionInput[],
  ) {
    if (!conditions?.length) {
      throw new BadRequestException('MEDAL_CONDITIONS_REQUIRED');
    }
    if (conditions.length > MAX_CONDITIONS) {
      throw new BadRequestException(`Máximo ${MAX_CONDITIONS} condiciones.`);
    }

    const normalized: Array<{
      type: BarMissionMedalConditionType;
      targetValue: number | null;
      referenceId: string | null;
    }> = [];

    const missionIds = conditions
      .filter((c) => c.type === BarMissionMedalConditionType.MISSION_COMPLETED)
      .map((c) => c.referenceId)
      .filter((id): id is string => !!id);
    const missions =
      missionIds.length === 0
        ? []
        : await this.prisma.barMission.findMany({
            where: { id: { in: missionIds } },
            include: { season: { select: { id: true, barId: true } } },
          });
    const missionById = new Map(missions.map((m) => [m.id, m]));

    const seen = new Set<string>();
    for (const raw of conditions) {
      if (raw.type === BarMissionMedalConditionType.EVENT_PARTICIPATION) {
        throw new BadRequestException('UNSUPPORTED_CONDITION');
      }
      if (
        raw.type === BarMissionMedalConditionType.VISITS ||
        raw.type === BarMissionMedalConditionType.DRINKS_UNLOCKED
      ) {
        const target = raw.targetValue;
        if (target == null || !Number.isInteger(target) || target < 1) {
          throw new BadRequestException(`${raw.type} requiere targetValue >= 1`);
        }
        if (raw.referenceId) {
          throw new BadRequestException(`${raw.type} no admite referenceId`);
        }
        const key = `${raw.type}:${target}`;
        if (seen.has(key)) {
          throw new BadRequestException('Condición duplicada.');
        }
        seen.add(key);
        normalized.push({ type: raw.type, targetValue: target, referenceId: null });
        continue;
      }
      if (raw.type === BarMissionMedalConditionType.MISSION_COMPLETED) {
        if (!raw.referenceId) {
          throw new BadRequestException('MISSION_COMPLETED exige referenceId');
        }
        const mission = missionById.get(raw.referenceId);
        if (!mission || mission.season.id !== seasonId || mission.season.barId !== barId) {
          throw new BadRequestException('MISSION_NOT_OWNED_BY_BAR');
        }
        const key = `${raw.type}:${mission.id}`;
        if (seen.has(key)) {
          throw new BadRequestException('Condición duplicada.');
        }
        seen.add(key);
        normalized.push({
          type: raw.type,
          targetValue: 1,
          referenceId: mission.id,
        });
        continue;
      }
      throw new BadRequestException('UNSUPPORTED_CONDITION');
    }

    return normalized;
  }

  private toConditionCreates(
    conditions: Array<{
      type: BarMissionMedalConditionType;
      targetValue: number | null;
      referenceId: string | null;
    }>,
  ) {
    return conditions.map((c, i) => ({
      type: c.type,
      targetValue: c.targetValue,
      referenceId: c.referenceId,
      position: i,
    }));
  }

  private async assertOwnerFeature(ownerUserId: string) {
    const ctx = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    if (!this.barAccess.isSubscriptionActive(ctx)) {
      throw new ForbiddenException(
        'Tu suscripción no está activa. Renueva el plan para gestionar la medalla.',
      );
    }
    const plan = normalizeSubscriptionPlan(ctx.subscription?.plan);
    if (!barCustomMedalEnabledForPlan(plan)) {
      throw new ForbiddenException('ENTITLEMENT_REQUIRED');
    }
    return { bar: ctx.bar, plan, feature: BarFeature.BAR_CUSTOM_MEDAL };
  }

  private async requireOwnedSeason(barId: string, seasonId: string) {
    const season = await this.prisma.barMissionSeason.findFirst({
      where: { id: seasonId, barId, deletedAt: null },
    });
    if (!season) throw new NotFoundException('Temporada no encontrada.');
    return season;
  }

  private async requireOwnedVersion(seasonId: string, versionId: string, withConditions = false) {
    const version = await this.prisma.barMissionMedalVersion.findFirst({
      where: { id: versionId, seasonId },
      include: { conditions: { orderBy: { position: 'asc' as const } } },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    if (!withConditions) {
      // conditions always loaded; callers that don't need them ignore the field
    }
    return version;
  }
}
