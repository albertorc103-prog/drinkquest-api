import { BadRequestException } from '@nestjs/common';
import {
  BarMedalDesignProposalBatchStatus,
  BarMedalVisualMode,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertArtworkReadyForPublish } from './bar-medal-visual.util';

const PROPOSAL_POSITIONS = [1, 2, 3, 4, 5] as const;

export type MedalVersionProposalFlowFields = {
  id: string;
  usesDesignProposalFlow: boolean;
  selectedProposalId: string | null;
  designSelectionConfirmedAt: Date | null;
  visualMode: BarMedalVisualMode;
  artworkAssetId: string | null;
  artworkUrl: string | null;
};

/** Bloquea setArtwork directo en el flujo de 5 propuestas. */
export function assertDirectArtworkAllowed(version: MedalVersionProposalFlowFields): void {
  if (!version.usesDesignProposalFlow) return;
  throw new BadRequestException('DESIGN_PROPOSAL_ARTWORK_LOCKED');
}

/**
 * Valida que el bar confirmó diseño y que el artwork de la versión coincide con la propuesta.
 */
export async function assertDesignProposalReadyForModeration(
  prisma: PrismaService | Prisma.TransactionClient,
  version: MedalVersionProposalFlowFields,
): Promise<void> {
  if (!version.usesDesignProposalFlow) return;

  if (!version.designSelectionConfirmedAt || !version.selectedProposalId) {
    throw new BadRequestException('DESIGN_PROPOSAL_SELECTION_REQUIRED');
  }

  const batch = await prisma.barMedalDesignProposalBatch.findFirst({
    where: {
      medalVersionId: version.id,
      status: BarMedalDesignProposalBatchStatus.SENT,
    },
    include: { proposals: { orderBy: { position: 'asc' } } },
  });
  if (!batch) {
    throw new BadRequestException('DESIGN_PROPOSAL_BATCH_NOT_SENT');
  }
  if (batch.proposals.length !== 5) {
    throw new BadRequestException('DESIGN_PROPOSAL_BATCH_INVALID');
  }
  const positions = new Set(batch.proposals.map((p) => p.position));
  for (const pos of PROPOSAL_POSITIONS) {
    if (!positions.has(pos)) {
      throw new BadRequestException('DESIGN_PROPOSAL_BATCH_INVALID');
    }
  }

  const selected = batch.proposals.find((p) => p.id === version.selectedProposalId);
  if (!selected) {
    throw new BadRequestException('DESIGN_PROPOSAL_SELECTION_MISMATCH');
  }

  if (version.visualMode !== BarMedalVisualMode.ADMIN_ARTWORK) {
    throw new BadRequestException('DESIGN_PROPOSAL_VISUAL_MODE_INVALID');
  }
  if (version.artworkAssetId !== selected.artworkAssetId) {
    throw new BadRequestException('DESIGN_PROPOSAL_ARTWORK_MISMATCH');
  }
  const versionUrl = version.artworkUrl?.trim() ?? '';
  const selectedUrl = selected.imageUrl?.trim() ?? '';
  if (!versionUrl || versionUrl !== selectedUrl) {
    throw new BadRequestException('DESIGN_PROPOSAL_ARTWORK_MISMATCH');
  }

  assertArtworkReadyForPublish(version);
}
