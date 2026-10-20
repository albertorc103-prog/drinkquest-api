import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMedalDesignProposalBatchStatus,
  BarMedalVisualMode,
  BarMissionMedalVersionStatus,
  SubscriptionPlan,
} from '@prisma/client';
import { BarMedalDesignProposalBarService } from './bar-medal-design-proposal-bar.service';

describe('BarMedalDesignProposalBarService', () => {
  const ownerId = 'owner-1';
  const seasonId = 'season-1';
  const versionId = 'version-1';
  const proposalId = 'proposal-2';
  const batchId = 'batch-1';

  const barAccess = {
    resolveByOwnerUserId: jest.fn(),
    isSubscriptionActive: jest.fn(() => true),
  };

  const versionRow = {
    id: versionId,
    seasonId,
    status: BarMissionMedalVersionStatus.PENDING_REVIEW,
    usesDesignProposalFlow: true,
    selectedProposalId: null as string | null,
    designSelectionConfirmedAt: null as Date | null,
    visualMode: BarMedalVisualMode.ADMIN_ARTWORK,
    artworkAssetId: null as string | null,
    artworkUrl: null as string | null,
  };

  beforeEach(() => {
    barAccess.resolveByOwnerUserId.mockResolvedValue({
      bar: { id: 'bar-1' },
      subscription: { plan: SubscriptionPlan.LEGEND, status: 'ACTIVE' },
    });
  });

  function build(prisma: Record<string, unknown>) {
    return new BarMedalDesignProposalBarService(prisma as any, barAccess as any);
  }

  it('lista propuestas SENT para el bar propietario', async () => {
    const prisma = {
      barMissionSeason: {
        findFirst: jest.fn(async () => ({ id: seasonId, barId: 'bar-1' })),
      },
      barMissionMedalVersion: {
        findFirst: jest.fn(async () => versionRow),
      },
      barMedalDesignProposalBatch: {
        findFirst: jest.fn(async () => ({
          id: batchId,
          status: BarMedalDesignProposalBatchStatus.SENT,
          sentAt: new Date(),
          proposals: [
            { id: 'p1', position: 1, imageUrl: 'https://cdn/1.webp' },
            { id: proposalId, position: 2, imageUrl: 'https://cdn/2.webp' },
          ],
        })),
      },
    };
    const svc = build(prisma);
    const result = await svc.listSentProposals(ownerId, seasonId, versionId);
    expect(result.proposals).toHaveLength(2);
    expect(result.batch.status).toBe(BarMedalDesignProposalBatchStatus.SENT);
    expect(result.selection.confirmed).toBe(false);
  });

  it('temporada de otro bar → 404', async () => {
    const prisma = {
      barMissionSeason: { findFirst: jest.fn(async () => null) },
    };
    const svc = build(prisma);
    await expect(
      svc.listSentProposals(ownerId, seasonId, versionId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin conjunto SENT → 404', async () => {
    const prisma = {
      barMissionSeason: {
        findFirst: jest.fn(async () => ({ id: seasonId, barId: 'bar-1' })),
      },
      barMissionMedalVersion: { findFirst: jest.fn(async () => versionRow) },
      barMedalDesignProposalBatch: { findFirst: jest.fn(async () => null) },
    };
    const svc = build(prisma);
    await expect(
      svc.listSentProposals(ownerId, seasonId, versionId),
    ).rejects.toMatchObject({ message: 'DESIGN_PROPOSAL_BATCH_NOT_AVAILABLE' });
  });

  it('confirmSelection vincula ADMIN_ARTWORK en transacción', async () => {
    const confirmed = {
      ...versionRow,
      selectedProposalId: proposalId,
      designSelectionConfirmedAt: new Date(),
      artworkAssetId: 'asset-2',
      artworkUrl: 'https://cdn/2.webp',
      visualMode: BarMedalVisualMode.ADMIN_ARTWORK,
    };
    const prisma = {
      barMissionSeason: {
        findFirst: jest.fn(async () => ({ id: seasonId, barId: 'bar-1' })),
      },
      barMissionMedalVersion: {
        findFirst: jest.fn(async () => versionRow),
        findUnique: jest.fn(async () => confirmed),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          barMissionMedalVersion: {
            findFirst: jest.fn(async () => versionRow),
            findUnique: jest.fn(async () => confirmed),
            updateMany: jest.fn(async () => ({ count: 1 })),
          },
          barMedalDesignProposal: {
            findUnique: jest.fn(async () => ({
              id: proposalId,
              artworkAssetId: 'asset-2',
              imageUrl: 'https://cdn/2.webp',
              batch: {
                medalVersionId: versionId,
                status: BarMedalDesignProposalBatchStatus.SENT,
              },
            })),
          },
          uploadAsset: {
            findUnique: jest.fn(async () => ({
              id: 'asset-2',
              publicUrl: 'https://cdn/2.webp',
            })),
          },
        };
        return fn(tx);
      }),
    };
    const svc = build(prisma);
    const result = await svc.confirmSelection(
      ownerId,
      seasonId,
      versionId,
      proposalId,
    );
    expect(result.selectedProposalId).toBe(proposalId);
    expect(result.visualMode).toBe(BarMedalVisualMode.ADMIN_ARTWORK);
    expect(result.artworkUrl).toBe('https://cdn/2.webp');
  });

  it('segunda propuesta tras confirmar → rechazada', async () => {
    const prisma = {
      barMissionSeason: {
        findFirst: jest.fn(async () => ({ id: seasonId, barId: 'bar-1' })),
      },
      barMissionMedalVersion: {
        findFirst: jest.fn(async () => ({
          ...versionRow,
          selectedProposalId: 'p1',
          designSelectionConfirmedAt: new Date(),
        })),
      },
    };
    const svc = build(prisma);
    await expect(
      svc.confirmSelection(ownerId, seasonId, versionId, proposalId),
    ).rejects.toMatchObject({ message: 'DESIGN_SELECTION_ALREADY_CONFIRMED' });
  });

  it('misma propuesta repetida → idempotente', async () => {
    const confirmedAt = new Date();
    const prisma = {
      barMissionSeason: {
        findFirst: jest.fn(async () => ({ id: seasonId, barId: 'bar-1' })),
      },
      barMissionMedalVersion: {
        findFirst: jest.fn(async () => ({
          ...versionRow,
          selectedProposalId: proposalId,
          designSelectionConfirmedAt: confirmedAt,
          artworkUrl: 'https://cdn/2.webp',
        })),
        findUnique: jest.fn(async () => ({
          ...versionRow,
          selectedProposalId: proposalId,
          designSelectionConfirmedAt: confirmedAt,
          artworkUrl: 'https://cdn/2.webp',
        })),
      },
      barMedalDesignProposal: {
        findUnique: jest.fn(async () => ({
          id: proposalId,
          position: 2,
          imageUrl: 'https://cdn/2.webp',
        })),
      },
    };
    const svc = build(prisma);
    const result = await svc.confirmSelection(
      ownerId,
      seasonId,
      versionId,
      proposalId,
    );
    expect(result.idempotent).toBe(true);
  });

  it('plan sin entitlement → 403', async () => {
    barAccess.resolveByOwnerUserId.mockResolvedValue({
      bar: { id: 'bar-1' },
      subscription: { plan: SubscriptionPlan.EXPLORER, status: 'ACTIVE' },
    });
    const svc = build({ barMissionSeason: { findFirst: jest.fn() } });
    await expect(
      svc.listSentProposals(ownerId, seasonId, versionId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('versión ACTIVE no permite selección', async () => {
    const prisma = {
      barMissionSeason: {
        findFirst: jest.fn(async () => ({ id: seasonId, barId: 'bar-1' })),
      },
      barMissionMedalVersion: {
        findFirst: jest.fn(async () => ({
          ...versionRow,
          status: BarMissionMedalVersionStatus.ACTIVE,
        })),
      },
    };
    const svc = build(prisma);
    await expect(
      svc.confirmSelection(ownerId, seasonId, versionId, proposalId),
    ).rejects.toMatchObject({ message: 'MEDAL_VERSION_NOT_ELIGIBLE_FOR_SELECTION' });
  });
});
