import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMedalDesignProposalBatchStatus,
  BarMissionMedalVersionStatus,
  SubscriptionPlan,
} from '@prisma/client';
import { AdminBarMedalDesignProposalService } from './admin-bar-medal-design-proposal.service';

describe('AdminBarMedalDesignProposalService', () => {
  const adminId = 'admin-1';
  const versionId = 'version-1';
  const batchId = 'batch-1';

  const seasonContext = {
    bar: {
      id: 'bar-1',
      subscription: { plan: SubscriptionPlan.LEGEND, status: 'ACTIVE' },
    },
  };

  const versionBase = {
    id: versionId,
    status: BarMissionMedalVersionStatus.PENDING_REVIEW,
    designSelectionConfirmedAt: null as Date | null,
    usesDesignProposalFlow: false,
    season: seasonContext,
  };

  const medalAsset = {
    id: 'asset-1',
    ownerUserId: adminId,
    folder: 'medals',
    mimeType: 'image/webp',
    sizeBytes: 100_000,
    publicUrl: 'https://cdn.example/medals/1.webp',
  };

  function build(prisma: Record<string, unknown>) {
    return new AdminBarMedalDesignProposalService(prisma as any);
  }

  it('createBatch establece usesDesignProposalFlow y crea DRAFT', async () => {
    const createdBatch = {
      id: batchId,
      medalVersionId: versionId,
      status: BarMedalDesignProposalBatchStatus.DRAFT,
      createdByAdminId: adminId,
      sentByAdminId: null,
      sentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      proposals: [],
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          barMedalDesignProposalBatch: {
            findFirst: jest.fn(async () => null),
            create: jest.fn(async () => createdBatch),
          },
          barMissionMedalVersion: {
            update: jest.fn(async () => ({})),
          },
        };
        return fn(tx);
      }),
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => versionBase),
      },
    };
    const svc = build(prisma);
    const result = await svc.createBatch(versionId, adminId);
    expect(result.batch.status).toBe(BarMedalDesignProposalBatchStatus.DRAFT);
    expect(result.batch.preparation.filledCount).toBe(0);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('createBatch rechaza segundo conjunto abierto', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          barMedalDesignProposalBatch: {
            findFirst: jest.fn(async () => ({ id: 'existing' })),
            create: jest.fn(),
          },
          barMissionMedalVersion: { update: jest.fn() },
        };
        return fn(tx);
      }),
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => versionBase),
      },
    };
    const svc = build(prisma);
    await expect(svc.createBatch(versionId, adminId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('assignProposal rechaza posición inválida', async () => {
    const prisma = {
      barMedalDesignProposalBatch: { findUnique: jest.fn() },
      barMissionMedalVersion: { findUnique: jest.fn() },
      barMedalDesignProposal: { upsert: jest.fn() },
      uploadAsset: { findUnique: jest.fn() },
    };
    const svc = build(prisma);
    await expect(
      svc.assignProposal(versionId, batchId, 6, adminId, 'asset-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assignProposal reemplaza en DRAFT y valida asset', async () => {
    const batch = {
      id: batchId,
      medalVersionId: versionId,
      status: BarMedalDesignProposalBatchStatus.DRAFT,
    };
    const proposal = {
      id: 'prop-1',
      batchId,
      position: 2,
      artworkAssetId: medalAsset.id,
      imageUrl: medalAsset.publicUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const refreshed = {
      ...batch,
      createdByAdminId: adminId,
      sentByAdminId: null,
      sentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      proposals: [proposal],
    };
    const prisma = {
      barMedalDesignProposalBatch: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(batch)
          .mockResolvedValueOnce(refreshed),
      },
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => versionBase),
      },
      uploadAsset: {
        findUnique: jest.fn(async () => medalAsset),
      },
      barMedalDesignProposal: {
        upsert: jest.fn(async () => proposal),
      },
    };
    const svc = build(prisma);
    const result = await svc.assignProposal(versionId, batchId, 2, adminId, medalAsset.id);
    expect(result.proposal.position).toBe(2);
    expect(prisma.barMedalDesignProposal.upsert).toHaveBeenCalled();
  });

  it('assignProposal rechaza asset de carpeta incorrecta', async () => {
    const batch = {
      id: batchId,
      medalVersionId: versionId,
      status: BarMedalDesignProposalBatchStatus.DRAFT,
    };
    const prisma = {
      barMedalDesignProposalBatch: {
        findUnique: jest.fn(async () => batch),
      },
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => versionBase),
      },
      uploadAsset: {
        findUnique: jest.fn(async () => ({ ...medalAsset, folder: 'promotions' })),
      },
      barMedalDesignProposal: { upsert: jest.fn() },
    };
    const svc = build(prisma);
    await expect(
      svc.assignProposal(versionId, batchId, 1, adminId, medalAsset.id),
    ).rejects.toMatchObject({ message: 'ARTWORK_FOLDER_INVALID' });
  });

  it('sendBatch exige cinco propuestas', async () => {
    const batch = {
      id: batchId,
      medalVersionId: versionId,
      status: BarMedalDesignProposalBatchStatus.DRAFT,
    };
    const prisma = {
      barMedalDesignProposalBatch: {
        findUnique: jest.fn(async () => batch),
        update: jest.fn(),
      },
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => versionBase),
      },
      barMedalDesignProposal: {
        findMany: jest.fn(async () => [
          { position: 1, artworkAssetId: medalAsset.id },
          { position: 2, artworkAssetId: medalAsset.id },
        ]),
      },
      uploadAsset: { findUnique: jest.fn() },
    };
    const svc = build(prisma);
    await expect(svc.sendBatch(versionId, batchId, adminId)).rejects.toMatchObject({
      message: 'DESIGN_PROPOSAL_BATCH_INCOMPLETE',
    });
  });

  it('sendBatch pasa a SENT con cinco posiciones', async () => {
    const batch = {
      id: batchId,
      medalVersionId: versionId,
      status: BarMedalDesignProposalBatchStatus.DRAFT,
    };
    const proposals = [1, 2, 3, 4, 5].map((position) => ({
      position,
      artworkAssetId: `asset-${position}`,
    }));
    const sentBatch = {
      ...batch,
      status: BarMedalDesignProposalBatchStatus.SENT,
      createdByAdminId: adminId,
      sentByAdminId: adminId,
      sentAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      proposals: proposals.map((p, i) => ({
        id: `prop-${i}`,
        batchId,
        position: p.position,
        artworkAssetId: p.artworkAssetId,
        imageUrl: `https://cdn.example/${p.position}.webp`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };
    const prisma = {
      barMedalDesignProposalBatch: {
        findUnique: jest.fn(async () => batch),
        update: jest.fn(async () => sentBatch),
      },
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => versionBase),
      },
      barMedalDesignProposal: {
        findMany: jest.fn(async () => proposals),
      },
      uploadAsset: {
        findUnique: jest.fn(async () => medalAsset),
      },
    };
    const svc = build(prisma);
    const result = await svc.sendBatch(versionId, batchId, adminId);
    expect(result.batch.status).toBe(BarMedalDesignProposalBatchStatus.SENT);
    expect(result.batch.sentAt).toBeTruthy();
    expect(result.proposals).toHaveLength(5);
  });

  it('no permite asignar en batch SENT', async () => {
    const prisma = {
      barMedalDesignProposalBatch: {
        findUnique: jest.fn(async () => ({
          id: batchId,
          medalVersionId: versionId,
          status: BarMedalDesignProposalBatchStatus.SENT,
        })),
      },
      barMissionMedalVersion: { findUnique: jest.fn() },
      uploadAsset: { findUnique: jest.fn() },
      barMedalDesignProposal: { upsert: jest.fn() },
    };
    const svc = build(prisma);
    await expect(
      svc.assignProposal(versionId, batchId, 1, adminId, medalAsset.id),
    ).rejects.toMatchObject({ message: 'DESIGN_PROPOSAL_BATCH_NOT_EDITABLE' });
  });

  it('ACTIVE no permite crear conjunto', async () => {
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => ({
          ...versionBase,
          status: BarMissionMedalVersionStatus.ACTIVE,
        })),
      },
      $transaction: jest.fn(),
    };
    const svc = build(prisma);
    await expect(svc.createBatch(versionId, adminId)).rejects.toMatchObject({
      message: 'MEDAL_VERSION_NOT_ELIGIBLE_FOR_PROPOSALS',
    });
  });

  it('versión inexistente → 404', async () => {
    const prisma = {
      barMissionMedalVersion: { findUnique: jest.fn(async () => null) },
    };
    const svc = build(prisma);
    await expect(svc.getBatchForVersion('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
