import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { LegendMedalEligibilityNotifyService } from './legend-medal-eligibility-notify.service';

describe('LegendMedalEligibilityNotifyService', () => {
  const legendActive = {
    plan: SubscriptionPlan.LEGEND,
    status: SubscriptionStatus.ACTIVE,
    trialEndsAt: null,
    currentPeriodEnd: new Date('2030-01-01'),
    canceledAt: null,
    qrEnabled: true,
    promoEnabled: true,
  };

  it('notifica suspensión al perder elegibilidad Legend', async () => {
    const notifications = { notifyBarOwner: jest.fn(async () => null) };
    const prisma = {
      barMissionMedalVersion: {
        findFirst: jest.fn(async () => ({ id: 'medal-v1' })),
      },
    };
    const svc = new LegendMedalEligibilityNotifyService(prisma as any, notifications as any);
    await svc.afterSubscriptionPersisted('bar-1', legendActive as any, {
      ...legendActive,
      plan: SubscriptionPlan.EXPLORER,
    } as any);
    expect(notifications.notifyBarOwner).toHaveBeenCalled();
  });

  it('no notifica si no hay medalla ACTIVE', async () => {
    const notifications = { notifyBarOwner: jest.fn(async () => null) };
    const prisma = {
      barMissionMedalVersion: {
        findFirst: jest.fn(async () => null),
      },
    };
    const svc = new LegendMedalEligibilityNotifyService(prisma as any, notifications as any);
    await svc.afterSubscriptionPersisted('bar-1', legendActive as any, {
      ...legendActive,
      plan: SubscriptionPlan.EXPLORER,
    } as any);
    expect(notifications.notifyBarOwner).not.toHaveBeenCalled();
  });
});
