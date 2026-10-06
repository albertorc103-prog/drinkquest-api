import { NotFoundException } from '@nestjs/common';
import { BarMissionSeasonStatus } from '@prisma/client';
import { BarMissionsService } from './bar-missions.service';

describe('getSeasonMedalProgressForUser API (FASE 4)', () => {
  it('TEST 35/36: usa userId autenticado; no expone metadata admin', async () => {
    const prisma: any = {
      barMissionSeason: {
        findFirst: jest.fn(async () => ({
          id: 's1',
          status: BarMissionSeasonStatus.ACTIVE,
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() + 86400000),
          bar: { id: 'b1', deletedAt: null, isActive: true },
        })),
      },
      userBarMedal: {
        findUnique: jest.fn(async () => null),
      },
    };
    const medalProgress = {
      getSeasonMedalProgress: jest.fn(async () => ({
        seasonId: 's1',
        status: 'IN_PROGRESS',
        medalVersionId: 'v1',
        earnedMedalVersionId: null,
        unlocked: false,
        unlockedAt: null,
        eligibleToUnlock: false,
        conditionMode: 'ALL',
        overallProgress: 10,
        title: 'T',
        description: 'D',
        conditions: [
          {
            id: 'c1',
            type: 'VISITS',
            current: 0,
            target: 3,
            progress: 0,
            completed: false,
            referenceId: null,
          },
        ],
        // campos que NO deben filtrarse al API si existieran en motor
        reviewNote: 'secret',
        moderatedByAdminId: 'admin',
      })),
    };
    const service = new BarMissionsService(
      prisma,
      {} as any,
      medalProgress as any,
      { evaluateAndMaybeUnlock: jest.fn() } as any,
    );

    const res = await service.getSeasonMedalProgressForUser('user-auth', 's1');
    expect(medalProgress.getSeasonMedalProgress).toHaveBeenCalledWith('user-auth', 's1');
    expect(res).not.toHaveProperty('reviewNote');
    expect(res).not.toHaveProperty('moderatedByAdminId');
    expect(res.conditions[0]).toEqual(
      expect.objectContaining({
        id: 'c1',
        type: 'VISITS',
        current: 0,
        target: 3,
      }),
    );
  });

  it('season no visible sin medal → NotFound', async () => {
    const prisma: any = {
      barMissionSeason: {
        findFirst: jest.fn(async () => ({
          id: 's1',
          status: BarMissionSeasonStatus.DRAFT,
          startsAt: new Date(),
          endsAt: new Date(),
          bar: { id: 'b1', deletedAt: null, isActive: true },
        })),
      },
      userBarMedal: { findUnique: jest.fn(async () => null) },
    };
    const service = new BarMissionsService(
      prisma,
      {} as any,
      { getSeasonMedalProgress: jest.fn() } as any,
      { evaluateAndMaybeUnlock: jest.fn() } as any,
    );
    await expect(service.getSeasonMedalProgressForUser('u1', 's1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
