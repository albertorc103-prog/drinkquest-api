import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMedalVisualMode,
  BarMissionMedalConditionType,
  BarMissionMedalVersionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveDesignConfigForClient } from './bar-medal-design-config';
import {
  activateApprovedMedalVersionInTx,
  loadVersionForActivation,
} from './bar-mission-medal-activate.util';
import { notifyBarLegendMedalEvent } from './bar-mission-medal-bar-notify.util';
import {
  appendModerationAuditEvent,
  extractModerationAudit,
} from './bar-mission-medal-moderation-audit.util';
import { evaluateLegendMedalOperational } from './bar-mission-medal-legend-operational.util';
import {
  assertDesignProposalReadyForModeration,
  assertDirectArtworkAllowed,
} from './bar-medal-design-proposal-flow.util';
import { assertArtworkReadyForPublish } from './bar-medal-visual.util';
import { AdminBarMedalDesignProposalService } from './admin-bar-medal-design-proposal.service';
import { BarMissionMedalService } from './bar-mission-medal.service';

const XP_MAX = 500;

const ARTWORK_EDITABLE: BarMissionMedalVersionStatus[] = [
  BarMissionMedalVersionStatus.DRAFT,
  BarMissionMedalVersionStatus.CHANGES_REQUESTED,
  BarMissionMedalVersionStatus.PENDING_REVIEW,
  BarMissionMedalVersionStatus.APPROVED,
];

export type AdminMedalOfficeBucket = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

@Injectable()
export class AdminBarMissionMedalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medals: BarMissionMedalService,
    private readonly designProposals: AdminBarMedalDesignProposalService,
    private readonly notifications: NotificationsService,
  ) {}

  createDesignProposalBatch(versionId: string, adminId: string) {
    return this.designProposals.createBatch(versionId, adminId);
  }

  getDesignProposalBatch(versionId: string, includeAuditProposals = false) {
    return this.designProposals.getBatchForVersion(versionId, includeAuditProposals);
  }

  assignDesignProposal(
    versionId: string,
    batchId: string,
    position: number,
    adminId: string,
    artworkAssetId: string,
  ) {
    return this.designProposals.assignProposal(
      versionId,
      batchId,
      position,
      adminId,
      artworkAssetId,
    );
  }

  sendDesignProposalBatch(versionId: string, batchId: string, adminId: string) {
    return this.designProposals.sendBatch(versionId, batchId, adminId);
  }

  /**
   * Vista simplificada ADMIN: un expediente por bar (Pendientes / Activas / Suspendidas).
   */
  async listOffice(params: {
    bucket: AdminMedalOfficeBucket;
    barId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const now = new Date();

    const rows = await this.prisma.barMissionMedalVersion.findMany({
      where: {
        ...(params.barId ? { season: { barId: params.barId } } : {}),
        season: { deletedAt: null },
        status: {
          in: [
            BarMissionMedalVersionStatus.PENDING_REVIEW,
            BarMissionMedalVersionStatus.APPROVED,
            BarMissionMedalVersionStatus.ACTIVE,
          ],
        },
      },
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
                subscription: {
                  select: {
                    plan: true,
                    status: true,
                    trialEndsAt: true,
                    currentPeriodEnd: true,
                    canceledAt: true,
                    qrEnabled: true,
                    promoEnabled: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    type Row = (typeof rows)[number];
    const byBar = new Map<string, Row>();

    const bucketOf = (row: Row): AdminMedalOfficeBucket | null => {
      if (
        row.status === BarMissionMedalVersionStatus.PENDING_REVIEW ||
        row.status === BarMissionMedalVersionStatus.APPROVED
      ) {
        return 'PENDING';
      }
      if (row.status === BarMissionMedalVersionStatus.ACTIVE) {
        const legend = evaluateLegendMedalOperational(
      row.season.bar.subscription as Parameters<typeof evaluateLegendMedalOperational>[0],
    );
        return legend.operational ? 'ACTIVE' : 'SUSPENDED';
      }
      return null;
    };

    const priority = (row: Row): number => {
      if (row.status === BarMissionMedalVersionStatus.ACTIVE) return 100;
      if (row.status === BarMissionMedalVersionStatus.PENDING_REVIEW) return 80;
      if (row.status === BarMissionMedalVersionStatus.APPROVED) return 70;
      return 0;
    };

    for (const row of rows) {
      const bucket = bucketOf(row);
      if (!bucket) continue;
      const barId = row.season.bar.id;
      const existing = byBar.get(barId);
      if (!existing || priority(row) > priority(existing)) {
        byBar.set(barId, row);
      } else if (
        existing &&
        priority(row) === priority(existing) &&
        row.updatedAt > existing.updatedAt
      ) {
        byBar.set(barId, row);
      }
    }

    const filtered = [...byBar.values()].filter((r) => bucketOf(r) === params.bucket);
    filtered.sort((a, b) => {
      const ta = a.submittedAt?.getTime() ?? a.updatedAt.getTime();
      const tb = b.submittedAt?.getTime() ?? b.updatedAt.getTime();
      return tb - ta;
    });

    const total = filtered.length;
    const slice = filtered.slice((page - 1) * limit, page * limit);

    return {
      page,
      limit,
      total,
      bucket: params.bucket,
      items: slice.map((row) => {
        const legend = evaluateLegendMedalOperational(
          row.season.bar.subscription as Parameters<typeof evaluateLegendMedalOperational>[0],
          now,
        );
        return {
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
          officeBucket: bucketOf(row),
          legendMedalOperational: legend.operational,
          subscriptionSuspended: legend.subscriptionSuspended,
          suspensionMessage: legend.suspensionMessage,
        };
      }),
    };
  }

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

    const legend = evaluateLegendMedalOperational(
      row.season.bar.subscription as Parameters<typeof evaluateLegendMedalOperational>[0],
    );
    const mapped = this.medals.mapVersion(row);
    return {
      ...mapped,
      moderationHistory: extractModerationAudit(row.designConfig),
      legendMedalOperational: legend.operational,
      subscriptionSuspended: legend.subscriptionSuspended,
      suspensionMessage: legend.suspensionMessage,
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
    if (version.usesDesignProposalFlow) {
      await assertDesignProposalReadyForModeration(this.prisma, version);
    } else {
      const mode = version.visualMode ?? BarMedalVisualMode.BUILDER_V1;
      if (mode === BarMedalVisualMode.ADMIN_ARTWORK) {
        assertArtworkReadyForPublish(version);
      } else {
        const { designConfigValid } = resolveDesignConfigForClient(version.designConfig);
        if (!designConfigValid) {
          throw new BadRequestException('INVALID_DESIGN_CONFIG');
        }
      }
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

  /**
   * Asigna artwork administrativo a una versión editable.
   * Congela URL + assetId en la versión (snapshot). ACTIVE no es mutable.
   */
  async setArtwork(
    versionId: string,
    adminId: string,
    body: { artworkAssetId?: string; artworkUrl?: string },
  ) {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
      include: { conditions: { orderBy: { position: 'asc' } } },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    if (!ARTWORK_EDITABLE.includes(version.status)) {
      throw new BadRequestException('MEDAL_ARTWORK_NOT_EDITABLE');
    }
    assertDirectArtworkAllowed(version);

    let artworkAssetId: string | null = null;
    let artworkUrl: string | null = null;

    if (body.artworkAssetId) {
      const asset = await this.prisma.uploadAsset.findUnique({
        where: { id: body.artworkAssetId },
      });
      if (!asset || asset.ownerUserId !== adminId) {
        throw new BadRequestException('ARTWORK_ASSET_NOT_OWNED');
      }
      if (asset.folder !== 'medals' && asset.folder !== 'promotions') {
        throw new BadRequestException('ARTWORK_FOLDER_INVALID');
      }
      artworkAssetId = asset.id;
      artworkUrl = asset.publicUrl;
    } else if (body.artworkUrl?.trim()) {
      const url = body.artworkUrl.trim();
      const asset = await this.prisma.uploadAsset.findFirst({
        where: { ownerUserId: adminId, publicUrl: url },
      });
      if (!asset) {
        throw new BadRequestException('ARTWORK_ASSET_NOT_OWNED');
      }
      artworkAssetId = asset.id;
      artworkUrl = asset.publicUrl;
    } else {
      throw new BadRequestException('ARTWORK_REQUIRED');
    }

    const updated = await this.prisma.barMissionMedalVersion.update({
      where: { id: version.id },
      data: {
        visualMode: BarMedalVisualMode.ADMIN_ARTWORK,
        artworkAssetId,
        artworkUrl,
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
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
    return this.applyCorrectionRequired(versionId, adminId, reason, 'CHANGES_REQUESTED');
  }

  /**
   * Rechazo de moderación → corrección requerida (misma versión, sin tarjeta REJECTED en cola).
   * REJECTED terminal queda reservado a bloqueos administrativos explícitos (disable/legacy).
   */
  async reject(versionId: string, adminId: string, reason: string) {
    return this.applyCorrectionRequired(versionId, adminId, reason, 'CORRECTION_REQUIRED');
  }

  private async applyCorrectionRequired(
    versionId: string,
    adminId: string,
    reason: string,
    auditAction: 'CHANGES_REQUESTED' | 'CORRECTION_REQUIRED',
  ) {
    const comment = reason.trim();
    if (comment.length < 3) {
      throw new BadRequestException('El comentario es obligatorio.');
    }
    const version = await this.requirePending(versionId);
    const season = await this.prisma.barMissionSeason.findUnique({
      where: { id: version.seasonId },
      select: { barId: true },
    });
    if (!season) throw new NotFoundException('Temporada no encontrada.');

    const designConfig = appendModerationAuditEvent(version.designConfig, {
      action: auditAction,
      adminId,
      reason: comment,
    });

    const updated = await this.prisma.barMissionMedalVersion.update({
      where: { id: version.id },
      data: {
        status: BarMissionMedalVersionStatus.CHANGES_REQUESTED,
        reviewNote: comment,
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
        designConfig,
      },
      include: { conditions: { orderBy: { position: 'asc' } } },
    });

    await notifyBarLegendMedalEvent(this.notifications, season.barId, 'correction_required', {
      versionId: version.id,
      reason: comment,
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

  async approveAndActivate(versionId: string, adminId: string) {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
      include: { conditions: { orderBy: { position: 'asc' } } },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    if (version.status !== BarMissionMedalVersionStatus.PENDING_REVIEW) {
      throw new BadRequestException('INVALID_STATUS_TRANSITION');
    }
    await this.assertReadyForApproval(version);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const loaded = await loadVersionForActivation(tx, versionId);
        if (loaded.status !== BarMissionMedalVersionStatus.PENDING_REVIEW) {
          throw new BadRequestException('INVALID_STATUS_TRANSITION');
        }
        await this.assertReadyForApproval(loaded);

        const auditDesign = appendModerationAuditEvent(loaded.designConfig, {
          action: 'APPROVED',
          adminId,
        });
        await tx.barMissionMedalVersion.update({
          where: { id: versionId },
          data: {
            status: BarMissionMedalVersionStatus.APPROVED,
            approvedAt: new Date(),
            reviewNote: null,
            designConfig: auditDesign,
          },
        });

        return activateApprovedMedalVersionInTx(tx, {
          versionId,
          adminId,
          subscription: loaded.season.bar.subscription,
          season: loaded.season,
          designConfig: auditDesign,
          auditAction: 'APPROVE_AND_ACTIVATE',
        });
      });

      const season = await this.prisma.barMissionSeason.findUnique({
        where: { id: updated.seasonId },
        select: { barId: true },
      });
      if (season) {
        await notifyBarLegendMedalEvent(
          this.notifications,
          season.barId,
          'approved_activated',
          { versionId: updated.id },
        );
      }
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

  async activate(versionId: string, adminId: string) {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    if (version.status !== BarMissionMedalVersionStatus.APPROVED) {
      throw new BadRequestException('INVALID_STATUS_TRANSITION');
    }
    if (version.usesDesignProposalFlow) {
      await assertDesignProposalReadyForModeration(this.prisma, version);
    } else {
      assertArtworkReadyForPublish(version);
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const loaded = await loadVersionForActivation(tx, versionId);
        return activateApprovedMedalVersionInTx(tx, {
          versionId,
          adminId,
          subscription: loaded.season.bar.subscription,
          season: loaded.season,
          designConfig: loaded.designConfig,
          auditAction: 'ACTIVATED',
        });
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

  private async assertReadyForApproval(version: {
    id: string;
    conditions: Array<{ type: BarMissionMedalConditionType }>;
    usesDesignProposalFlow: boolean;
    visualMode: BarMedalVisualMode | null;
    designConfig: Prisma.JsonValue | null;
    artworkUrl: string | null;
    artworkAssetId: string | null;
    selectedProposalId: string | null;
    designSelectionConfirmedAt: Date | null;
  }) {
    if (
      version.conditions.some(
        (c) => c.type === BarMissionMedalConditionType.EVENT_PARTICIPATION,
      )
    ) {
      throw new BadRequestException('UNSUPPORTED_CONDITION');
    }
    if (version.usesDesignProposalFlow) {
      await assertDesignProposalReadyForModeration(
        this.prisma,
        version as Parameters<typeof assertDesignProposalReadyForModeration>[1],
      );
    } else {
      const mode = version.visualMode ?? BarMedalVisualMode.BUILDER_V1;
      if (mode === BarMedalVisualMode.ADMIN_ARTWORK) {
        assertArtworkReadyForPublish(version);
      } else {
        const { designConfigValid } = resolveDesignConfigForClient(version.designConfig);
        if (!designConfigValid) {
          throw new BadRequestException('INVALID_DESIGN_CONFIG');
        }
      }
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
