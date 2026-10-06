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
      latitude: number | null;
      longitude: number | null;
      accuracy: number | null;
    }>,
    userXp: 100,
    userLevel: 1,
    userDeleted: false,
    userAgeVerifiedAt: new Date('2026-10-05T12:00:00.000Z') as Date | null,
    userCreatedAt: new Date('2026-10-05T12:00:00.000Z'),
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
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id !== 'user-1') return null;
        if (where.deletedAt === null && state.userDeleted) return null;
        return {
          id: 'user-1',
          role: 'USER',
          ageVerifiedAt: state.userAgeVerifiedAt,
          createdAt: state.userCreatedAt,
          totalXp: state.userXp,
          level: state.userLevel,
        };
      }),
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
    service = new PlaceVisitsService(
      prisma as any,
      externalPlaces as any,
      { onVisitRegistered: jest.fn().mockResolvedValue(undefined) } as any,
    );
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

  it('TEST 6: usuario eliminado → FORBIDDEN', async () => {
    prisma._state.userDeleted = true;
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
    expect(res.status).toBe('FORBIDDEN');
    expect(prisma._state.visits).toHaveLength(0);
  });

  it('TEST 8: fuera del radio → OUT_OF_RANGE', async () => {
    const res = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 21.0,
        longitude: -101.35,
        accuracy: 10,
      },
      now,
    );
    expect(res.status).toBe('OUT_OF_RANGE');
    expect(res.xpAwarded).toBe(0);
  });

  it('TEST 9/18: dentro del radio → PASS sin devolver lat/lng usuario y sin persistirlas', async () => {
    const res = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
        capturedAtMs: now.getTime() - 5_000,
      },
      now,
    );
    expect(res.status).toBe('FIRST_VISIT');
    expect(res).not.toHaveProperty('latitude');
    expect(res).not.toHaveProperty('longitude');
    expect(JSON.stringify(res)).not.toMatch(/userLatitude|userLongitude/);
    expect(prisma._state.visits[0].latitude).toBeNull();
    expect(prisma._state.visits[0].longitude).toBeNull();
    expect(prisma._state.visits[0].accuracy).toBeNull();
  });

  it('TEST 11: backend ignora distance del cliente (campo no existe en DTO)', async () => {
    const res = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 21.0,
        longitude: -101.35,
        accuracy: 10,
        distance: 0,
      } as any,
      now,
    );
    expect(res.status).toBe('OUT_OF_RANGE');
  });

  it('TEST 12: XP lo calcula el servidor (ignorar xp del body)', async () => {
    const res = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
        xp: 9999,
      } as any,
      now,
    );
    expect(res.xpAwarded).toBe(PLACE_VISIT_CONFIG.STANDARD_FIRST_VISIT_XP);
  });

  it('TEST 13: userId de body no se usa — identidad es el parámetro autenticado', async () => {
    const res = await service.checkIn(
      'other-user',
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
      },
      now,
    );
    expect(res.status).toBe('FORBIDDEN');
  });

  it('TEST 14: duplicado mismo día → sin XP doble', async () => {
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
    const res2 = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
      },
      now,
    );
    expect(res2.status).toBe('ALREADY_VISITED_TODAY');
    expect(res2.xpAwarded).toBe(0);
    expect(prisma._state.userXp).toBe(110);
  });

  it('TEST 15: requests simultáneas — segunda create P2002 no duplica XP', async () => {
    const { Prisma } = require('@prisma/client');
    let createCalls = 0;
    prisma.placeVisit.create = jest.fn(async ({ data }: any) => {
      createCalls += 1;
      if (createCalls === 1) {
        const row = { id: 'visit-1', ...data };
        prisma._state.visits.push(row);
        return row;
      }
      throw new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
    });

    const r1 = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
      },
      now,
    );
    // Simula carrera: prior vacío pero unique index en DB.
    prisma.placeVisit.findMany = jest.fn(async () => []);
    const r2 = await service.checkIn(
      userId,
      {
        googlePlaceId: googleId,
        latitude: 20.67,
        longitude: -101.35,
        accuracy: 12,
      },
      now,
    );
    expect(r1.status).toBe('FIRST_VISIT');
    expect(r2.status).toBe('ALREADY_VISITED_TODAY');
    expect(r2.xpAwarded).toBe(0);
  });

  it('TEST 16/17: legacy ageVerifiedAt null + createdAt antiguo → permitido', async () => {
    prisma._state.userAgeVerifiedAt = null;
    prisma._state.userCreatedAt = new Date('2025-01-01T00:00:00.000Z');
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
  });

  it('TEST 17b: post-FASE2 sin ageVerifiedAt → FORBIDDEN', async () => {
    prisma._state.userAgeVerifiedAt = null;
    prisma._state.userCreatedAt = new Date('2026-10-06T00:00:00.000Z');
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
    expect(res.status).toBe('FORBIDDEN');
  });
});
