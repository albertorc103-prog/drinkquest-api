import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService syncGamification FASE 4.1', () => {
  function baseUser(over: Record<string, unknown> = {}) {
    return {
      id: 'u1',
      coins: 10,
      loginStreakDays: 1,
      lastLoginEpochDay: 20000,
      streakBonusTierClaimed: 0,
      dailyChestClaimedDay: 0,
      totalXp: 100,
      level: 2,
      questProgress: {} as Record<string, unknown>,
      achievementProgress: {} as Record<string, unknown>,
      ...over,
    };
  }

  function makePrisma(over: Record<string, unknown> = {}) {
    const user = baseUser(over) as Record<string, any>;
    const rewards: Array<{ sourceType: string; sourceId: string }> = [];
    const prisma: any = {
      user: {
        findFirst: jest.fn(async ({ select }: any) => {
          if (select?.questProgress !== undefined || select?.achievementProgress !== undefined) {
            return {
              questProgress: user.questProgress ?? {},
              achievementProgress: user.achievementProgress ?? {},
            };
          }
          return { ...user };
        }),
        update: jest.fn(async ({ data }: any) => {
          if (data.coins?.increment) user.coins += data.coins.increment;
          else if (typeof data.coins === 'number') user.coins = data.coins;
          if (typeof data.totalXp === 'number') user.totalXp = data.totalXp;
          if (typeof data.level === 'number') user.level = data.level;
          if (typeof data.dailyChestClaimedDay === 'number') {
            user.dailyChestClaimedDay = data.dailyChestClaimedDay;
          }
          if (typeof data.streakBonusTierClaimed === 'number') {
            user.streakBonusTierClaimed = data.streakBonusTierClaimed;
          }
          if (data.questProgress) user.questProgress = data.questProgress;
          if (data.achievementProgress) {
            user.achievementProgress = data.achievementProgress;
          }
          return { ...user };
        }),
      },
      mission: {
        findMany: jest.fn(async () => []),
      },
      achievement: {
        findMany: jest.fn(async () => []),
      },
      gamificationReward: {
        create: jest.fn(async ({ data }: any) => {
          const dup = rewards.find(
            (r) => r.sourceType === data.sourceType && r.sourceId === data.sourceId,
          );
          if (dup) {
            throw new Prisma.PrismaClientKnownRequestError('dup', {
              code: 'P2002',
              clientVersion: 'test',
            });
          }
          rewards.push({ sourceType: data.sourceType, sourceId: data.sourceId });
          return { id: 'gr1', ...data };
        }),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
      _rewards: rewards,
      _user: user,
    };
    return prisma;
  }

  const accountDeletion = {} as any;

  it('TEST 1: xp arbitrario alto en questProgress → ignorado (sin sumar)', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma, accountDeletion);
    const before = prisma._user.totalXp;
    const res = await service.syncGamification('u1', {
      questProgress: {
        fake_quest: { progress: 1, completedAt: Date.now(), xpReward: 99999 },
      },
    });
    expect(res.totalXp).toBe(before);
    expect(prisma._user.totalXp).toBe(before);
  });

  it('TEST 2: xp=1 repetido → no acumula', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma, accountDeletion);
    const before = prisma._user.totalXp;
    for (let i = 0; i < 20; i++) {
      await service.syncGamification('u1', {
        questProgress: {
          spam: { progress: 1, completedAt: 1 + i, xpReward: 1 },
        },
      });
    }
    expect(prisma._user.totalXp).toBe(before);
  });

  it('TEST 3: coins arbitrarios → ignorados', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma, accountDeletion);
    const res = await service.syncGamification('u1', { coins: 999999 });
    expect(res.coins).toBe(10);
  });

  it('TEST 4: level/xp cliente no altera totalXp', async () => {
    const prisma = makePrisma({ totalXp: 50, level: 1 });
    const service = new UsersService(prisma, accountDeletion);
    const res = await service.syncGamification('u1', {
      questProgress: { x: { progress: 9, completedAt: Date.now(), xpReward: 500 } },
    });
    expect(res.totalXp).toBe(50);
    expect(res.level).toBe(1);
  });

  it('TEST 9/10: misión catálogo backend → XP; inexistente → 0; replay seguro', async () => {
    const prisma = makePrisma();
    prisma.mission.findMany = jest.fn(async ({ where }: any) => {
      const slugs: string[] = where.slug.in;
      return slugs
        .filter((s) => s === 'first-qr')
        .map((slug) => ({ slug, xpReward: 50 }));
    });
    const service = new UsersService(prisma, accountDeletion);
    const res = await service.syncGamification('u1', {
      questProgress: {
        'first-qr': { progress: 1, completedAt: Date.now(), periodEpochDay: 20001 },
        'no-existe': { progress: 1, completedAt: Date.now(), xpReward: 999 },
      },
    });
    expect(res.totalXp).toBe(150);
    const res2 = await service.syncGamification('u1', {
      questProgress: {
        'first-qr': { progress: 1, completedAt: Date.now(), periodEpochDay: 20001 },
      },
    });
    expect(res2.totalXp).toBe(150);
  });

  it('TEST daily chest: solo día actual + ledger anti-replay', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma, accountDeletion);
    const today = Math.floor(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ) / 86_400_000,
    );
    const res = await service.syncGamification('u1', { dailyChestClaimedDay: today });
    expect(res.coins).toBe(60);
    const res2 = await service.syncGamification('u1', { dailyChestClaimedDay: today });
    expect(res2.coins).toBe(60);
  });

  it('grantRewardOnce con tx no anida $transaction (FASE 6)', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma, accountDeletion);
    const user = {
      id: 'u1',
      coins: 10,
      loginStreakDays: 1,
      lastLoginEpochDay: 1,
      streakBonusTierClaimed: 0,
      dailyChestClaimedDay: 0,
      totalXp: 100,
      level: 2,
    };
    const outerTx = prisma;
    const beforeCalls = prisma.$transaction.mock.calls.length;
    const next = await service.grantRewardOnce(
      'u1',
      user,
      { sourceType: 'BAR_MEDAL_UNLOCK', sourceId: 'medal-1', xp: 40, coins: 0 },
      outerTx,
    );
    expect(next.totalXp).toBe(140);
    expect(prisma.$transaction.mock.calls.length).toBe(beforeCalls);
    expect(prisma._rewards).toContainEqual(
      expect.objectContaining({ sourceType: 'BAR_MEDAL_UNLOCK', sourceId: 'medal-1' }),
    );
  });
});
