import { BarMissionMedalVersionStatus } from '@prisma/client';
import { BarMissionMedalActivityService } from './bar-mission-medal-activity.service';

describe('BarMissionMedalActivityService FASE 6 (orquestación)', () => {
  let prisma: any;
  let medalProgress: any;
  let unlockService: any;
  let service: BarMissionMedalActivityService;

  beforeEach(() => {
    prisma = {
      userBarMedal: {
        findUnique: jest.fn(async () => null),
      },
      barMissionSeason: {
        findMany: jest.fn(async ({ where }: any) => {
          if (where.barId === 'bar-1') return [{ id: 's1', barId: 'bar-1' }];
          if (where.barId === 'bar-ambiguous') {
            return [
              { id: 's1', barId: 'bar-ambiguous' },
              { id: 's2', barId: 'bar-ambiguous' },
            ];
          }
          return [];
        }),
      },
    };
    medalProgress = {
      isEligibleToUnlock: jest.fn(async () => ({
        eligible: true,
        activeVersion: {
          id: 'v-active',
          title: 'Guardian',
          status: BarMissionMedalVersionStatus.ACTIVE,
        },
      })),
    };
    unlockService = {
      unlock: jest.fn(async () => ({
        status: 'UNLOCKED',
        userBarMedalId: 'm1',
        medalVersionId: 'v-active',
        xpAwarded: 50,
      })),
    };
    service = new BarMissionMedalActivityService(prisma, medalProgress, unlockService);
  });

  it('TEST 1: visita barId null → no evalúa', async () => {
    await service.onVisitRegistered('u1', null);
    expect(medalProgress.isEligibleToUnlock).not.toHaveBeenCalled();
    expect(unlockService.unlock).not.toHaveBeenCalled();
  });

  it('TEST 2: bar sin season → no error', async () => {
    await expect(service.onVisitRegistered('u1', 'bar-none')).resolves.toBeUndefined();
    expect(unlockService.unlock).not.toHaveBeenCalled();
  });

  it('eligible → delega UnlockService (no crea medal aquí)', async () => {
    const res = await service.evaluateAndMaybeUnlock('u1', 's1', 'bar-1');
    expect(unlockService.unlock).toHaveBeenCalledWith('u1', 's1', 'v-active', 'bar-1');
    expect(res.status).toBe('UNLOCKED');
    expect(res.xpAwarded).toBe(50);
  });

  it('no eligible → NOT_ELIGIBLE sin unlock', async () => {
    medalProgress.isEligibleToUnlock.mockResolvedValueOnce({
      eligible: false,
      activeVersion: null,
    });
    const res = await service.evaluateAndMaybeUnlock('u1', 's1', 'bar-1');
    expect(res.status).toBe('NOT_ELIGIBLE');
    expect(unlockService.unlock).not.toHaveBeenCalled();
  });

  it('ya tiene medalla → ALREADY_UNLOCKED', async () => {
    prisma.userBarMedal.findUnique.mockResolvedValueOnce({
      id: 'm-old',
      medalVersionId: 'v1',
    });
    const res = await service.evaluateAndMaybeUnlock('u1', 's1', 'bar-1');
    expect(res.status).toBe('ALREADY_UNLOCKED');
    expect(unlockService.unlock).not.toHaveBeenCalled();
  });

  it('error unlock no se propaga en onVisitRegistered', async () => {
    unlockService.unlock.mockRejectedValueOnce(new Error('boom'));
    await expect(service.onVisitRegistered('u1', 'bar-1')).resolves.toBeUndefined();
  });

  it('season ambigua → no unlock', async () => {
    await service.onVisitRegistered('u1', 'bar-ambiguous');
    expect(unlockService.unlock).not.toHaveBeenCalled();
  });
});
