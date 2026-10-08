import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BarMedalVisualMode, BarMissionMedalVersionStatus } from '@prisma/client';
import { AdminBarMissionMedalService } from './admin-bar-mission-medal.service';
import { mapMedalVisualFields } from './bar-medal-visual.util';

describe('Admin medal artwork (temporal ADMIN_ARTWORK)', () => {
  const versionBase = {
    id: 'v1',
    seasonId: 's1',
    version: 1,
    title: 'Medalla',
    description: 'Desc',
    status: BarMissionMedalVersionStatus.PENDING_REVIEW,
    conditionMode: 'ALL' as const,
    xpReward: 50,
    templateId: null,
    designConfig: null,
    visualMode: BarMedalVisualMode.ADMIN_ARTWORK,
    artworkAssetId: null as string | null,
    artworkUrl: null as string | null,
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
    conditions: [{ id: 'c1', type: 'VISITS', targetValue: 3, referenceId: null, position: 0 }],
  };

  function build(prisma: Record<string, unknown>, medals?: { mapVersion: jest.Mock }) {
    const medalService = medals ?? {
      mapVersion: jest.fn((v) => ({
        id: v.id,
        ...mapMedalVisualFields(v),
        status: v.status,
      })),
    };
    return new AdminBarMissionMedalService(prisma as any, medalService as any);
  }

  it('setArtwork congela asset en versión editable', async () => {
    const updated = {
      ...versionBase,
      artworkAssetId: 'asset-1',
      artworkUrl: 'https://cdn.example/medals/a.webp',
      visualMode: BarMedalVisualMode.ADMIN_ARTWORK,
    };
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => versionBase),
        update: jest.fn(async () => updated),
      },
      uploadAsset: {
        findUnique: jest.fn(async () => ({
          id: 'asset-1',
          ownerUserId: 'admin-1',
          folder: 'medals',
          publicUrl: 'https://cdn.example/medals/a.webp',
        })),
      },
    };
    const admin = build(prisma);
    const result = await admin.setArtwork('v1', 'admin-1', { artworkAssetId: 'asset-1' });
    expect(prisma.barMissionMedalVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visualMode: BarMedalVisualMode.ADMIN_ARTWORK,
          artworkAssetId: 'asset-1',
          artworkUrl: 'https://cdn.example/medals/a.webp',
        }),
      }),
    );
    expect(result.artworkAvailable).toBe(true);
    expect(result.artworkUrl).toBe('https://cdn.example/medals/a.webp');
  });

  it('ACTIVE no permite mutar artwork', async () => {
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => ({
          ...versionBase,
          status: BarMissionMedalVersionStatus.ACTIVE,
        })),
        update: jest.fn(),
      },
      uploadAsset: { findUnique: jest.fn() },
    };
    const admin = build(prisma);
    await expect(
      admin.setArtwork('v1', 'admin-1', { artworkAssetId: 'asset-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.barMissionMedalVersion.update).not.toHaveBeenCalled();
  });

  it('artwork de otro usuario → ARTWORK_ASSET_NOT_OWNED', async () => {
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => versionBase),
        update: jest.fn(),
      },
      uploadAsset: {
        findUnique: jest.fn(async () => ({
          id: 'asset-1',
          ownerUserId: 'other',
          folder: 'medals',
          publicUrl: 'https://cdn.example/x.webp',
        })),
      },
    };
    const admin = build(prisma);
    await expect(
      admin.setArtwork('v1', 'admin-1', { artworkAssetId: 'asset-1' }),
    ).rejects.toMatchObject({ message: 'ARTWORK_ASSET_NOT_OWNED' });
  });

  it('approve ADMIN_ARTWORK sin artwork falla', async () => {
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => versionBase),
        update: jest.fn(),
      },
    };
    const admin = build(prisma);
    await expect(admin.approve('v1', 'admin-1')).rejects.toMatchObject({
      message: 'MEDAL_ARTWORK_REQUIRED',
    });
  });

  it('approve ADMIN_ARTWORK con artwork OK', async () => {
    const withArt = {
      ...versionBase,
      artworkUrl: 'https://cdn.example/medals/a.webp',
      artworkAssetId: 'asset-1',
    };
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => withArt),
        update: jest.fn(async () => ({
          ...withArt,
          status: BarMissionMedalVersionStatus.APPROVED,
        })),
      },
    };
    const admin = build(prisma);
    const result = await admin.approve('v1', 'admin-1');
    expect(result.status).toBe(BarMissionMedalVersionStatus.APPROVED);
  });

  it('histórico: mapMedalVisualFields usa artwork de ESA versión', () => {
    const v1 = mapMedalVisualFields({
      visualMode: BarMedalVisualMode.ADMIN_ARTWORK,
      artworkUrl: 'https://cdn.example/v1.webp',
      designConfig: null,
    });
    const v2 = mapMedalVisualFields({
      visualMode: BarMedalVisualMode.ADMIN_ARTWORK,
      artworkUrl: 'https://cdn.example/v2.webp',
      designConfig: null,
    });
    expect(v1.artworkUrl).toBe('https://cdn.example/v1.webp');
    expect(v2.artworkUrl).toBe('https://cdn.example/v2.webp');
    expect(v1.artworkAvailable).toBe(true);
  });

  it('fallback sin artwork: artworkAvailable=false, BUILDER sigue resolviendo visual', () => {
    const legacy = mapMedalVisualFields({
      visualMode: BarMedalVisualMode.BUILDER_V1,
      artworkUrl: null,
      designConfig: null,
    });
    expect(legacy.artworkAvailable).toBe(false);
    expect(legacy.visualMode).toBe(BarMedalVisualMode.BUILDER_V1);
    expect(legacy.visual).toBeTruthy();
  });

  it('versión inexistente → 404', async () => {
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async () => null),
      },
    };
    const admin = build(prisma);
    await expect(
      admin.setArtwork('missing', 'admin-1', { artworkAssetId: 'a' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
