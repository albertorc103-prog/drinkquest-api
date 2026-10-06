import { ConflictException } from '@nestjs/common';
import {
  BarMissionMedalConditionMode,
  BarMissionMedalConditionType,
  BarMissionMedalVersionStatus,
  QrSessionStatus,
} from '@prisma/client';
import { BarMissionMedalActiveResolver } from './bar-mission-medal-active.resolver';
import { BarMissionMedalProgressService } from './bar-mission-medal-progress.service';

describe('BarMissionMedalProgressService FASE 4', () => {
  const season = {
    id: 'season-1',
    barId: 'bar-1',
    startsAt: new Date('2026-10-01T00:00:00Z'),
    endsAt: new Date('2026-10-31T23:59:59Z'),
    medalTitle: 'Legacy',
    medalDescription: 'Desc legacy',
  };

  const conditionsBase = [
    {
      id: 'c-visits',
      type: BarMissionMedalConditionType.VISITS,
      targetValue: 3,
      referenceId: null,
      position: 0,
    },
    {
      id: 'c-drinks',
      type: BarMissionMedalConditionType.DRINKS_UNLOCKED,
      targetValue: 5,
      referenceId: null,
      position: 1,
    },
    {
      id: 'c-mission',
      type: BarMissionMedalConditionType.MISSION_COMPLETED,
      targetValue: 1,
      referenceId: 'mission-1',
      position: 2,
    },
  ];

  let visits: number;
  let qrDrinkIds: string[];
  let completedMissions: string[];
  let versions: any[];
  let earned: any;
  let prisma: any;
  let resolver: BarMissionMedalActiveResolver;
  let service: BarMissionMedalProgressService;

  beforeEach(() => {
    visits = 0;
    qrDrinkIds = [];
    completedMissions = [];
    earned = null;
    versions = [
      {
        id: 'v-active',
        seasonId: season.id,
        version: 1,
        title: 'Guardian',
        description: 'Desc',
        status: BarMissionMedalVersionStatus.ACTIVE,
        conditionMode: BarMissionMedalConditionMode.ALL,
        conditions: [...conditionsBase],
      },
    ];

    prisma = {
      placeVisit: {
        count: jest.fn(async ({ where }: any) => {
          if (where.barId !== season.barId) return 0;
          if (where.userId !== 'user-1') return 0;
          // Simula filtro temporal vía flag en tests
          return visits;
        }),
      },
      qrSession: {
        findMany: jest.fn(async ({ where }: any) => {
          if (where.barId !== season.barId) return [];
          if (where.scannedById !== 'user-1') return [];
          if (where.status !== QrSessionStatus.USED) return [];
          return qrDrinkIds.map((drinkId) => ({ drinkId }));
        }),
      },
      userBarMissionProgress: {
        findMany: jest.fn(async ({ where }: any) => {
          const ids: string[] = where.missionId?.in ?? [];
          return completedMissions
            .filter((id) => ids.includes(id))
            .map((missionId) => ({ missionId }));
        }),
      },
      barMissionSeason: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === season.id ? { ...season } : null,
        ),
      },
      barMissionMedalVersion: {
        findUnique: jest.fn(async ({ where }: any) => {
          const v = versions.find((x) => x.id === where.id);
          return v ? { ...v, season: { ...season } } : null;
        }),
        findMany: jest.fn(async ({ where }: any) =>
          versions.filter((v) => {
            if (where.seasonId && v.seasonId !== where.seasonId) return false;
            if (where.status && v.status !== where.status) return false;
            return true;
          }),
        ),
      },
      userBarMedal: {
        findUnique: jest.fn(async () => earned),
      },
    };

    resolver = new BarMissionMedalActiveResolver(prisma);
    service = new BarMissionMedalProgressService(prisma, resolver);
  });

  describe('ACTIVE resolver', () => {
    it('TEST 1: encuentra ACTIVE', async () => {
      const v = await resolver.findActiveMedalVersionForSeason(season.id);
      expect(v?.id).toBe('v-active');
    });

    it('TEST 2/3: no devuelve DRAFT ni PENDING', async () => {
      versions[0].status = BarMissionMedalVersionStatus.DRAFT;
      expect(await resolver.findActiveMedalVersionForSeason(season.id)).toBeNull();
      versions[0].status = BarMissionMedalVersionStatus.PENDING_REVIEW;
      expect(await resolver.findActiveMedalVersionForSeason(season.id)).toBeNull();
    });

    it('TEST 4: dos ACTIVE → ConflictException', async () => {
      versions.push({
        ...versions[0],
        id: 'v-active-2',
        version: 2,
      });
      await expect(resolver.findActiveMedalVersionForSeason(season.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('VISITS', () => {
    beforeEach(() => {
      versions[0].conditions = [conditionsBase[0]];
      versions[0].conditionMode = BarMissionMedalConditionMode.ALL;
    });

    it('TEST 5: 0/3', async () => {
      visits = 0;
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0]).toMatchObject({ current: 0, target: 3, progress: 0, completed: false });
      expect(s.eligibleToUnlock).toBe(false);
    });

    it('TEST 6: 1/3', async () => {
      visits = 1;
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0].progress).toBeCloseTo(33.333, 0);
      expect(s.eligibleToUnlock).toBe(false);
    });

    it('TEST 7: 3/3 completa', async () => {
      visits = 3;
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0]).toMatchObject({ current: 3, progress: 100, completed: true });
      expect(s.eligibleToUnlock).toBe(true);
    });

    it('TEST 8: 5/3 current=5 progress=100', async () => {
      visits = 5;
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0]).toMatchObject({ current: 5, target: 3, progress: 100, completed: true });
    });

    it('TEST 9: visitas otro bar no cuentan', async () => {
      visits = 10;
      prisma.placeVisit.count = jest.fn(async ({ where }: any) =>
        where.barId === 'other-bar' ? 10 : 0,
      );
      // still uses season.barId → 0
      prisma.placeVisit.count = jest.fn(async () => 0);
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0].current).toBe(0);
    });

    it('TEST 10: filtro temporal season (query usa startsAt/endsAt)', async () => {
      await service.getSeasonMedalProgress('user-1', season.id);
      expect(prisma.placeVisit.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          barId: season.barId,
          visitedAt: { gte: season.startsAt, lte: season.endsAt },
        },
      });
    });
  });

  describe('DRINKS_UNLOCKED via QrSession', () => {
    beforeEach(() => {
      versions[0].conditions = [conditionsBase[1]];
    });

    it('TEST 11: 0/5', async () => {
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0]).toMatchObject({ current: 0, target: 5, completed: false });
    });

    it('TEST 12-14: DISTINCT drinkId; misma bebida = 1', async () => {
      qrDrinkIds = ['d1', 'd1', 'd2'];
      // findMany with distinct already returns unique in our mock as list of unique
      qrDrinkIds = ['d1', 'd2'];
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0].current).toBe(2);
    });

    it('TEST 15: otro bar no cuenta', async () => {
      prisma.qrSession.findMany = jest.fn(async ({ where }: any) =>
        where.barId === season.barId ? [] : [{ drinkId: 'd1' }],
      );
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0].current).toBe(0);
    });

    it('TEST 16: query usa usedAt en ventana season + USED', async () => {
      await service.getSeasonMedalProgress('user-1', season.id);
      expect(prisma.qrSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: QrSessionStatus.USED,
            usedAt: { gte: season.startsAt, lte: season.endsAt },
            scannedById: 'user-1',
            barId: season.barId,
          }),
          distinct: ['drinkId'],
        }),
      );
    });

    it('TEST 17: no consulta BarMenuItem', async () => {
      prisma.barMenuItem = { findMany: jest.fn() };
      await service.getSeasonMedalProgress('user-1', season.id);
      expect(prisma.barMenuItem.findMany).not.toHaveBeenCalled();
    });
  });

  describe('MISSION_COMPLETED', () => {
    beforeEach(() => {
      versions[0].conditions = [conditionsBase[2]];
    });

    it('TEST 18: incompleta = 0', async () => {
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0]).toMatchObject({ current: 0, target: 1, completed: false });
    });

    it('TEST 19: completa = 1', async () => {
      completedMissions = ['mission-1'];
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0]).toMatchObject({ current: 1, progress: 100, completed: true });
      expect(s.eligibleToUnlock).toBe(true);
    });

    it('TEST 20: misión otra season no cuenta (filtro seasonId en query)', async () => {
      await service.getSeasonMedalProgress('user-1', season.id);
      expect(prisma.userBarMissionProgress.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            mission: { seasonId: season.id },
          }),
        }),
      );
    });
  });

  describe('ALL', () => {
    it('TEST 21: ninguna completa → no eligible', async () => {
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.eligibleToUnlock).toBe(false);
      expect(s.overallProgress).toBe(0);
    });

    it('TEST 22: 2 de 3 → no eligible; cap < 100', async () => {
      visits = 3;
      qrDrinkIds = ['a', 'b', 'c', 'd', 'e'];
      completedMissions = [];
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.eligibleToUnlock).toBe(false);
      expect(s.overallProgress).toBeLessThan(100);
      // (100+100+0)/3 ≈ 66.67
      expect(s.overallProgress).toBeCloseTo(66.67, 1);
    });

    it('TEST 23/24: todas completas → eligible 100', async () => {
      visits = 3;
      qrDrinkIds = ['a', 'b', 'c', 'd', 'e'];
      completedMissions = ['mission-1'];
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.eligibleToUnlock).toBe(true);
      expect(s.overallProgress).toBe(100);
    });
  });

  describe('ANY', () => {
    beforeEach(() => {
      versions[0].conditionMode = BarMissionMedalConditionMode.ANY;
    });

    it('TEST 25: ninguna → no eligible', async () => {
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.eligibleToUnlock).toBe(false);
    });

    it('TEST 26/27: una completa → eligible; overall = max', async () => {
      visits = 3; // 100%
      qrDrinkIds = ['a']; // 20%
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.eligibleToUnlock).toBe(true);
      expect(s.overallProgress).toBe(100);
    });
  });

  describe('histórico', () => {
    it('TEST 28/29: UserBarMedal v1 con v2 ACTIVE → muestra v1', async () => {
      earned = {
        medalVersionId: 'v1-earned',
        unlockedAt: new Date('2026-10-05T12:00:00Z'),
        medalVersion: {
          id: 'v1-earned',
          title: 'V1 Title',
          description: 'V1 Desc',
          conditionMode: BarMissionMedalConditionMode.ALL,
          conditions: [conditionsBase[0]],
        },
      };
      versions[0].id = 'v2-active';
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.unlocked).toBe(true);
      expect(s.eligibleToUnlock).toBe(false);
      expect(s.overallProgress).toBe(100);
      expect(s.earnedMedalVersionId).toBe('v1-earned');
      expect(s.title).toBe('V1 Title');
    });

    it('TEST 30: medalVersionId null legacy → unlocked', async () => {
      earned = {
        medalVersionId: null,
        unlockedAt: new Date('2026-10-05T12:00:00Z'),
        medalVersion: null,
      };
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.unlocked).toBe(true);
      expect(s.eligibleToUnlock).toBe(false);
      expect(s.overallProgress).toBe(100);
      expect(s.title).toBe(season.medalTitle);
    });
  });

  describe('EVENT_PARTICIPATION', () => {
    it('unsupported → no completed; bloquea ALL', async () => {
      versions[0].conditions = [
        {
          id: 'c-event',
          type: BarMissionMedalConditionType.EVENT_PARTICIPATION,
          targetValue: 1,
          referenceId: null,
          position: 0,
        },
        conditionsBase[0],
      ];
      visits = 99;
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.conditions[0].unsupported).toBe(true);
      expect(s.conditions[0].completed).toBe(false);
      expect(s.eligibleToUnlock).toBe(false);
    });

    it('unsupported bloquea ANY aunque otra condición esté completa', async () => {
      versions[0].conditionMode = BarMissionMedalConditionMode.ANY;
      versions[0].conditions = [
        conditionsBase[0],
        {
          id: 'c-event',
          type: BarMissionMedalConditionType.EVENT_PARTICIPATION,
          targetValue: 1,
          referenceId: null,
          position: 1,
        },
      ];
      visits = 99;
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.eligibleToUnlock).toBe(false);
      expect(s.conditions.some((c) => c.unsupported)).toBe(true);
    });
  });

  describe('NO_ACTIVE_MEDAL', () => {
    it('sin ACTIVE → NO_ACTIVE_MEDAL', async () => {
      versions[0].status = BarMissionMedalVersionStatus.DRAFT;
      const s = await service.getSeasonMedalProgress('user-1', season.id);
      expect(s.status).toBe('NO_ACTIVE_MEDAL');
      expect(s.eligibleToUnlock).toBe(false);
    });
  });
});
