import { ConflictException } from '@nestjs/common';
import { BarMissionMedalVersionStatus } from '@prisma/client';
import {
  assertNoOtherActiveOfficialMedalForBar,
  findBarsViolatingSingleActiveOfficialMedal,
} from './bar-mission-medal-bar-official.util';
import { AdminBarMissionMedalService } from './admin-bar-mission-medal.service';

describe('bar official medal — una ACTIVE por establecimiento', () => {
  it('assertNoOtherActiveOfficialMedalForBar bloquea ACTIVE en otra temporada', async () => {
    const tx = {
      $executeRaw: jest.fn(async () => undefined),
      barMissionMedalVersion: {
        findFirst: jest.fn(async () => ({
          id: 'other-active',
          seasonId: 'season-old',
          version: 1,
        })),
      },
    };
    await expect(
      assertNoOtherActiveOfficialMedalForBar(
        tx as any,
        'bar-a',
        'ver-new',
        'season-new',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('findBarsViolatingSingleActiveOfficialMedal reporta incumplimientos', async () => {
    const prisma = {
      barMissionMedalVersion: {
        findMany: jest.fn(async () => [
          { id: 'v1', seasonId: 's1', season: { barId: 'bar-a' } },
          { id: 'v2', seasonId: 's2', season: { barId: 'bar-a' } },
          { id: 'v3', seasonId: 's3', season: { barId: 'bar-b' } },
        ]),
      },
    };
    const violations = await findBarsViolatingSingleActiveOfficialMedal(prisma as any);
    expect(violations).toEqual([
      {
        barId: 'bar-a',
        activeMedalCount: 2,
        medals: [
          { versionId: 'v1', seasonId: 's1' },
          { versionId: 'v2', seasonId: 's2' },
        ],
      },
    ]);
  });

  it('activate rechaza segunda medalla ACTIVE en otro season del mismo bar', async () => {
    const seasonA = { id: 'season-a', barId: 'bar-a' };
    const seasonB = { id: 'season-b', barId: 'bar-a' };
    const versions = [
      {
        id: 'ver-a',
        seasonId: 'season-a',
        status: BarMissionMedalVersionStatus.ACTIVE,
        usesDesignProposalFlow: false,
        artworkUrl: 'https://cdn/x.png',
        artworkAssetId: 'asset-1',
        visualMode: 'ADMIN_ARTWORK',
      },
      {
        id: 'ver-b',
        seasonId: 'season-b',
        status: BarMissionMedalVersionStatus.APPROVED,
        usesDesignProposalFlow: false,
        artworkUrl: 'https://cdn/y.png',
        artworkAssetId: 'asset-2',
        visualMode: 'ADMIN_ARTWORK',
      },
    ];

    const updateMany = jest.fn(async () => ({ count: 0 }));
    const update = jest.fn();
    const seasonFindUnique = jest.fn(async ({ where }: any) => {
      if (where.id === 'season-b') return seasonB;
      if (where.id === 'season-a') return seasonA;
      return null;
    });
    const prisma = {
      barMissionMedalVersion: {
        findUnique: jest.fn(async ({ where }: any) => {
          const row = versions.find((v) => v.id === where.id);
          return row ? { ...row, conditions: [] } : null;
        }),
        updateMany,
        update,
      },
      barMissionSeason: {
        findUnique: seasonFindUnique,
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $executeRaw: jest.fn(async () => undefined),
          barMissionMedalVersion: {
            findFirst: jest.fn(async () => ({
              id: 'ver-a',
              seasonId: 'season-a',
              version: 1,
            })),
            updateMany,
            update,
          },
          barMissionSeason: {
            findUnique: seasonFindUnique,
            update: jest.fn(),
          },
        };
        return fn(tx);
      }),
    };

    const admin = new AdminBarMissionMedalService(
      prisma as any,
      { mapVersion: (v: any) => v } as any,
      {} as any,
    );

    await expect(admin.activate('ver-b', 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
