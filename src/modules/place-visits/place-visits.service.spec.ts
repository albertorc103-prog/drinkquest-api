import { PlaceVisitRewardTier, SubscriptionStatus } from '@prisma/client';
import { PLACE_VISIT_CONFIG } from './place-visit.config';
import { PlaceVisitsService } from './place-visits.service';

function makePrismaMock() {
  const state = {
    visits: [] as Array<{
      id: string;
      userId: string;
      barId: string | null;
      externalPlaceId: string | null;
      googlePlaceId: string | null;
      visitDate: Date;
      visitedAt: Date;
      xpAwarded: number;
      firstVisit: boolean;
      rewardTier: PlaceVisitRewardTier;
    }>,
    userXp: 100,
    userLevel: 1,
    bars: new Map<string, any>(),
    externalByGoogle: new Map<string, any>(),
  };

  const prisma: any = {
    bar: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id) return state.bars.get(where.id) ?? null;
        if (where.googlePlaceId) {
          for (const b of state.bars.values()) {
            if (b.googlePlaceId === where.googlePlaceId) return b;
          }
        }
        return null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        const ids: string[] = where.googlePlaceId?.in ?? [];
        return [...state.bars.values()].filter((b) =>
          ids.includes(b.googlePlaceId),
        );
      }),
    },
    placeVisit: {
      findMany: jest.fn(async ({ where }: any) => {
        return state.visits
          .filter((v) => {
            if (v.userId !== where.userId) return false;
            if (where.googlePlaceId) {
              return v.googlePlaceId === where.googlePlaceId;
            }
            if (where.barId && where.googlePlaceId === null) {
              return v.barId === where.barId && v.googlePlaceId == null;
            }
            return true;
          })
          .sort((a, b) => b.visitedAt.getTime() - a.visitedAt.getTime());
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `visit-${state.visits.length + 1}`, ...data };
        state.visits.push(row);
        return row;
      }),
    },
    user: {
      findUniqueOrThrow: jest.fn(async () => ({
        totalXp: state.userXp,
        level: state.userLevel,
      })),
      update: jest.fn(async ({ data }: any) => {
        state.userXp = data.totalXp;
        state.userLevel = data.level;
        return { totalXp: state.userXp, level: state.userLevel };
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    _state: state,
  };

  return prisma;
}

describe('PlaceVisitsService check-in', () => {
  const userId = 'user-1';
  const googleId = 'ABC123';
  const externalId = 'ext-xyz';
  const barId = 'bar-uuid';
  const now = new Date('2026-09-20T18:00:00.000Z');

  let prisma: ReturnType<typeof makePrismaMock>;
  let externalPlaces: { resolveForCheckIn: jest.Mock };
  let service: PlaceVisitsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    externalPlaces = {
      resolveForCheckIn: jest.fn(async () => ({
        id: externalId,
        googlePlaceId: googleId,
        name: 'Bar Central',
        latitude: 20.67,
        longitude: -101.35,
        primaryType: 'bar',
        city: 'León',
        contentCachedAt: now,
        placeIdRefreshedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    };
    service = new PlaceVisitsService(prisma as any, externalPlaces as any);
  });

  it('primera visita Google STANDARD +10 XP y guarda externalPlaceId + googlePlaceId', async () => {
    const res = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
      },
      now,
    );
    expect(res.status).toBe('FIRST_VISIT');
    expect(res.xpAwarded).toBe(PLACE_VISIT_CONFIG.STANDARD_FIRST_VISIT_XP);
    expect(res.rewardTier).toBe(PlaceVisitRewardTier.STANDARD);
    expect(res.externalPlaceId).toBe(externalId);
    expect(res.googlePlaceId).toBe(googleId);
    expect(res.barId).toBeNull();
    expect(prisma._state.visits).toHaveLength(1);
    expect(prisma._state.userXp).toBe(110);
  });

  it('mismo día External STANDARD → Bar SUBSCRIBED NO permite segunda visita', async () => {
    // Visita 1: solo Google
    await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
      },
      now,
    );
    expect(prisma._state.userXp).toBe(110);

    // El negocio se afilia
    prisma._state.bars.set(barId, {
      id: barId,
      businessName: 'Bar Central',
      latitude: 20.67,
      longitude: -101.35,
      googlePlaceId: googleId,
      checkInRadiusMeters: null,
      deletedAt: null,
      isActive: true,
      logoUrl: null,
      city: 'León',
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        currentPeriodEnd: new Date('2027-01-01'),
        canceledAt: null,
        qrEnabled: true,
        promoEnabled: true,
      },
    });

    const res2 = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
      },
      new Date(now.getTime() + 60 * 60 * 1000),
    );

    expect(res2.status).toBe('ALREADY_VISITED_TODAY');
    expect(res2.xpAwarded).toBe(0);
    expect(prisma._state.visits).toHaveLength(1);
    expect(prisma._state.userXp).toBe(110);
  });

  it('otro día con Bar SUBSCRIBED es RETURN +5 (no reinicia firstVisit)', async () => {
    await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
      },
      now,
    );

    prisma._state.bars.set(barId, {
      id: barId,
      businessName: 'Bar Central',
      latitude: 20.67,
      longitude: -101.35,
      googlePlaceId: googleId,
      checkInRadiusMeters: null,
      deletedAt: null,
      isActive: true,
      logoUrl: null,
      city: 'León',
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        currentPeriodEnd: new Date('2027-01-01'),
        canceledAt: null,
        qrEnabled: true,
        promoEnabled: true,
      },
    });

    const nextDay = new Date('2026-09-21T18:00:00.000Z');
    const res2 = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
      },
      nextDay,
    );

    expect(res2.status).toBe('RETURN_VISIT');
    expect(res2.firstVisit).toBe(false);
    expect(res2.xpAwarded).toBe(PLACE_VISIT_CONFIG.SUBSCRIBED_RETURN_VISIT_XP);
    expect(res2.rewardTier).toBe(PlaceVisitRewardTier.SUBSCRIBED);
    expect(res2.barId).toBe(barId);
    expect(res2.externalPlaceId).toBe(externalId);
    expect(res2.googlePlaceId).toBe(googleId);
    expect(prisma._state.userXp).toBe(115);
  });

  it('rechaza accuracy > 50', async () => {
    const res = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 80,
      },
      now,
    );
    expect(res.status).toBe('INACCURATE');
    expect(res.xpAwarded).toBe(0);
  });

  it('Bar sin googlePlaceId no crea ExternalPlace', async () => {
    prisma._state.bars.set(barId, {
      id: barId,
      businessName: 'Solo DrinkQuest',
      latitude: 20.67,
      longitude: -101.35,
      googlePlaceId: null,
      checkInRadiusMeters: null,
      deletedAt: null,
      isActive: true,
      logoUrl: null,
      city: 'León',
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        currentPeriodEnd: new Date('2027-01-01'),
        canceledAt: null,
        qrEnabled: true,
        promoEnabled: true,
      },
    });

    const res = await service.checkIn(
      userId,
      {
        barId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 10,
      },
      now,
    );

    expect(res.status).toBe('FIRST_VISIT');
    expect(res.externalPlaceId).toBeNull();
    expect(res.googlePlaceId).toBeNull();
    expect(res.barId).toBe(barId);
    expect(res.xpAwarded).toBe(PLACE_VISIT_CONFIG.SUBSCRIBED_FIRST_VISIT_XP);
    expect(externalPlaces.resolveForCheckIn).not.toHaveBeenCalled();
  });
});
