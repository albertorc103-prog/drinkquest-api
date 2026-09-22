import { BadRequestException } from '@nestjs/common';
import { PlaceReviewsService } from './place-reviews.service';

function makePrismaMock() {
  const reviews: any[] = [];
  const bars = new Map<string, any>();
  const externals = new Map<string, any>();
  const users = new Map<string, any>([
    [
      'user-1',
      {
        id: 'user-1',
        displayName: 'Valeria M.',
        avatarUrl: null,
      },
    ],
    [
      'user-2',
      {
        id: 'user-2',
        displayName: 'Carlos R.',
        avatarUrl: null,
      },
    ],
  ]);

  const prisma: any = {
    bar: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id) return bars.get(where.id) ?? null;
        if (where.googlePlaceId) {
          for (const b of bars.values()) {
            if (b.googlePlaceId === where.googlePlaceId) return b;
          }
        }
        return null;
      }),
    },
    placeReview: {
      findMany: jest.fn(async ({ where }: any) => {
        return reviews
          .filter((r) => matchWhere(r, where))
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .slice(0, 50)
          .map((r) => ({
            ...r,
            user: users.get(r.userId),
          }));
      }),
      aggregate: jest.fn(async ({ where }: any) => {
        const matched = reviews.filter((r) => matchWhere(r, where));
        const avg =
          matched.length === 0
            ? null
            : matched.reduce((s, r) => s + r.rating, 0) / matched.length;
        return {
          _avg: { rating: avg },
          _count: { _all: matched.length },
        };
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        return reviews.find((r) => matchWhere(r, where)) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `rev-${reviews.length + 1}`,
          createdAt: new Date('2026-09-21T12:00:00.000Z'),
          updatedAt: new Date('2026-09-21T12:00:00.000Z'),
          ...data,
        };
        reviews.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const idx = reviews.findIndex((r) => r.id === where.id);
        reviews[idx] = {
          ...reviews[idx],
          ...data,
          updatedAt: new Date('2026-09-21T13:00:00.000Z'),
        };
        return reviews[idx];
      }),
    },
    _reviews: reviews,
    _bars: bars,
    _externals: externals,
  };

  return prisma;
}

function matchWhere(row: any, where: any): boolean {
  if (where.userId && row.userId !== where.userId) return false;
  if (where.googlePlaceId && row.googlePlaceId !== where.googlePlaceId) {
    return false;
  }
  if (where.barId && where.googlePlaceId === null) {
    return row.barId === where.barId && row.googlePlaceId == null;
  }
  if (where.barId && !where.googlePlaceId) {
    return row.barId === where.barId;
  }
  return true;
}

describe('PlaceReviewsService', () => {
  it('exige barId o googlePlaceId', async () => {
    const prisma = makePrismaMock();
    const externalPlaces = { ensureStub: jest.fn() };
    const service = new PlaceReviewsService(prisma as any, externalPlaces as any);

    await expect(service.listForPlace('user-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('publica y recalcula promedio acumulado', async () => {
    const prisma = makePrismaMock();
    prisma._bars.set('bar-1', {
      id: 'bar-1',
      googlePlaceId: 'ChIJ_sheldonz',
      deletedAt: null,
    });
    const externalPlaces = {
      ensureStub: jest.fn(async (googlePlaceId: string) => {
        const row = { id: 'ext-1', googlePlaceId };
        prisma._externals.set(googlePlaceId, row);
        return row;
      }),
    };
    const service = new PlaceReviewsService(prisma as any, externalPlaces as any);

    const page1 = await service.upsert('user-1', {
      googlePlaceId: 'ChIJ_sheldonz',
      rating: 5,
      comment: 'Excelente coctelería',
    });
    expect(page1.summary.averageRating).toBe(5);
    expect(page1.summary.reviewCount).toBe(1);
    expect(page1.myReview?.rating).toBe(5);
    expect(page1.items).toHaveLength(1);

    // segunda opinión de otro usuario
    prisma._reviews.push({
      id: 'rev-other',
      userId: 'user-2',
      barId: 'bar-1',
      externalPlaceId: 'ext-1',
      googlePlaceId: 'ChIJ_sheldonz',
      rating: 3,
      comment: null,
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
      updatedAt: new Date('2026-09-20T12:00:00.000Z'),
    });

    const page2 = await service.listForPlace('user-1', {
      googlePlaceId: 'ChIJ_sheldonz',
    });
    expect(page2.summary.reviewCount).toBe(2);
    expect(page2.summary.averageRating).toBe(4);
  });

  it('actualiza la opinión existente del mismo usuario', async () => {
    const prisma = makePrismaMock();
    const externalPlaces = {
      ensureStub: jest.fn(async (googlePlaceId: string) => ({
        id: 'ext-2',
        googlePlaceId,
      })),
    };
    const service = new PlaceReviewsService(prisma as any, externalPlaces as any);

    await service.upsert('user-1', {
      googlePlaceId: 'ChIJ_only_google',
      rating: 4,
      comment: 'Bien',
    });
    const updated = await service.upsert('user-1', {
      googlePlaceId: 'ChIJ_only_google',
      rating: 2,
      comment: 'Regular',
    });

    expect(prisma._reviews).toHaveLength(1);
    expect(updated.myReview?.rating).toBe(2);
    expect(updated.summary.averageRating).toBe(2);
    expect(updated.items[0].comment).toBe('Regular');
  });
});
