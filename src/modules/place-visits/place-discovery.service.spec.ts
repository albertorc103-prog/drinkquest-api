import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PLACE_DISCOVERY_CONFIG } from './place-discovery.config';
import { parsePlaceKey, PlaceDiscoveryService } from './place-discovery.service';

function makePrisma(state: {
  user?: any;
  bars?: any[];
  externals?: any[];
  visits?: any[];
  promos?: any[];
  reviewGroups?: any[];
  barByGoogle?: any;
  barById?: any;
  externalById?: any;
}) {
  return {
    user: {
      findFirst: jest.fn(async () => state.user ?? null),
    },
    bar: {
      findMany: jest.fn(async () => state.bars ?? []),
      findFirst: jest.fn(async (args: any) => {
        if (args?.where?.id) return state.barById ?? null;
        if (args?.where?.googlePlaceId) return state.barByGoogle ?? null;
        return null;
      }),
    },
    externalPlace: {
      findMany: jest.fn(async () => state.externals ?? []),
      findUnique: jest.fn(async (args: any) => {
        const id = args?.where?.googlePlaceId;
        if (!id) return null;
        if (state.externalById?.[id]) return state.externalById[id];
        return (state.externals ?? []).find((e: any) => e.googlePlaceId === id) ?? null;
      }),
    },
    placeVisit: {
      findMany: jest.fn(async () => state.visits ?? []),
    },
    barPromotion: {
      findMany: jest.fn(async () => state.promos ?? []),
    },
    placeReview: {
      groupBy: jest.fn(async () => state.reviewGroups ?? []),
    },
  };
}

describe('PlaceDiscoveryService', () => {
  const now = new Date('2026-10-05T18:00:00.000Z');
  const user = {
    id: 'user-1',
    role: Role.USER,
    ageVerifiedAt: now,
    createdAt: now,
  };

  it('TEST 17: usuario inexistente → Forbidden', async () => {
    const prisma = makePrisma({ user: null });
    const external = { hasUsableCoords: () => true };
    const service = new PlaceDiscoveryService(prisma as any, external as any);
    await expect(
      service.nearby('missing', { latitude: 20.67, longitude: -101.35 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('TEST 18: coords inválidas → BadRequest', async () => {
    const prisma = makePrisma({ user });
    const service = new PlaceDiscoveryService(prisma as any, {
      hasUsableCoords: () => true,
    } as any);
    await expect(
      service.nearby('user-1', { latitude: 99, longitude: -101.35 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST 19/20/25/26: candidatos en zona, tope MAX, tipos correctos', async () => {
    const prisma = makePrisma({
      user,
      bars: [
        {
          id: 'bar-1',
          businessName: 'La Terraza',
          latitude: 20.67,
          longitude: -101.35,
          googlePlaceId: 'ChIJ1',
          subscription: {
            status: 'ACTIVE',
            trialEndsAt: null,
            currentPeriodEnd: new Date('2027-01-01'),
            canceledAt: null,
            qrEnabled: true,
            promoEnabled: true,
          },
        },
      ],
      externals: [
        {
          id: 'ext-1',
          googlePlaceId: 'ChIJ2',
          name: 'Bar Externo',
          latitude: 20.671,
          longitude: -101.351,
          contentCachedAt: now,
        },
      ],
      reviewGroups: [
        {
          googlePlaceId: 'ChIJ1',
          barId: 'bar-1',
          _avg: { rating: 4.7 },
          _count: { _all: 38 },
        },
      ],
      promos: [{ barId: 'bar-1' }],
    });
    const external = {
      hasUsableCoords: (p: any) =>
        p.latitude != null && p.contentCachedAt != null,
    };
    const service = new PlaceDiscoveryService(prisma as any, external as any);
    const res = await service.nearby('user-1', {
      latitude: 20.67,
      longitude: -101.35,
      limit: 10,
    });
    expect(res.candidates.length).toBeGreaterThanOrEqual(1);
    expect(res.candidates.length).toBeLessThanOrEqual(
      PLACE_DISCOVERY_CONFIG.MAX_CANDIDATES,
    );
    const dq = res.candidates.find((c) => c.placeType === 'DRINKQUEST_BAR');
    expect(dq?.drinkQuestPartner).toBe(true);
    expect(dq?.drinkQuestRating).toBe(4.7);
    expect(dq?.drinkQuestReviewCount).toBe(38);
    expect(dq?.hasActivePromotion).toBe(true);
    expect(JSON.stringify(res)).not.toMatch(/userLatitude|googleRating/);
    const ext = res.candidates.find((c) => c.placeType === 'EXTERNAL');
    expect(ext?.drinkQuestPartner).toBe(false);
  });

  it('TEST 24: sin reviews → rating null', async () => {
    const prisma = makePrisma({
      user,
      bars: [
        {
          id: 'bar-2',
          businessName: 'Nuevo',
          latitude: 20.67,
          longitude: -101.35,
          googlePlaceId: null,
          subscription: null,
        },
      ],
      reviewGroups: [],
    });
    const service = new PlaceDiscoveryService(prisma as any, {
      hasUsableCoords: () => false,
    } as any);
    const res = await service.nearby('user-1', {
      latitude: 20.67,
      longitude: -101.35,
    });
    expect(res.candidates[0].drinkQuestRating).toBeNull();
    expect(res.candidates[0].drinkQuestReviewCount).toBe(0);
  });

  it('TEST 20: respeta limit', async () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({
      id: `bar-${i}`,
      businessName: `Bar ${i}`,
      latitude: 20.67 + i * 0.0001,
      longitude: -101.35,
      googlePlaceId: null,
      subscription: null,
    }));
    const prisma = makePrisma({ user, bars, reviewGroups: [] });
    const service = new PlaceDiscoveryService(prisma as any, {
      hasUsableCoords: () => false,
    } as any);
    const res = await service.nearby('user-1', {
      latitude: 20.67,
      longitude: -101.35,
      limit: 5,
    });
    expect(res.candidates).toHaveLength(5);
  });

  it('TEST 8/11/13/14: seed place_id → backend autoriza, rating DrinkQuest', async () => {
    const prisma = makePrisma({
      user,
      bars: [],
      externals: [],
      reviewGroups: [
        {
          googlePlaceId: 'ChIJSeed',
          barId: null,
          _avg: { rating: 4.2 },
          _count: { _all: 7 },
        },
      ],
    });
    const external = {
      hasUsableCoords: (p: any) => p.latitude != null && p.contentCachedAt != null,
      resolveForCheckIn: jest.fn(async (id: string) => ({
        googlePlaceId: id,
        name: 'Seeded Bar',
        latitude: 20.6705,
        longitude: -101.3505,
        contentCachedAt: now,
      })),
    };
    const service = new PlaceDiscoveryService(prisma as any, external as any);
    const res = await service.nearby('user-1', {
      latitude: 20.67,
      longitude: -101.35,
      seedPlaceIds: ['ChIJSeed'],
    });
    expect(external.resolveForCheckIn).toHaveBeenCalledWith('ChIJSeed');
    const c = res.candidates.find((x) => x.googlePlaceId === 'ChIJSeed');
    expect(c).toBeTruthy();
    expect(c?.drinkQuestPartner).toBe(false);
    expect(c?.drinkQuestRating).toBe(4.2);
    expect(c?.drinkQuestReviewCount).toBe(7);
    expect(c?.placeType).toBe('EXTERNAL');
  });

  it('TEST 9/10: seed no acepta privilegios del cliente (solo IDs)', async () => {
    const prisma = makePrisma({ user, bars: [], externals: [], reviewGroups: [] });
    const external = {
      hasUsableCoords: () => false,
      resolveForCheckIn: jest.fn(async () => {
        throw new Error('invalid');
      }),
    };
    const service = new PlaceDiscoveryService(prisma as any, external as any);
    const res = await service.nearby('user-1', {
      latitude: 20.67,
      longitude: -101.35,
      // Cliente no puede enviar partner/rating; solo IDs. IDs inválidos → omitidos.
      seedPlaceIds: ['bad-id'],
    });
    expect(res.candidates).toHaveLength(0);
  });

  it('TEST 12: place_id inválido no produce candidato', async () => {
    const prisma = makePrisma({ user, bars: [], externals: [] });
    const external = {
      hasUsableCoords: () => false,
      resolveForCheckIn: jest.fn(async () => {
        throw new Error('not found');
      }),
    };
    const service = new PlaceDiscoveryService(prisma as any, external as any);
    const res = await service.nearby('user-1', {
      latitude: 20.67,
      longitude: -101.35,
      seedPlaceIds: ['ChIJInvalid'],
    });
    expect(res.candidates).toHaveLength(0);
  });

  it('resolve: dq bar disponible', async () => {
    const prisma = makePrisma({
      user,
      barById: {
        id: 'bar-uuid',
        businessName: 'DQ Bar',
        latitude: 20.67,
        longitude: -101.35,
        googlePlaceId: null,
        subscription: null,
      },
      reviewGroups: [],
    });
    const service = new PlaceDiscoveryService(prisma as any, {
      hasUsableCoords: () => false,
    } as any);
    const res = await service.resolvePlace('user-1', 'dq:bar-uuid');
    expect(res.available).toBe(true);
    expect(res.placeType).toBe('DRINKQUEST_BAR');
    expect(res.drinkQuestRating).toBeNull();
  });

  it('resolve: place inexistente → available false', async () => {
    const prisma = makePrisma({ user });
    const service = new PlaceDiscoveryService(prisma as any, {
      hasUsableCoords: () => false,
      resolveForCheckIn: jest.fn(async () => {
        throw new Error('gone');
      }),
    } as any);
    const res = await service.resolvePlace('user-1', 'ChIJGone');
    expect(res.available).toBe(false);
    expect(res.message).toMatch(/no está disponible/i);
  });

  it('parsePlaceKey formatos', () => {
    expect(parsePlaceKey('google:ChIJ1')).toEqual({ kind: 'google', id: 'ChIJ1' });
    expect(parsePlaceKey('dq:abc')).toEqual({ kind: 'dq', id: 'abc' });
    expect(parsePlaceKey('bar:12')).toBeNull();
    expect(parsePlaceKey('unknown')).toBeNull();
  });
});
