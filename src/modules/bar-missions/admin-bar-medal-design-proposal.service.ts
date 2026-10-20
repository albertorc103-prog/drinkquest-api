import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMedalDesignProposalBatchStatus,
  BarMissionMedalVersionStatus,
  Prisma,
  SubscriptionPlan,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UPLOAD_SIZE_LIMITS } from '../uploads/upload-mime.util';
import {
  barCustomMedalEnabledForPlan,
  normalizeSubscriptionPlan,
} from '../subscriptions/subscription-plan.util';

const PROPOSAL_POSITIONS = [1, 2, 3, 4, 5] as const;
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const VERSION_BLOCKS_PROPOSALS: BarMissionMedalVersionStatus[] = [
  BarMissionMedalVersionStatus.ACTIVE,
  BarMissionMedalVersionStatus.DISABLED,
  BarMissionMedalVersionStatus.REJECTED,
];

const OPEN_BATCH_STATUSES: BarMedalDesignProposalBatchStatus[] = [
  BarMedalDesignProposalBatchStatus.DRAFT,
  BarMedalDesignProposalBatchStatus.SENT,
];

@Injectable()
export class AdminBarMedalDesignProposalService {
  constructor(private readonly prisma: PrismaService) {}

  async createBatch(versionId: string, adminId: string) {
    const version = await this.loadVersionContext(versionId);
    this.assertVersionAllowsProposalWorkflow(version);
    if (version.designSelectionConfirmedAt) {
      throw new BadRequestException('DESIGN_SELECTION_ALREADY_CONFIRMED');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const open = await tx.barMedalDesignProposalBatch.findFirst({
          where: {
            medalVersionId: versionId,
            status: { in: OPEN_BATCH_STATUSES },
          },
        });
        if (open) {
          throw new ConflictException('DESIGN_PROPOSAL_BATCH_ALREADY_OPEN');
        }

        await tx.barMissionMedalVersion.update({
          where: { id: versionId },
          data: { usesDesignProposalFlow: true },
        });

        const batch = await tx.barMedalDesignProposalBatch.create({
          data: {
            medalVersionId: versionId,
            status: BarMedalDesignProposalBatchStatus.DRAFT,
            createdByAdminId: adminId,
          },
          include: { proposals: { orderBy: { position: 'asc' } } },
        });
        return this.mapBatchResponse(batch);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('DESIGN_PROPOSAL_BATCH_ALREADY_OPEN');
      }
      throw e;
    }
  }

  async getBatchForVersion(versionId: string) {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
      select: { id: true },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');

    const batch = await this.prisma.barMedalDesignProposalBatch.findFirst({
      where: {
        medalVersionId: versionId,
        status: { in: OPEN_BATCH_STATUSES },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { proposals: { orderBy: { position: 'asc' } } },
    });
    if (!batch) {
      return { batch: null, proposals: [] as const };
    }
    return this.mapBatchResponse(batch);
  }

  async assignProposal(
    versionId: string,
    batchId: string,
    position: number,
    adminId: string,
    artworkAssetId: string,
  ) {
    if (!PROPOSAL_POSITIONS.includes(position as 1 | 2 | 3 | 4 | 5)) {
      throw new BadRequestException('INVALID_PROPOSAL_POSITION');
    }

    const batch = await this.requireDraftBatch(versionId, batchId);
    const version = await this.loadVersionContext(versionId);
    this.assertVersionAllowsProposalWorkflow(version);
    if (version.designSelectionConfirmedAt) {
      throw new BadRequestException('DESIGN_SELECTION_ALREADY_CONFIRMED');
    }

    const asset = await this.resolveAdminMedalAsset(adminId, artworkAssetId);

    const proposal = await this.prisma.barMedalDesignProposal.upsert({
      where: {
        batchId_position: { batchId: batch.id, position },
      },
      create: {
        batchId: batch.id,
        position,
        artworkAssetId: asset.id,
        imageUrl: asset.publicUrl,
      },
      update: {
        artworkAssetId: asset.id,
        imageUrl: asset.publicUrl,
      },
    });

    const refreshed = await this.prisma.barMedalDesignProposalBatch.findUnique({
      where: { id: batch.id },
      include: { proposals: { orderBy: { position: 'asc' } } },
    });
    return {
      proposal: this.mapProposal(proposal),
      batch: this.mapBatchResponse(refreshed!),
    };
  }

  async sendBatch(versionId: string, batchId: string, adminId: string) {
    const batch = await this.requireDraftBatch(versionId, batchId);
    const version = await this.loadVersionContext(versionId);
    this.assertVersionAllowsProposalWorkflow(version);
    if (version.designSelectionConfirmedAt) {
      throw new BadRequestException('DESIGN_SELECTION_ALREADY_CONFIRMED');
    }

    const proposals = await this.prisma.barMedalDesignProposal.findMany({
      where: { batchId: batch.id },
      orderBy: { position: 'asc' },
    });
    if (proposals.length !== 5) {
      throw new BadRequestException('DESIGN_PROPOSAL_BATCH_INCOMPLETE');
    }
    const positions = new Set(proposals.map((p) => p.position));
    for (const pos of PROPOSAL_POSITIONS) {
      if (!positions.has(pos)) {
        throw new BadRequestException('DESIGN_PROPOSAL_BATCH_INCOMPLETE');
      }
    }
    for (const p of proposals) {
      await this.resolveAdminMedalAsset(adminId, p.artworkAssetId);
    }

    const sentAt = new Date();
    const updated = await this.prisma.barMedalDesignProposalBatch.update({
      where: { id: batch.id },
      data: {
        status: BarMedalDesignProposalBatchStatus.SENT,
        sentAt,
        sentByAdminId: adminId,
      },
      include: { proposals: { orderBy: { position: 'asc' } } },
    });
    return this.mapBatchResponse(updated);
  }

  private async requireDraftBatch(versionId: string, batchId: string) {
    const batch = await this.prisma.barMedalDesignProposalBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch || batch.medalVersionId !== versionId) {
      throw new NotFoundException('DESIGN_PROPOSAL_BATCH_NOT_FOUND');
    }
    if (batch.status !== BarMedalDesignProposalBatchStatus.DRAFT) {
      throw new BadRequestException('DESIGN_PROPOSAL_BATCH_NOT_EDITABLE');
    }
    return batch;
  }

  private async loadVersionContext(versionId: string) {
    const version = await this.prisma.barMissionMedalVersion.findUnique({
      where: { id: versionId },
      include: {
        season: {
          include: {
            bar: {
              select: {
                id: true,
                subscription: { select: { plan: true, status: true } },
              },
            },
          },
        },
      },
    });
    if (!version) throw new NotFoundException('MEDAL_VERSION_NOT_FOUND');
    const plan = normalizeSubscriptionPlan(
      version.season.bar.subscription?.plan ?? SubscriptionPlan.EXPLORER,
    );
    if (!barCustomMedalEnabledForPlan(plan)) {
      throw new BadRequestException('BAR_CUSTOM_MEDAL_NOT_ENABLED');
    }
    return version;
  }

  private assertVersionAllowsProposalWorkflow(version: {
    status: BarMissionMedalVersionStatus;
    designSelectionConfirmedAt: Date | null;
  }) {
    if (VERSION_BLOCKS_PROPOSALS.includes(version.status)) {
      throw new BadRequestException('MEDAL_VERSION_NOT_ELIGIBLE_FOR_PROPOSALS');
    }
  }

  private async resolveAdminMedalAsset(adminId: string, artworkAssetId: string) {
    const asset = await this.prisma.uploadAsset.findUnique({
      where: { id: artworkAssetId },
    });
    if (!asset || asset.ownerUserId !== adminId) {
      throw new BadRequestException('ARTWORK_ASSET_NOT_OWNED');
    }
    if (asset.folder !== 'medals') {
      throw new BadRequestException('ARTWORK_FOLDER_INVALID');
    }
    const mime = asset.mimeType?.toLowerCase() ?? '';
    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      throw new BadRequestException('ARTWORK_MIME_INVALID');
    }
    const maxBytes = UPLOAD_SIZE_LIMITS.medals ?? 5 * 1024 * 1024;
    if (asset.sizeBytes > maxBytes) {
      throw new BadRequestException('ARTWORK_SIZE_EXCEEDED');
    }
    if (!asset.publicUrl?.trim()) {
      throw new BadRequestException('ARTWORK_URL_INVALID');
    }
    return asset;
  }

  private mapProposal(p: {
    id: string;
    batchId: string;
    position: number;
    artworkAssetId: string;
    imageUrl: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      batchId: p.batchId,
      position: p.position,
      artworkAssetId: p.artworkAssetId,
      imageUrl: p.imageUrl,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private mapBatchResponse(batch: {
    id: string;
    medalVersionId: string;
    status: BarMedalDesignProposalBatchStatus;
    createdAt: Date;
    updatedAt: Date;
    sentAt: Date | null;
    sentByAdminId: string | null;
    createdByAdminId: string;
    proposals: Array<{
      id: string;
      batchId: string;
      position: number;
      artworkAssetId: string;
      imageUrl: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }) {
    const filledPositions = batch.proposals.map((p) => p.position);
    const preparation = {
      filledCount: batch.proposals.length,
      complete: batch.proposals.length === 5 && PROPOSAL_POSITIONS.every((p) => filledPositions.includes(p)),
      missingPositions: PROPOSAL_POSITIONS.filter((p) => !filledPositions.includes(p)),
      readyToSend:
        batch.status === BarMedalDesignProposalBatchStatus.DRAFT &&
        batch.proposals.length === 5 &&
        PROPOSAL_POSITIONS.every((p) => filledPositions.includes(p)),
    };
    return {
      batch: {
        id: batch.id,
        medalVersionId: batch.medalVersionId,
        status: batch.status,
        createdAt: batch.createdAt.toISOString(),
        updatedAt: batch.updatedAt.toISOString(),
        sentAt: batch.sentAt?.toISOString() ?? null,
        sentByAdminId: batch.sentByAdminId,
        createdByAdminId: batch.createdByAdminId,
        preparation,
      },
      proposals: batch.proposals.map((p) => this.mapProposal(p)),
    };
  }
}
