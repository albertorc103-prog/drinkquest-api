import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMissionMedalConditionType,
  BarMissionMedalVersionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarMissionMedalService } from './bar-mission-medal.service';

const XP_MAX = 500;

@Injectable()
export class AdminBarMissionMedalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medals: BarMissionMedalService,
  ) {}

  async list(params: {
    /** Omitido o PENDING_REVIEW por defecto. "ALL" = sin filtro de status. */
    status?: BarMissionMedalVersionStatus | 'ALL';
    barId?: string;
    seasonId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const statusFilter =
      params.status === 'ALL'
        ? undefined
        : (params.status ?? BarMissionMedalVersionStatus.PENDING_REVIEW);
    const where: Prisma.BarMissionMedalVersionWhereInput = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(params.seasonId ? { seasonId: params.seasonId } : {}),
      ...(params.barId ? { season: { barId: params.barId } } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.barMissionMedalVersion.count({ where }),
      this.prisma.barMissionMedalVersion.findMany({
        where,
        include: {
          conditions: { orderBy: { position: 'asc' } },
          season: {
            include: {
              bar: {
                select: {
                  id: true,
                  businessName: true,
                  slug: true,
                  logoUrl: true,
                  subscription: { select: { plan: true, status: true } },
                },
              },
            },
          },
        },
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: rows.map((row) => ({
        ...this.medals.mapVersion(row),
        conditionCount: row.conditions.length,
        bar: this.mapBarSummary(row.season.bar),
        season: {
          id: row.season.id,
          title: row.season.title,
          status: row.season.status,
          startsAt: row.season.startsAt.toISOString(),
          endsAt: row.season.endsAt.toISOString(),
        },
      })),
    };
  }

  async getDetail(versionId: string) {
    const row = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
      include: {
        conditions: { orderBy: { position: 'asc' } },
        season: {
          include: {
            bar: {
              select: {
                id: true,
                businessName: true,
                slug: true,
                logoUrl: true,
                subscription: { select: { plan: true, status: true } },
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');

    const missionIds = row.conditions
      .filter(
        (c) =>
          c.type === BarMissionMedalConditionType.MISSION_COMPLETED &&
          typeof c.referenceId === 'string' &&
          c.referenceId.length > 0,
      )
      .map((c) => c.referenceId!);
    const missions =
      missionIds.length === 0
        ? []
        : await this.prisma.barMission.findMany({
            where: { id: { in: missionIds }, seasonId: row.seasonId },
            select: { id: true, title: true },
          });
    const missionTitleById = new Map(missions.map((m) => [m.id, m.title]));

    const activeSibling = await this.prisma.barMissionMedalVersion.findFirst({
      where: {
        seasonId: row.seasonId,
        status: BarMissionMedalVersionStatus.ACTIVE,
        NOT: { id: row.id },
      },
      select: { id: true, version: true, title: true },
    });

    const mapped = this.medals.mapVersion(row);
    return {
      ...mapped,
      conditions: mapped.conditions.map((c) => ({
        ...c,
        missionTitle:
          c.type === BarMissionMedalConditionType.MISSION_COMPLETED && c.referenceId
            ? (missionTitleById.get(c.referenceId) ?? null)
            : null,
        unsupported: c.type === BarMissionMedalConditionType.EVENT_PARTICIPATION,
      })),
      hasUnsupportedCondition: mapped.conditions.some(
        (c) => c.type === BarMissionMedalConditionType.EVENT_PARTICIPATION,
      ),
      activeVersion: activeSibling
        ? {
            id: activeSibling.id,
            version: activeSibling.version,
            title: activeSibling.title,
          }
        : null,
      bar: this.mapBarSummary(row.season.bar),
      season: {
        id: row.season.id,
        title: row.season.title,
        status: row.season.status,
        startsAt: row.season.startsAt.toISOString(),
        endsAt: row.season.endsAt.toISOString(),
      },
    };
  }

  async approve(versionId: string, adminId: string) {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
      include: { conditions: { orderBy: { position: 'asc' } } },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    if (version.status !== BarMissionMedalVersionStatus.PENDING_REVIEW) {
      throw new BadRequestException('INVALID_STATUS_TRANSITION');
    }
    if (
      version.conditions.some(
        (c) => c.type === BarMissionMedalConditionType.EVENT_PARTICIPATION,
      )
    ) {
      throw new BadRequestException('UNSUPPORTED_CONDITION');
    }
    const updated = await this.prisma.barMissionMedalVersion.update({
      where: { id: version.id },
      data: {
        status: BarMissionMedalVersionStatus.APPROVED,
        approvedAt: new Date(),
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
        reviewNote: null,
      },
      include: { conditions: { orderBy: { position: 'asc' } } },
    });
    return this.medals.mapVersion(updated);
  }

  private mapBarSummary(bar: {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
    subscription?: { plan: string; status: string } | null;
  }) {
    return {
      id: bar.id,
      businessName: bar.businessName,
      slug: bar.slug,
      logoUrl: bar.logoUrl,
      subscriptionPlan: bar.subscription?.plan ?? null,
      subscriptionStatus: bar.subscription?.status ?? null,
    };
  }

  async requestChanges(versionId: string, adminId: string, reason: string) {
    const comment = reason.trim();
    if (comment.length < 3) {
      throw new BadRequestException('El comentario es obligatorio.');
    }
    const version = await this.requirePending(versionId);
    const updated = await this.prisma.barMissionMedalVersion.update({
      where: { id: version.id },
      data: {
        status: BarMissionMedalVersionStatus.CHANGES_REQUESTED,
        reviewNote: comment,
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
      },
      include: { conditions: { orderBy: { position: 'asc' } } },
    });
    return this.medals.mapVersion(updated);
  }

  async reject(versionId: string, adminId: string, reason: string) {
    const comment = reason.trim();
    if (comment.length < 3) {
      throw new BadRequestException('El comentario es obligatorio.');
    }
    const version = await this.requirePending(versionId);
    const updated = await this.prisma.barMissionMedalVersion.update({
      where: { id: version.id },
      data: {
        status: BarMissionMedalVersionStatus.REJECTED,
        reviewNote: comment,
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
      },
      include: { conditions: { orderBy: { position: 'asc' } } },
    });
    return this.medals.mapVersion(updated);
  }

  async setReward(versionId: string, xpReward: number) {
    if (!Number.isInteger(xpReward) || xpReward < 0 || xpReward > XP_MAX) {
      throw new BadRequestException(`xpReward debe estar entre 0 y ${XP_MAX}.`);
    }
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    if (version.status === BarMissionMedalVersionStatus.ACTIVE) {
      throw new BadRequestException('No se puede cambiar XP de una versión ACTIVE.');
    }
    if (version.status === BarMissionMedalVersionStatus.DISABLED) {
      throw new BadRequestException('No se puede cambiar XP de una versión DISABLED.');
    }
    if (version.status === BarMissionMedalVersionStatus.REJECTED) {
      throw new BadRequestException('No se puede cambiar XP de una versión REJECTED.');
    }
    const updated = await this.prisma.barMissionMedalVersion.update({
      where: { id: version.id },
      data: { xpReward },
      include: { conditions: { orderBy: { position: 'asc' } } },
    });
    return this.medals.mapVersion(updated);
  }

  async activate(versionId: string, adminId: string) {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    if (version.status !== BarMissionMedalVersionStatus.APPROVED) {
      throw new BadRequestException('INVALID_STATUS_TRANSITION');
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        await tx.barMissionMedalVersion.updateMany({
          where: {
            seasonId: version.seasonId,
            status: BarMissionMedalVersionStatus.ACTIVE,
            id: { not: version.id },
          },
          data: {
            status: BarMissionMedalVersionStatus.DISABLED,
            disabledAt: now,
          },
        });
        const active = await tx.barMissionMedalVersion.update({
          where: { id: version.id },
          data: {
            status: BarMissionMedalVersionStatus.ACTIVE,
            activatedAt: now,
            moderatedByAdminId: adminId,
            moderatedAt: now,
          },
          include: { conditions: { orderBy: { position: 'asc' } } },
        });
        await tx.barMissionSeason.update({
          where: { id: version.seasonId },
          data: {
            currentMedalVersionId: active.id,
            medalTitle: active.title,
            medalDescription: active.description,
          },
        });
        return active;
      });
      return this.medals.mapVersion(updated);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          'Ya existe otra versión ACTIVE para esta temporada. Reintenta.',
        );
      }
      throw e;
    }
  }

  async disable(versionId: string, adminId: string) {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    if (version.status !== BarMissionMedalVersionStatus.ACTIVE) {
      throw new BadRequestException('INVALID_STATUS_TRANSITION');
    }
    const updated = await this.prisma.barMissionMedalVersion.update({
      where: { id: version.id },
      data: {
        status: BarMissionMedalVersionStatus.DISABLED,
        disabledAt: new Date(),
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
      },
      include: { conditions: { orderBy: { position: 'asc' } } },
    });
    return this.medals.mapVersion(updated);
  }

  private async requirePending(versionId: string) {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    if (version.status !== BarMissionMedalVersionStatus.PENDING_REVIEW) {
      throw new BadRequestException('INVALID_STATUS_TRANSITION');
    }
    return version;
  }
}
