import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMissionMedalConditionMode,
  BarMissionMedalConditionType,
  BarMissionMedalVersionStatus,
  BarMissionSeasonStatus,
  QrSessionStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { BarMissionMedalActiveResolver } from './bar-mission-medal-active.resolver';
import { BarMissionMedalProgressService } from './bar-mission-medal-progress.service';
import { BarMissionMedalPublicService } from './bar-mission-medal-public.service';
import { BarMissionMedalStatsService } from './bar-mission-medal-stats.service';

describe('FASE 7 public medal + stats APIs', () => {
  const now = new Date();
  const season = {
    id: 's1',
    barId: 'bar-1',
    startsAt: new Date(now.getTime() - 86400000 * 10),
    endsAt: new Date(now.getTime() + 86400000 * 20),
    status: BarMissionSeasonStatus.ACTIVE,
    deletedAt: null,
    medalTitle: 'Legacy Title',
    medalDescription: 'Legacy Desc',
  };

  let version: any;
  let medals: any[];
  let visits: any[];
  let qrSessions: any[];
  let missionProgress: any[];
  let prisma: any;
  let publicSvc: BarMissionMedalPublicService;
  let statsSvc: BarMissionMedalStatsService;
  let progress: BarMissionMedalProgressService;

  beforeEach(() => {
    medals = [];
    visits = [];
    qrSessions = [];
    missionProgress = [];
    version = {
      id: 'v-active',
      seasonId: 's1',
      title: 'Guardian',
      description: 'Desc',
      status: BarMissionMedalVersionStatus.ACTIVE,
      conditionMode: BarMissionMedalConditionMode.ALL,
      xpReward: 50,
      templateId: null,
      designConfig: null,
      conditions: [
        {
          id: 'c1',
          type: BarMissionMedalConditionType.VISITS,
          targetValue: 3,
          referenceId: null,
          position: 0,
        },
        {
          id: 'c2',
          type: BarMissionMedalConditionType.DRINKS_UNLOCKED,
          targetValue: 2,
          referenceId: null,
          position: 1,
        },
        {
          id: 'c3',
          type: BarMissionMedalConditionType.MISSION_COMPLETED,
          targetValue: 1,
          referenceId: 'm1',
          position: 2,
        },
      ],
    };

    prisma = {
      bar: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === 'bar-1' ? { id: 'bar-1' } : null,
        ),
      },
      barMissionSeason: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.id && where.id !== 's1') return null;
          if (where.barId && where.barId !== 'bar-1') return null;
          return { ...season };
        }),
      },
      barMissionMedalVersion: {
        findMany: jest.fn(async ({ where }: any) => {
          if (where.status && version.status !== where.status) return [];
          return [{ ...version, conditions: version.conditions }];
        }),
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === version.id ? { ...version, xpReward: version.xpReward } : null,
        ),
        findFirst: jest.fn(async () => ({
          ...version,
          season: { id: 's1', barId: 'bar-1', bar: { businessName: 'Bar' } },
        })),
      },
      barMission: {
        findMany: jest.fn(async () => [
          { id: 'm1', title: 'Mission One', description: 'Do it' },
        ]),
      },
      userBarMedal: {
        findFirst: jest.fn(async ({ where }: any) =>
          medals.find((m) => m.userId === where.userId && m.barId === where.barId) ?? null,
        ),
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.id) return medals.find((m) => m.id === where.id) ?? null;
          if (where.userId_seasonId) {
            return (
              medals.find(
                (m) =>
                  m.userId === where.userId_seasonId.userId &&
                  m.seasonId === where.userId_seasonId.seasonId,
              ) ?? null
            );
          }
          return null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          let rows = medals.filter((m) => {
            if (where.userId && m.userId !== where.userId) return false;
            if (where.seasonId && m.seasonId !== where.seasonId) return false;
            if (where.unlockedAt?.gte && m.unlockedAt < where.unlockedAt.gte) return false;
            return true;
          });
          return rows;
        }),
        count: jest.fn(async ({ where }: any) => {
          return medals.filter((m) => {
            if (where.seasonId && m.seasonId !== where.seasonId) return false;
            if (where.unlockedAt?.gte && m.unlockedAt < where.unlockedAt.gte) return false;
            if (where.userId && m.userId !== where.userId) return false;
            return true;
          }).length;
        }),
      },
      placeVisit: {
        findMany: jest.fn(async ({ where }: any) => {
          const rows = visits.filter(
            (v) =>
              v.barId === where.barId &&
              v.visitedAt >= where.visitedAt.gte &&
              v.visitedAt <= where.visitedAt.lte,
          );
          const seen = new Set<string>();
          return rows.filter((r) => {
            if (seen.has(r.userId)) return false;
            seen.add(r.userId);
            return true;
          });
        }),
        groupBy: jest.fn(async ({ where }: any) => {
          const map = new Map<string, number>();
          for (const v of visits) {
            if (v.barId !== where.barId) continue;
            if (v.visitedAt < where.visitedAt.gte || v.visitedAt > where.visitedAt.lte) continue;
            map.set(v.userId, (map.get(v.userId) ?? 0) + 1);
          }
          return [...map.entries()].map(([userId, n]) => ({
            userId,
            _count: { _all: n },
          }));
        }),
        count: jest.fn(async () => 0),
      },
      qrSession: {
        findMany: jest.fn(async ({ where }: any) => {
          const rows = qrSessions.filter(
            (q) =>
              q.barId === where.barId &&
              q.status === QrSessionStatus.USED &&
              q.usedAt >= where.usedAt.gte &&
              q.usedAt <= where.usedAt.lte,
          );
          if (where) {
            /* distinct scannedById handled loosely */
          }
          const seen = new Set<string>();
          return rows
            .filter((r) => {
              if (!r.scannedById || seen.has(r.scannedById)) return false;
              seen.add(r.scannedById);
              return true;
            })
            .map((r) => ({ scannedById: r.scannedById, drinkId: r.drinkId }));
        }),
      },
      userBarMissionProgress: {
        findMany: jest.fn(async ({ where }: any) => {
          const ids: string[] = where.missionId?.in ?? [];
          const rows = missionProgress.filter((p) => ids.includes(p.missionId));
          const seen = new Set<string>();
          return rows.filter((r) => {
            if (seen.has(r.userId)) return false;
            seen.add(r.userId);
            return true;
          });
        }),
        count: jest.fn(async ({ where }: any) =>
          missionProgress.filter(
            (p) => p.missionId === where.missionId && p.completedAt,
          ).length,
        ),
      },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg(prisma);
      }),
      $queryRaw: jest.fn(async () => {
        throw new Error('no raw in unit test');
      }),
    };

    const resolver = new BarMissionMedalActiveResolver(prisma);
    progress = new BarMissionMedalProgressService(prisma, resolver);
    publicSvc = new BarMissionMedalPublicService(prisma, resolver, progress);

    const barAccess = {
      resolveByOwnerUserId: jest.fn(async (uid: string) => {
        if (uid === 'owner-a') {
          return {
            bar: { id: 'bar-1' },
            subscription: { plan: SubscriptionPlan.LEGEND, status: SubscriptionStatus.ACTIVE },
          };
        }
        if (uid === 'owner-b') {
          return {
            bar: { id: 'bar-b' },
            subscription: { plan: SubscriptionPlan.LEGEND, status: SubscriptionStatus.ACTIVE },
          };
        }
        return {
          bar: { id: 'bar-1' },
          subscription: {
            plan: SubscriptionPlan.EXPLORER,
            status: SubscriptionStatus.ACTIVE,
          },
        };
      }),
      isSubscriptionActive: () => true,
    };
    statsSvc = new BarMissionMedalStatsService(prisma, barAccess as any, resolver);
  });

  it('TEST 1: ACTIVE medal visible', async () => {
    const res = await publicSvc.getPublicBarMedal('bar-1');
    expect(res.available).toBe(true);
    if (res.available) {
      expect(res.title).toBe('Guardian');
      expect(res).not.toHaveProperty('reviewNote');
      expect(res).not.toHaveProperty('moderatedByAdminId');
    }
  });

  it('TEST 2/3/4: sin ACTIVE / DRAFT / PENDING → unavailable', async () => {
    version.status = BarMissionMedalVersionStatus.DRAFT;
    expect((await publicSvc.getPublicBarMedal('bar-1')).available).toBe(false);
    version.status = BarMissionMedalVersionStatus.PENDING_REVIEW;
    expect((await publicSvc.getPublicBarMedal('bar-1')).available).toBe(false);
  });

  it('TEST 5/7: progreso propio unlocked', async () => {
    medals.push({
      id: 'ubm1',
      userId: 'u1',
      barId: 'bar-1',
      seasonId: 's1',
      medalVersionId: 'v1-earned',
      unlockedAt: new Date(),
      medalVersion: {
        id: 'v1-earned',
        title: 'V1',
        description: 'Old',
        conditionMode: BarMissionMedalConditionMode.ALL,
        xpReward: 10,
        conditions: [],
      },
      season,
      bar: { id: 'bar-1', businessName: 'Bar', logoUrl: null, slug: 'bar' },
      userId_check: 'u1',
    });
    // findUnique for progress earned
    prisma.userBarMedal.findUnique = jest.fn(async ({ where }: any) => {
      if (where.userId_seasonId?.userId === 'u1') {
        return {
          ...medals[0],
          medalVersion: medals[0].medalVersion,
        };
      }
      return null;
    });
    const res = await publicSvc.getProgressByBarId('u1', 'bar-1');
    expect(res.available).toBe(true);
    expect(res.unlocked).toBe(true);
    expect(res.overallProgress).toBe(100);
  });

  it('TEST 8: v1 obtenida + v2 ACTIVE → histórico v1', async () => {
    prisma.userBarMedal.findUnique = jest.fn(async () => ({
      id: 'ubm1',
      medalVersionId: 'v1',
      unlockedAt: new Date(),
      medalVersion: {
        id: 'v1',
        title: 'Old Guard',
        description: 'v1',
        conditionMode: BarMissionMedalConditionMode.ALL,
        conditions: [],
      },
    }));
    prisma.userBarMedal.findFirst = jest.fn(async () => ({ seasonId: 's1' }));
    const res = await publicSvc.getProgressByBarId('u1', 'bar-1');
    expect(res.unlocked).toBe(true);
    expect(res.medalVersionId).toBe('v1');
    expect(res.title).toBe('Old Guard');
  });

  it('TEST 9: legacy medalVersionId null', async () => {
    medals.push({
      id: 'leg',
      userId: 'u1',
      barId: 'bar-1',
      seasonId: 's1',
      medalVersionId: null,
      unlockedAt: new Date('2026-10-01'),
      medalVersion: null,
      season: { id: 's1', medalTitle: 'Legacy Title', medalDescription: 'Legacy Desc' },
      bar: { id: 'bar-1', businessName: 'Bar X', logoUrl: null, slug: 'x' },
    });
    prisma.userBarMedal.findMany = jest.fn(async () => medals);
    prisma.userBarMedal.count = jest.fn(async () => 1);
    const list = await publicSvc.listMyBarMedals('u1', 1, 20);
    expect(list.items[0].legacy).toBe(true);
    expect(list.items[0].title).toBe('Legacy Title');
  });

  it('TEST 10/11: listado paginado DESC', async () => {
    medals.push(
      {
        id: 'a',
        userId: 'u1',
        unlockedAt: new Date('2026-10-02'),
        medalVersionId: 'v',
        medalVersion: {
          title: 'A',
          description: 'd',
          xpReward: 1,
          templateId: null,
          designConfig: null,
        },
        season: { id: 's1', medalTitle: 't', medalDescription: 'd' },
        bar: { id: 'bar-1', businessName: 'B', logoUrl: null, slug: 'b' },
      },
      {
        id: 'b',
        userId: 'u1',
        unlockedAt: new Date('2026-10-05'),
        medalVersionId: 'v',
        medalVersion: {
          title: 'B',
          description: 'd',
          xpReward: 1,
          templateId: null,
          designConfig: null,
        },
        season: { id: 's1', medalTitle: 't', medalDescription: 'd' },
        bar: { id: 'bar-1', businessName: 'B', logoUrl: null, slug: 'b' },
      },
    );
    prisma.userBarMedal.findMany = jest.fn(async ({ orderBy, skip, take }: any) => {
      const sorted = [...medals].sort((x, y) =>
        orderBy.unlockedAt === 'desc'
          ? y.unlockedAt.getTime() - x.unlockedAt.getTime()
          : x.unlockedAt.getTime() - y.unlockedAt.getTime(),
      );
      return sorted.slice(skip, skip + take);
    });
    prisma.userBarMedal.count = jest.fn(async () => 2);
    const list = await publicSvc.listMyBarMedals('u1', 1, 20);
    expect(list.total).toBe(2);
    expect(list.items[0].title).toBe('B');
  });

  it('TEST 12/13: detail solo owner', async () => {
    medals.push({
      id: 'ubm1',
      userId: 'u1',
      medalVersionId: 'v',
      unlockedAt: new Date(),
      medalVersion: {
        title: 'T',
        description: 'D',
        xpReward: 5,
        conditionMode: BarMissionMedalConditionMode.ALL,
        templateId: null,
        designConfig: null,
        conditions: [],
      },
      season: {
        id: 's1',
        title: 'S',
        medalTitle: 'T',
        medalDescription: 'D',
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        status: BarMissionSeasonStatus.ACTIVE,
      },
      bar: {
        id: 'bar-1',
        businessName: 'B',
        logoUrl: null,
        slug: 'b',
        bannerUrl: null,
      },
    });
    prisma.userBarMedal.findUnique = jest.fn(async ({ where }: any) =>
      medals.find((m) => m.id === where.id) ?? null,
    );
    await expect(publicSvc.getMyBarMedalDetail('u1', 'ubm1')).resolves.toMatchObject({
      userBarMedalId: 'ubm1',
      title: 'T',
    });
    await expect(publicSvc.getMyBarMedalDetail('u2', 'ubm1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('TEST 14: public no expone review fields', async () => {
    const res = await publicSvc.getPublicBarMedal('bar-1');
    expect(JSON.stringify(res)).not.toContain('reviewNote');
    expect(JSON.stringify(res)).not.toContain('moderatedByAdminId');
  });

  it('TEST 15/17: BAR owner stats; sin entitlement bloqueado', async () => {
    await expect(statsSvc.getSeasonStats('owner-a', 's1')).resolves.toMatchObject({
      seasonId: 's1',
      totalUnlocked: 0,
    });
    await expect(statsSvc.getSeasonStats('owner-explorer', 's1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST 16: BAR B no ve season de BAR A', async () => {
    await expect(statsSvc.getSeasonStats('owner-b', 's1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('TEST 18-25: unlock counts + started/inProgress/completionRate', async () => {
    const t = new Date();
    medals.push(
      { userId: 'u1', seasonId: 's1', unlockedAt: t },
      { userId: 'u2', seasonId: 's1', unlockedAt: new Date(t.getTime() - 10 * 86400000) },
    );
    visits.push(
      { userId: 'u1', barId: 'bar-1', visitedAt: t },
      { userId: 'u1', barId: 'bar-1', visitedAt: t },
      { userId: 'u3', barId: 'bar-1', visitedAt: t },
    );
    qrSessions.push({
      scannedById: 'u3',
      barId: 'bar-1',
      status: QrSessionStatus.USED,
      usedAt: t,
      drinkId: 'd1',
    });
    missionProgress.push({ userId: 'u4', missionId: 'm1', progress: 1, completedAt: t });

    // Override findMany for qr to return all drinks for breakdown fallback
    const allQr = [
      ...qrSessions,
      { scannedById: 'u3', barId: 'bar-1', status: QrSessionStatus.USED, usedAt: t, drinkId: 'd2' },
    ];
    prisma.qrSession.findMany = jest.fn(async ({ where, distinct }: any) => {
      const rows = allQr.filter(
        (q) =>
          q.barId === where.barId &&
          q.usedAt >= where.usedAt.gte &&
          q.usedAt <= where.usedAt.lte,
      );
      if (distinct?.[0] === 'scannedById') {
        const seen = new Set<string>();
        return rows
          .filter((r) => {
            if (!r.scannedById || seen.has(r.scannedById)) return false;
            seen.add(r.scannedById);
            return true;
          })
          .map((r) => ({ scannedById: r.scannedById }));
      }
      return rows;
    });

    const stats = await statsSvc.getSeasonStats('owner-a', 's1');
    expect(stats.totalUnlocked).toBe(2);
    expect(stats.unlocksLast7Days).toBe(1);
    expect(stats.unlocksLast30Days).toBe(2);
    // started: u1 (visit), u3 (visit+qr), u4 (mission) = 3
    expect(stats.startedUsers).toBe(3);
    // inProgress = started - unlocked = 3 - 2 = 1 (u3 and u4? u1 unlocked; u2 unlocked but maybe not in started)
    // unlocked set = u1,u2; started = u1,u3,u4 → inProgress = u3,u4 = 2
    expect(stats.inProgressUsers).toBe(2);
    expect(stats.completionRate).toBeCloseTo((2 / 3) * 100, 1);
    expect(stats.averageProgress).toBeNull();
    expect(JSON.stringify(stats)).not.toMatch(/@|email|latitude/i);
  });

  it('TEST 26-28: condition breakdown', async () => {
    const t = new Date();
    visits.push(
      { userId: 'u1', barId: 'bar-1', visitedAt: t },
      { userId: 'u1', barId: 'bar-1', visitedAt: t },
      { userId: 'u1', barId: 'bar-1', visitedAt: t },
    );
    qrSessions.push(
      { scannedById: 'u1', barId: 'bar-1', status: QrSessionStatus.USED, usedAt: t, drinkId: 'a' },
      { scannedById: 'u1', barId: 'bar-1', status: QrSessionStatus.USED, usedAt: t, drinkId: 'b' },
    );
    prisma.qrSession.findMany = jest.fn(async () => qrSessions);
    missionProgress.push({ userId: 'u1', missionId: 'm1', completedAt: t });

    const stats = await statsSvc.getSeasonStats('owner-a', 's1');
    const visitsB = stats.conditionBreakdown.find(
      (c) => c.type === BarMissionMedalConditionType.VISITS,
    );
    const drinksB = stats.conditionBreakdown.find(
      (c) => c.type === BarMissionMedalConditionType.DRINKS_UNLOCKED,
    );
    const missionB = stats.conditionBreakdown.find(
      (c) => c.type === BarMissionMedalConditionType.MISSION_COMPLETED,
    );
    expect(visitsB?.usersCompleted).toBe(1);
    expect(drinksB?.usersCompleted).toBe(1);
    expect(missionB?.usersCompleted).toBe(1);
  });

  it('TEST 25: started=0 → completionRate 0', async () => {
    const stats = await statsSvc.getSeasonStats('owner-a', 's1');
    expect(stats.startedUsers).toBe(0);
    expect(stats.completionRate).toBe(0);
  });

  it('TEST 29: unlock trend fallback agrupado', async () => {
    const d1 = new Date(Date.now() - 2 * 86400000);
    const d2 = new Date(Date.now() - 1 * 86400000);
    medals.push(
      { userId: 'u1', seasonId: 's1', unlockedAt: d1 },
      { userId: 'u2', seasonId: 's1', unlockedAt: d1 },
      { userId: 'u3', seasonId: 's1', unlockedAt: d2 },
    );
    const stats = await statsSvc.getSeasonStats('owner-a', 's1');
    expect(stats.unlockTrend.length).toBeGreaterThanOrEqual(1);
    const totalTrend = stats.unlockTrend.reduce((a, b) => a + b.count, 0);
    expect(totalTrend).toBe(3);
  });
});
