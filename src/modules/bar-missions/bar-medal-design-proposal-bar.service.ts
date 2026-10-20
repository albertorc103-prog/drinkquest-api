import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMedalDesignProposalBatchStatus,
  BarMedalVisualMode,
  BarMissionMedalVersionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import { filterDesignProposalsForClientView } from './bar-medal-design-proposal-client.util';
import {
  BarFeature,
  barCustomMedalEnabledForPlan,
  normalizeSubscriptionPlan,
} from '../subscriptions/subscription-plan.util';

const VERSION_BLOCKS_SELECTION: BarMissionMedalVersionStatus[] = [
  BarMissionMedalVersionStatus.ACTIVE,
  BarMissionMedalVersionStatus.DISABLED,
  BarMissionMedalVersionStatus.REJECTED,
];

@Injectable()
export class BarMedalDesignProposalBarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
  ) {}

  async listSentProposals(ownerUserId: string, seasonId: string, versionId: string) {
    const { version } = await this.loadOwnedVersion(ownerUserId, seasonId, versionId);
    if (!version.usesDesignProposalFlow) {
      throw new BadRequestException('DESIGN_PROPOSAL_FLOW_NOT_ENABLED');
    }

    const batch = await this.prisma.barMedalDesignProposalBatch.findFirst({
      where: {
        medalVersionId: version.id,
        status: BarMedalDesignProposalBatchStatus.SENT,
      },
      orderBy: { sentAt: 'desc' },
      include: { proposals: { orderBy: { position: 'asc' } } },
    });
    if (!batch) {
      throw new NotFoundException('DESIGN_PROPOSAL_BATCH_NOT_AVAILABLE');
    }

    return this.mapBarResponse(version, batch);
  }

  async confirmSelection(
    ownerUserId: string,
    seasonId: string,
    versionId: string,
    proposalId: string,
  ) {
    const { version } = await this.loadOwnedVersion(ownerUserId, seasonId, versionId);
    this.assertVersionAllowsSelection(version);

    if (!version.usesDesignProposalFlow) {
      throw new BadRequestException('DESIGN_PROPOSAL_FLOW_NOT_ENABLED');
    }

    if (
      version.designSelectionConfirmedAt &&
      version.selectedProposalId === proposalId
    ) {
      return this.buildSelectionResult(version.id, proposalId);
    }
    if (version.designSelectionConfirmedAt) {
      throw new BadRequestException('DESIGN_SELECTION_ALREADY_CONFIRMED');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.barMissionMedalVersion.findFirst({
          where: { id: versionId, seasonId },
        });
        if (!current) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');

        if (
          current.designSelectionConfirmedAt &&
          current.selectedProposalId === proposalId
        ) {
          return this.buildSelectionResultFromRow(current);
        }
        if (current.designSelectionConfirmedAt) {
          throw new BadRequestException('DESIGN_SELECTION_ALREADY_CONFIRMED');
        }

        const proposal = await tx.barMedalDesignProposal.findUnique({
          where: { id: proposalId },
          include: { batch: true },
        });
        if (
          !proposal ||
          proposal.batch.medalVersionId !== versionId ||
          proposal.batch.status !== BarMedalDesignProposalBatchStatus.SENT
        ) {
          throw new NotFoundException('DESIGN_PROPOSAL_NOT_FOUND');
        }

        const asset = await tx.uploadAsset.findUnique({
          where: { id: proposal.artworkAssetId },
        });
        if (!asset || asset.id !== proposal.artworkAssetId) {
          throw new BadRequestException('DESIGN_PROPOSAL_ASSET_INVALID');
        }
        if (asset.publicUrl?.trim() !== proposal.imageUrl.trim()) {
          throw new BadRequestException('DESIGN_PROPOSAL_ASSET_INVALID');
        }

        const confirmedAt = new Date();
        const updated = await tx.barMissionMedalVersion.updateMany({
          where: {
            id: versionId,
            designSelectionConfirmedAt: null,
            selectedProposalId: null,
          },
          data: {
            selectedProposalId: proposal.id,
            designSelectionConfirmedAt: confirmedAt,
            visualMode: BarMedalVisualMode.ADMIN_ARTWORK,
            artworkAssetId: proposal.artworkAssetId,
            artworkUrl: proposal.imageUrl,
          },
        });

        if (updated.count === 0) {
          const again = await tx.barMissionMedalVersion.findUnique({
            where: { id: versionId },
          });
          if (
            again?.designSelectionConfirmedAt &&
            again.selectedProposalId === proposalId
          ) {
            return this.buildSelectionResultFromRow(again);
          }
          throw new ConflictException('DESIGN_SELECTION_CONFLICT');
        }

        const row = await tx.barMissionMedalVersion.findUnique({
          where: { id: versionId },
        });
        return this.buildSelectionResultFromRow(row!);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('DESIGN_SELECTION_CONFLICT');
      }
      throw e;
    }
  }

  private async loadOwnedVersion(
    ownerUserId: string,
    seasonId: string,
    versionId: string,
  ) {
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

    const season = await this.prisma.barMissionSeason.findFirst({
      where: { id: seasonId, barId: ctx.bar.id, deletedAt: null },
    });
    if (!season) throw new NotFoundException('Temporada no encontrada.');

    const version = await this.prisma.barMissionMedalVersion.findFirst({
      where: { id: versionId, seasonId: season.id },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');

    return { bar: ctx.bar, season, version };
  }

  private assertVersionAllowsSelection(version: {
    status: BarMissionMedalVersionStatus;
  }) {
    if (VERSION_BLOCKS_SELECTION.includes(version.status)) {
      throw new BadRequestException('MEDAL_VERSION_NOT_ELIGIBLE_FOR_SELECTION');
    }
  }

  private mapBarResponse(
    version: {
      id: string;
      selectedProposalId: string | null;
      designSelectionConfirmedAt: Date | null;
    },
    batch: {
      id: string;
      status: BarMedalDesignProposalBatchStatus;
      sentAt: Date | null;
      proposals: Array<{
        id: string;
        position: number;
        imageUrl: string;
      }>;
    },
  ) {
    const allProposals = batch.proposals.map((p) => ({
      id: p.id,
      position: p.position,
      imageUrl: p.imageUrl,
      selected: version.selectedProposalId === p.id,
    }));
    const visible = filterDesignProposalsForClientView(allProposals, version, false).map((p) => ({
      ...p,
      selected: true,
    }));

    return {
      medalVersionId: version.id,
      batch: {
        id: batch.id,
        status: batch.status,
        sentAt: batch.sentAt?.toISOString() ?? null,
      },
      selection: {
        confirmed: version.designSelectionConfirmedAt != null,
        confirmedAt: version.designSelectionConfirmedAt?.toISOString() ?? null,
        selectedProposalId: version.selectedProposalId,
      },
      proposals: visible,
    };
  }

  private async buildSelectionResult(versionId: string, proposalId: string) {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    const proposal = await this.prisma.barMedalDesignProposal.findUnique({
      where: { id: proposalId },
    });
    return {
      medalVersionId: version.id,
      selectedProposalId: version.selectedProposalId,
      designSelectionConfirmedAt: version.designSelectionConfirmedAt?.toISOString() ?? null,
      visualMode: version.visualMode,
      artworkUrl: version.artworkUrl,
      proposal: proposal
        ? { id: proposal.id, position: proposal.position, imageUrl: proposal.imageUrl }
        : null,
      idempotent: true,
    };
  }

  private buildSelectionResultFromRow(version: {
    id: string;
    selectedProposalId: string | null;
    designSelectionConfirmedAt: Date | null;
    visualMode: BarMedalVisualMode;
    artworkUrl: string | null;
  }) {
    return {
      medalVersionId: version.id,
      selectedProposalId: version.selectedProposalId,
      designSelectionConfirmedAt: version.designSelectionConfirmedAt?.toISOString() ?? null,
      visualMode: version.visualMode,
      artworkUrl: version.artworkUrl,
      idempotent: false,
    };
  }
}
