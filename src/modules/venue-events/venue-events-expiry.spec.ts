import { SubscriptionPlan, SubscriptionStatus, VenueEventStatus } from '@prisma/client';
import { VenueEventsService } from './venue-events.service';

describe('VenueEventsService expiry', () => {
  it('listForOwner archiva ACTIVE con endsAt pasado', async () => {
    const now = new Date('2026-10-06T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'e1',
        barId: 'b1',
        title: 'Fiesta',
        description: null,
        imageUrl: null,
        startsAt: new Date('2026-10-01T20:00:00.000Z'),
        endsAt: new Date('2026-10-02T02:00:00.000Z'),
        status: VenueEventStatus.ARCHIVED,
        moderationStatus: 'VISIBLE',
        removalReason: null,
        removedAt: null,
        policiesAcceptedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const prisma: any = {
      barVenueEvent: { updateMany, findMany },
    };
    const barAccess: any = {
      resolveByOwnerUserId: jest.fn().mockResolvedValue({
        bar: { id: 'b1' },
        subscription: {
          plan: SubscriptionPlan.LEGEND,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
        },
      }),
      isSubscriptionActive: () => true,
    };

    const service = new VenueEventsService(prisma, barAccess);
    const result = await service.listForOwner('owner-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        barId: 'b1',
        deletedAt: null,
        status: VenueEventStatus.ACTIVE,
        endsAt: { lt: expect.any(Date) },
      },
      data: { status: VenueEventStatus.ARCHIVED },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].isExpired).toBe(true);
    expect(result.items[0].isLive).toBe(false);

    jest.useRealTimers();
  });
});
