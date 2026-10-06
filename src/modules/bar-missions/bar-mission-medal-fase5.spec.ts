import {
  BarMissionMedalConditionMode,
  BarMissionMedalConditionType,
  BarMissionMedalVersionStatus,
  BarMissionSeasonStatus,
  BarMissionTemplate,
} from '@prisma/client';
import { BarMissionMedalActiveResolver } from './bar-mission-medal-active.resolver';
import { BarMissionMedalActivityService } from './bar-mission-medal-activity.service';
import { BarMissionMedalProgressService } from './bar-mission-medal-progress.service';
import { BarMissionMedalUnlockService } from './bar-mission-medal-unlock.service';
import { BarMissionsService } from './bar-missions.service';

/**
 * Integración FASE 5+6: triggers → progress → UnlockService.
 */
describe('FASE 5 medal triggers integration', () => {
  const seasonWindow = {
    id: 'season-1',
    barId: 'bar-1',
    startsAt: new Date('2026-10-01T00:00:00Z'),
    endsAt: new Date('2026-10-31T23:59:59Z'),
    status: BarMissionSeasonStatus.ACTIVE,
    deletedAt: null,
    medalTitle: 'Legacy Medal',
    medalDescription: 'Legacy desc',
  };

  let visitsCount: number;
  let qrDrinks: string[];
  let completedMissions: Set<string>;
  let medals: any[];
  let rewards: any[];
  let version: any;
  let prisma: any;
  let activity: BarMissionMedalActivityService;
  let barMissions: BarMissionsService;
  let notificationsPersist: jest.Mock;
  let notificationsDeliver: jest.Mock;

  function buildVersion(
    mode: BarMissionMedalConditionMode,
    conditions: any[],
    xpReward = 25,
  ) {
    return {
      id: 'v-active',
      seasonId: seasonWindow.id,
      version: 1,
      title: 'Guardian',
      description: 'Desc',
      status: BarMissionMedalVersionStatus.ACTIVE,
      conditionMode: mode,
      xpReward,
      conditions,
    };
  }

  beforeEach(() => {
    visitsCount = 0;
    qrDrinks = [];
    completedMissions = new Set();
    medals = [];
    rewards = [];
    notificationsPersist = jest.fn(async (...args: any[]) => ({
      id: 'n1',
      type: args[1],
      title: args[2],
      body: args[3],
      payload: args[4],
    }));
    notificationsDeliver = jest.fn(async () => undefined);

    version = buildVersion(BarMissionMedalConditionMode.ALL, [
      {
        id: 'c-v',
        type: BarMissionMedalConditionType.VISITS,
        targetValue: 3,
        referenceId: null,
        position: 0,
      },
      {
        id: 'c-d',
        type: BarMissionMedalConditionType.DRINKS_UNLOCKED,
        targetValue: 2,
        referenceId: null,
        position: 1,
      },
      {
        id: 'c-m',
        type: BarMissionMedalConditionType.MISSION_COMPLETED,
        targetValue: 1,
        referenceId: 'mission-1',
        position: 2,
      },
    ]);

    prisma = {
      placeVisit: {
        count: jest.fn(async () => visitsCount),
      },
      qrSession: {
        findMany: jest.fn(async () => qrDrinks.map((drinkId) => ({ drinkId }))),
      },
      userBarMissionProgress: {
        findMany: jest.fn(async ({ where }: any) => {
          const ids: string[] = where.missionId?.in ?? [];
          return [...completedMissions]
            .filter((id) => ids.includes(id))
            .map((missionId) => ({ missionId }));
        }),
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async ({ where, create, update }: any) => {
          if (create.completedAt || update.completedAt) {
            completedMissions.add(where.userId_missionId.missionId);
          }
          return { ...create, ...update };
        }),
      },
      userDrinkUnlock: {
        findMany: jest.fn(async () =>
          qrDrinks.map((drinkId, i) => ({
            drinkId,
            unlockedAt: new Date(seasonWindow.startsAt.getTime() + i * 1000),
          })),
        ),
      },
      barMissionSeason: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.id && where.id !== seasonWindow.id) return null;
          if (where.barId && where.barId !== seasonWindow.barId) return null;
          return {
            ...seasonWindow,
            missions: [
              {
                id: 'mission-1',
                template: BarMissionTemplate.SCAN_ONCE,
                targetCount: 1,
                seasonId: seasonWindow.id,
              },
            ],
          };
        }),
        findMany: jest.fn(async ({ where }: any) => {
          if (where.barId !== seasonWindow.barId) return [];
          return [{ id: seasonWindow.id, barId: seasonWindow.barId }];
        }),
        findUnique: jest.fn(async () => ({
          ...seasonWindow,
          bar: { businessName: 'Bar X' },
        })),
      },
      barMissionMedalVersion: {
        findMany: jest.fn(async ({ where }: any) => {
          if (where.status && version.status !== where.status) return [];
          return [{ ...version, conditions: version.conditions }];
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.id && where.id !== version.id) return null;
          if (where.seasonId && where.seasonId !== version.seasonId) return null;
          if (where.status && version.status !== where.status) return null;
          return {
            ...version,
            season: {
              id: seasonWindow.id,
              barId: seasonWindow.barId,
              bar: { businessName: 'Bar X' },
            },
          };
        }),
        findUnique: jest.fn(async () => ({ ...version, season: seasonWindow })),
      },
      userBarMedal: {
        findUnique: jest.fn(async ({ where }: any) =>
          medals.find(
            (m) =>
              m.userId === where.userId_seasonId.userId &&
              m.seasonId === where.userId_seasonId.seasonId,
          ) ?? null,
        ),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `medal-${medals.length + 1}`, ...data };
          medals.push(row);
          return row;
        }),
      },
      user: {
        findFirst: jest.fn(async () => ({
          id: 'u1',
          coins: 0,
          loginStreakDays: 0,
          lastLoginEpochDay: 0,
          streakBonusTierClaimed: 0,
          dailyChestClaimedDay: 0,
          totalXp: 10,
          level: 1,
        })),
      },
      barMission: { count: jest.fn(async () => 1) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    const users = {
      grantRewardOnce: jest.fn(async (_u: string, user: any, grant: any) => {
        rewards.push(grant);
        return { ...user, totalXp: user.totalXp + grant.xp };
      }),
    };
    const notificationsSvc = {
      persistNotification: notificationsPersist,
      deliverAfterPersist: notificationsDeliver,
      create: jest.fn(),
    };

    const resolver = new BarMissionMedalActiveResolver(prisma);
    const progress = new BarMissionMedalProgressService(prisma, resolver);
    const unlock = new BarMissionMedalUnlockService(
      prisma,
      users as any,
      notificationsSvc as any,
    );
    activity = new BarMissionMedalActivityService(prisma, progress, unlock);
    barMissions = new BarMissionsService(
      prisma,
      { resolveByOwnerUserId: jest.fn(), isSubscriptionActive: () => true } as any,
      progress,
      activity,
    );
  });

  it('TEST 11-13: QR USED visible; 2 drinks DISTINCT → unlock drinks-only', async () => {
    version = buildVersion(BarMissionMedalConditionMode.ALL, [
      {
        id: 'c-d',
        type: BarMissionMedalConditionType.DRINKS_UNLOCKED,
        targetValue: 2,
        referenceId: null,
        position: 0,
      },
    ]);
    qrDrinks = ['d1', 'd2'];
    // Simula post-commit: QrSession USED ya consultable
    expect(prisma.qrSession.findMany).toBeDefined();
    await barMissions.onQrUnlock('u1', 'bar-1', new Date('2026-10-10T12:00:00Z'));
    expect(medals).toHaveLength(1);
    expect(notificationsPersist).toHaveBeenCalledTimes(1);
    expect(notificationsDeliver).toHaveBeenCalledTimes(1);
    expect(rewards).toHaveLength(1);
  });

  it('TEST 14: misma bebida no incrementa DISTINCT', async () => {
    version = buildVersion(BarMissionMedalConditionMode.ALL, [
      {
        id: 'c-d',
        type: BarMissionMedalConditionType.DRINKS_UNLOCKED,
        targetValue: 2,
        referenceId: null,
        position: 0,
      },
    ]);
    qrDrinks = ['d1']; // distinct mock returns one
    await barMissions.onQrUnlock('u1', 'bar-1');
    expect(medals).toHaveLength(0);
  });

  it('TEST 17: DRINKS-only sin misión SCAN → evalúa igual', async () => {
    version = buildVersion(BarMissionMedalConditionMode.ALL, [
      {
        id: 'c-d',
        type: BarMissionMedalConditionType.DRINKS_UNLOCKED,
        targetValue: 1,
        referenceId: null,
        position: 0,
      },
    ]);
    prisma.barMissionSeason.findFirst.mockResolvedValueOnce({
      ...seasonWindow,
      missions: [],
    });
    qrDrinks = ['d1'];
    await barMissions.onQrUnlock('u1', 'bar-1');
    expect(medals).toHaveLength(1);
  });

  it('TEST 18: QR completa drinks + misión en ALL', async () => {
    qrDrinks = ['d1', 'd2'];
    visitsCount = 3;
    // onQrUnlock upsert marcará mission-1 completa vía SCAN_ONCE
    await barMissions.onQrUnlock('u1', 'bar-1');
    expect(medals).toHaveLength(1);
  });

  it('TEST 19: una sola evaluación lógica por QR (una notificación)', async () => {
    version = buildVersion(BarMissionMedalConditionMode.ALL, [
      {
        id: 'c-d',
        type: BarMissionMedalConditionType.DRINKS_UNLOCKED,
        targetValue: 1,
        referenceId: null,
        position: 0,
      },
    ]);
    qrDrinks = ['d1'];
    await barMissions.onQrUnlock('u1', 'bar-1');
    expect(notificationsDeliver).toHaveBeenCalledTimes(1);
  });

  it('TEST 20: error medalla no rompe onQrUnlock', async () => {
    prisma.userBarMedal.create.mockRejectedValueOnce(new Error('db down'));
    version = buildVersion(BarMissionMedalConditionMode.ALL, [
      {
        id: 'c-d',
        type: BarMissionMedalConditionType.DRINKS_UNLOCKED,
        targetValue: 1,
        referenceId: null,
        position: 0,
      },
    ]);
    qrDrinks = ['d1'];
    await expect(barMissions.onQrUnlock('u1', 'bar-1')).resolves.toBeUndefined();
  });

  it('TEST 21-24: misión completa → unlock', async () => {
    version = buildVersion(BarMissionMedalConditionMode.ALL, [
      {
        id: 'c-m',
        type: BarMissionMedalConditionType.MISSION_COMPLETED,
        targetValue: 1,
        referenceId: 'mission-1',
        position: 0,
      },
    ]);
    expect(medals).toHaveLength(0);
    completedMissions.add('mission-1');
    await activity.evaluateAndMaybeUnlock('u1', 'season-1', 'bar-1');
    expect(medals).toHaveLength(1);
  });

  it('TEST 25: RESERVE_PARTY_OF_TWO → reevaluación', async () => {
    version = buildVersion(BarMissionMedalConditionMode.ALL, [
      {
        id: 'c-m',
        type: BarMissionMedalConditionType.MISSION_COMPLETED,
        targetValue: 1,
        referenceId: 'mission-reserve',
        position: 0,
      },
    ]);
    prisma.barMissionSeason.findFirst.mockResolvedValueOnce({
      ...seasonWindow,
      missions: [
        {
          id: 'mission-reserve',
          template: BarMissionTemplate.RESERVE_PARTY_OF_TWO,
          targetCount: 1,
        },
      ],
    });
    await barMissions.onReservationConfirmed('u1', 'bar-1', 2);
    expect(completedMissions.has('mission-reserve')).toBe(true);
    expect(medals).toHaveLength(1);
  });

  it('TEST 28-30: ALL parcial no unlock; completo sí', async () => {
    visitsCount = 3;
    qrDrinks = ['d1']; // falta 1 drink
    completedMissions.add('mission-1');
    await activity.evaluateAndMaybeUnlock('u1', 'season-1', 'bar-1');
    expect(medals).toHaveLength(0);
    qrDrinks = ['d1', 'd2'];
    await activity.evaluateAndMaybeUnlock('u1', 'season-1', 'bar-1');
    expect(medals).toHaveLength(1);
  });

  it('TEST 31/32: ANY unlock con una condición', async () => {
    version = buildVersion(BarMissionMedalConditionMode.ANY, version.conditions);
    visitsCount = 3;
    qrDrinks = [];
    completedMissions.clear();
    await activity.evaluateAndMaybeUnlock('u1', 'season-1', 'bar-1');
    expect(medals).toHaveLength(1);
  });

  it('TEST 33: ANY + unsupported → NO unlock', async () => {
    version = buildVersion(BarMissionMedalConditionMode.ANY, [
      {
        id: 'c-v',
        type: BarMissionMedalConditionType.VISITS,
        targetValue: 1,
        referenceId: null,
        position: 0,
      },
      {
        id: 'c-e',
        type: BarMissionMedalConditionType.EVENT_PARTICIPATION,
        targetValue: 1,
        referenceId: null,
        position: 1,
      },
    ]);
    visitsCount = 10;
    await activity.evaluateAndMaybeUnlock('u1', 'season-1', 'bar-1');
    expect(medals).toHaveLength(0);
  });

  it('TEST legacy: 3× MISSION_COMPLETED ALL', async () => {
    version = buildVersion(BarMissionMedalConditionMode.ALL, [
      {
        id: 'm1',
        type: BarMissionMedalConditionType.MISSION_COMPLETED,
        targetValue: 1,
        referenceId: 'a',
        position: 0,
      },
      {
        id: 'm2',
        type: BarMissionMedalConditionType.MISSION_COMPLETED,
        targetValue: 1,
        referenceId: 'b',
        position: 1,
      },
      {
        id: 'm3',
        type: BarMissionMedalConditionType.MISSION_COMPLETED,
        targetValue: 1,
        referenceId: 'c',
        position: 2,
      },
    ]);
    completedMissions.add('a');
    await activity.evaluateAndMaybeUnlock('u1', 'season-1', 'bar-1');
    expect(medals).toHaveLength(0);
    completedMissions.add('b');
    await activity.evaluateAndMaybeUnlock('u1', 'season-1', 'bar-1');
    expect(medals).toHaveLength(0);
    completedMissions.add('c');
    await activity.evaluateAndMaybeUnlock('u1', 'season-1', 'bar-1');
    expect(medals).toHaveLength(1);
  });

  it('TEST 15: QR otro bar no afecta', async () => {
    version = buildVersion(BarMissionMedalConditionMode.ALL, [
      {
        id: 'c-d',
        type: BarMissionMedalConditionType.DRINKS_UNLOCKED,
        targetValue: 1,
        referenceId: null,
        position: 0,
      },
    ]);
    qrDrinks = ['d1'];
    await barMissions.onQrUnlock('u1', 'bar-other');
    expect(medals).toHaveLength(0);
  });
});
