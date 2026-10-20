import { BadRequestException } from '@nestjs/common';
import {
  BarMedalDesignProposalBatchStatus,
  BarMedalVisualMode,
  BarMissionMedalVersionStatus,
} from '@prisma/client';
import { AdminBarMissionMedalService } from './admin-bar-mission-medal.service';
import {
  assertDirectArtworkAllowed,
} from './bar-medal-design-proposal-flow.util';
import { mapMedalVisualFields } from './bar-medal-visual.util';

describe('Design proposal flow — moderación', () => {
  const proposalFlowVersion = {
    id: 'v-flow',
    seasonId: 's1',
    version: 2,
    title: 'T',
    description: 'D',
    status: BarMissionMedalVersionStatus.PENDING_REVIEW,
    conditionMode: 'ALL' as const,
    xpReward: 0,
    templateId: null,
    designConfig: null,
    usesDesignProposalFlow: true,
    selectedProposalId: 'prop-3',
    designSelectionConfirmedAt: new Date(),
    visualMode: BarMedalVisualMode.ADMIN_ARTWORK,
    artworkAssetId: 'asset-3',
    artworkUrl: 'https://cdn/3.webp',
    reviewNote: null,
    moderatedByAdminId: null,
    moderatedAt: null,
    submittedByUserId: null,
    submittedAt: new Date(),
    approvedAt: null,
    activatedAt: null,
    disabledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    conditions: [],
  };

  it('setArtwork bloqueado con usesDesignProposalFlow', () => {
    expect(() => assertDirectArtworkAllowed(proposalFlowVersion)).toThrow(
      BadRequestException,
    );
  });

  it('approve sin selección en flujo nuevo falla', async () => {
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => ({
          ...proposalFlowVersion,
          designSelectionConfirmedAt: null,
          selectedProposalId: null,
          artworkUrl: null,
        })),
        update: jest.fn(),
      },
    };
    const medals = { mapVersion: jest.fn() };
    const admin = new AdminBarMissionMedalService(
      prisma as any,
      medals as any,
      {} as any,
    );
    await expect(admin.approve('v-flow', 'admin-1')).rejects.toMatchObject({
      message: 'DESIGN_PROPOSAL_SELECTION_REQUIRED',
    });
  });

  it('approve con selección coherente OK', async () => {
    const proposals = [1, 2, 3, 4, 5].map((position) => ({
      id: position === 3 ? 'prop-3' : `prop-${position}`,
      position,
      artworkAssetId: position === 3 ? 'asset-3' : `asset-${position}`,
      imageUrl: `https://cdn/${position}.webp`,
    }));
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => proposalFlowVersion),
        update: jest.fn(async () => ({
          ...proposalFlowVersion,
          status: BarMissionMedalVersionStatus.APPROVED,
        })),
      },
      barMedalDesignProposalBatch: {
        findFirst: jest.fn(async () => ({
          id: 'batch-1',
          medalVersionId: 'v-flow',
          status: BarMedalDesignProposalBatchStatus.SENT,
          proposals,
        })),
      },
    };
    const medals = {
      mapVersion: jest.fn((v) => ({
        id: v.id,
        status: v.status,
        ...mapMedalVisualFields(v),
      })),
    };
    const admin = new AdminBarMissionMedalService(
      prisma as any,
      medals as any,
      {} as any,
    );
    const result = await admin.approve('v-flow', 'admin-1');
    expect(result.status).toBe(BarMissionMedalVersionStatus.APPROVED);
  });

  it('legacy ADMIN_ARTWORK sin flujo sigue exigiendo artwork', async () => {
    const legacy = {
      ...proposalFlowVersion,
      usesDesignProposalFlow: false,
      selectedProposalId: null,
      designSelectionConfirmedAt: null,
      artworkUrl: null,
    };
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => legacy),
        update: jest.fn(),
      },
    };
    const admin = new AdminBarMissionMedalService(
      prisma as any,
      { mapVersion: jest.fn() } as any,
      {} as any,
    );
    await expect(admin.approve('v-flow', 'admin-1')).rejects.toMatchObject({
      message: 'MEDAL_ARTWORK_REQUIRED',
    });
  });
});
