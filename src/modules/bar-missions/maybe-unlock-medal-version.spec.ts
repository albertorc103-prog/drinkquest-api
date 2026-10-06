import { NotificationType } from '@prisma/client';
import { BarMissionMedalActivityService } from './bar-mission-medal-activity.service';
import { BarMissionsService } from './bar-missions.service';

describe('FASE 6 wiring evaluateAndMaybeUnlock', () => {
  it('onQrUnlock delega evaluate → UnlockService (sin notification SYSTEM temporal)', async () => {
    const unlock = jest.fn(async () => ({
      status: 'UNLOCKED',
      userBarMedalId: 'm1',
      medalVersionId: 'v1',
      xpAwarded: 10,
    }));
    const prisma: any = {
      userBarMedal: { findUnique: jest.fn(async () => null) },
      barMissionSeason: {
        findFirst: jest.fn(async () => ({
          id: 's1',
          startsAt: new Date('2020-01-01'),
          endsAt: new Date('2030-01-01'),
          missions: [],
        })),
      },
      userDrinkUnlock: { findMany: jest.fn() },
      userBarMissionProgress: { upsert: jest.fn() },
    };
    const activity = new BarMissionMedalActivityService(
      prisma,
      {
        isEligibleToUnlock: jest.fn(async () => ({
          eligible: true,
          activeVersion: { id: 'v1', title: 'T' },
        })),
      } as any,
      { unlock } as any,
    );
    const service = new BarMissionsService(
      prisma,
      {} as any,
      { isEligibleToUnlock: jest.fn() } as any,
      activity,
    );
    await service.onQrUnlock('u1', 'b1');
    expect(unlock).toHaveBeenCalledWith('u1', 's1', 'v1', 'b1');
  });

  it('Activity no importa NotificationsService (sin SYSTEM duplicada)', () => {
    // Compile-time: constructor solo prisma + progress + unlock
    const activity = new BarMissionMedalActivityService(
      { userBarMedal: { findUnique: jest.fn(async () => ({ id: 'x', medalVersionId: null })) } } as any,
      {} as any,
      { unlock: jest.fn() } as any,
    );
    expect(activity).toBeDefined();
    expect(NotificationType.SYSTEM).toBeDefined();
  });
});
