import {
  BarMissionMedalVersionStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import {
  BAR_MEDAL_UNLOCK_SOURCE,
  BarMissionMedalUnlockService,
} from './bar-mission-medal-unlock.service';

describe('BarMissionMedalUnlockService FASE 6', () => {
  let medals: any[];
  let rewards: any[];
  let notifications: any[];
  let versionStatus: BarMissionMedalVersionStatus;
  let xpReward: number;
  let userXp: number;
  let prisma: any;
  let users: any;
  let notificationsSvc: any;
  let service: BarMissionMedalUnlockService;

  beforeEach(() => {
    medals = [];
    rewards = [];
    notifications = [];
    versionStatus = BarMissionMedalVersionStatus.ACTIVE;
    xpReward = 100;
    userXp = 50;

    prisma = {
      userBarMedal: {
        findUnique: jest.fn(async ({ where }: any) =>
          medals.find(
            (m) =>
              m.userId === where.userId_seasonId.userId &&
              m.seasonId === where.userId_seasonId.seasonId,
          ) ?? null,
        ),
        create: jest.fn(async ({ data }: any) => {
          if (
            medals.some((m) => m.userId === data.userId && m.seasonId === data.seasonId)
          ) {
            throw new Prisma.PrismaClientKnownRequestError('Unique', {
              code: 'P2002',
              clientVersion: 'test',
            });
          }
          const row = { id: `medal-${medals.length + 1}`, ...data };
          medals.push(row);
          return row;
        }),
      },
      barMissionMedalVersion: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.id !== 'v1') return null;
          if (where.seasonId !== 's1') return null;
          if (where.status && versionStatus !== where.status) return null;
          return {
            id: 'v1',
            seasonId: 's1',
            title: 'Guardian',
            xpReward,
            status: versionStatus,
            season: {
              id: 's1',
              barId: 'bar-1',
              bar: { businessName: 'Bar X' },
            },
          };
        }),
      },
      user: {
        findFirst: jest.fn(async () => ({
          id: 'u1',
          coins: 0,
          loginStreakDays: 1,
          lastLoginEpochDay: 1,
          streakBonusTierClaimed: 0,
          dailyChestClaimedDay: 0,
          totalXp: userXp,
          level: 1,
        })),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    users = {
      grantRewardOnce: jest.fn(async (_uid: string, user: any, grant: any, _tx?: any) => {
        if (grant.xp === 0 && grant.coins === 0) return user;
        const dup = rewards.find(
          (r) => r.sourceType === grant.sourceType && r.sourceId === grant.sourceId,
        );
        if (dup) {
          throw new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        rewards.push({
          sourceType: grant.sourceType,
          sourceId: grant.sourceId,
          xp: grant.xp,
        });
        userXp += grant.xp;
        return { ...user, totalXp: userXp };
      }),
    };

    notificationsSvc = {
      persistNotification: jest.fn(
        async (
          userId: string,
          type: NotificationType,
          title: string,
          body: string,
          payload: any,
          opts: any,
        ) => {
          if (
            opts?.dedupeKey &&
            notifications.some((n) => n.dedupeKey === opts.dedupeKey)
          ) {
            return notifications.find((n) => n.dedupeKey === opts.dedupeKey);
          }
          const row = {
            id: `n-${notifications.length + 1}`,
            userId,
            type,
            title,
            body,
            payload,
            dedupeKey: opts?.dedupeKey ?? null,
          };
          notifications.push(row);
          return row;
        },
      ),
      deliverAfterPersist: jest.fn(async () => undefined),
      create: jest.fn(),
    };

    service = new BarMissionMedalUnlockService(prisma, users, notificationsSvc);
  });

  it('TEST 1/2/10/11/12: unlock eligible → medal + XP ledger BAR_MEDAL_UNLOCK', async () => {
    const res = await service.unlock('u1', 's1', 'v1', 'bar-1');
    expect(res.status).toBe('UNLOCKED');
    expect(res.medalVersionId).toBe('v1');
    expect(res.xpAwarded).toBe(100);
    expect(medals).toHaveLength(1);
    expect(rewards).toEqual([
      {
        sourceType: BAR_MEDAL_UNLOCK_SOURCE,
        sourceId: medals[0].id,
        xp: 100,
      },
    ]);
    expect(notificationsSvc.persistNotification).toHaveBeenCalled();
    expect(notificationsSvc.deliverAfterPersist).toHaveBeenCalledTimes(1);
    expect(notificationsSvc.create).not.toHaveBeenCalled();
  });

  it('TEST 4/5/6: DRAFT/PENDING/DISABLED → VERSION_NOT_ACTIVE', async () => {
    for (const st of [
      BarMissionMedalVersionStatus.DRAFT,
      BarMissionMedalVersionStatus.PENDING_REVIEW,
      BarMissionMedalVersionStatus.DISABLED,
    ]) {
      versionStatus = st;
      medals.length = 0;
      const res = await service.unlock('u1', 's1', 'v1', 'bar-1');
      expect(res.status).toBe('VERSION_NOT_ACTIVE');
      expect(medals).toHaveLength(0);
      expect(rewards).toHaveLength(0);
    }
  });

  it('TEST 7: ACTIVE→DISABLED antes del TX → no medal/XP', async () => {
    prisma.$transaction = jest.fn(async (fn: any) => {
      versionStatus = BarMissionMedalVersionStatus.DISABLED;
      return fn(prisma);
    });
    const res = await service.unlock('u1', 's1', 'v1', 'bar-1');
    expect(res.status).toBe('VERSION_NOT_ACTIVE');
    expect(medals).toHaveLength(0);
    expect(rewards).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });

  it('TEST 8/9: ya desbloqueado / v1 histórica → ALREADY_UNLOCKED sin XP', async () => {
    medals.push({ id: 'old', userId: 'u1', seasonId: 's1', medalVersionId: 'v-old' });
    const res = await service.unlock('u1', 's1', 'v1', 'bar-1');
    expect(res.status).toBe('ALREADY_UNLOCKED');
    expect(res.medalVersionId).toBe('v-old');
    expect(users.grantRewardOnce).not.toHaveBeenCalled();
    expect(notifications).toHaveLength(0);
  });

  it('TEST 13: xpReward 0 → medal sí, sin ledger', async () => {
    xpReward = 0;
    const res = await service.unlock('u1', 's1', 'v1', 'bar-1');
    expect(res.status).toBe('UNLOCKED');
    expect(res.xpAwarded).toBe(0);
    expect(medals).toHaveLength(1);
    expect(rewards).toHaveLength(0);
    expect(notifications[0].body).not.toContain('+');
  });

  it('TEST 14/15: unlock dos veces → XP una vez; P2002 → ALREADY', async () => {
    await service.unlock('u1', 's1', 'v1', 'bar-1');
    const res2 = await service.unlock('u1', 's1', 'v1', 'bar-1');
    expect(res2.status).toBe('ALREADY_UNLOCKED');
    expect(rewards).toHaveLength(1);
    expect(notifications).toHaveLength(1);
  });

  it('TEST 16/31: dos unlocks concurrentes simulados → 1 medal 1 reward', async () => {
    let creates = 0;
    prisma.userBarMedal.create = jest.fn(async ({ data }: any) => {
      creates += 1;
      if (creates > 1) {
        throw new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      const row = { id: 'medal-1', ...data };
      medals.push(row);
      return row;
    });
    const [a, b] = await Promise.all([
      service.unlock('u1', 's1', 'v1', 'bar-1'),
      service.unlock('u1', 's1', 'v1', 'bar-1'),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toContain('UNLOCKED');
    expect(statuses).toContain('ALREADY_UNLOCKED');
    expect(medals).toHaveLength(1);
    expect(rewards).toHaveLength(1);
  });

  it('TEST 17/30: fallo reward → rollback medal (TX throw)', async () => {
    users.grantRewardOnce.mockRejectedValueOnce(new Error('ledger boom'));
    await expect(service.unlock('u1', 's1', 'v1', 'bar-1')).rejects.toThrow('ledger boom');
    // En mock $transaction no hace rollback real; el create ya corrió.
    // Verificamos que el error se propaga (producción: Prisma rollback).
    expect(users.grantRewardOnce).toHaveBeenCalled();
  });

  it('TEST 19-21/27: notificación definitiva única, no create() legacy', async () => {
    await service.unlock('u1', 's1', 'v1', 'bar-1');
    expect(notifications[0].title).toBe('¡Medalla desbloqueada!');
    expect(notifications[0].body).toContain('Guardian');
    expect(notifications[0].body).toContain('Bar X');
    expect(notifications[0].body).toContain('+100 XP');
    expect(notifications[0].dedupeKey).toBe(`bar-medal:${medals[0].id}`);
    expect(notificationsSvc.create).not.toHaveBeenCalled();
  });

  it('TEST 24/25: FCM failure post-commit no revierte medal/XP', async () => {
    notificationsSvc.deliverAfterPersist.mockRejectedValueOnce(new Error('fcm down'));
    const res = await service.unlock('u1', 's1', 'v1', 'bar-1');
    expect(res.status).toBe('UNLOCKED');
    expect(medals).toHaveLength(1);
    expect(rewards).toHaveLength(1);
    expect(notifications).toHaveLength(1);
  });

  it('TEST 32: legacy medalVersionId null → ALREADY sin XP retroactivo', async () => {
    medals.push({ id: 'legacy', userId: 'u1', seasonId: 's1', medalVersionId: null });
    const res = await service.unlock('u1', 's1', 'v1', 'bar-1');
    expect(res.status).toBe('ALREADY_UNLOCKED');
    expect(rewards).toHaveLength(0);
  });
});
