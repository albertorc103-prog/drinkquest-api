import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ExternalPlaceService } from './external-place.service';
import { UpsertPlaceReviewDto } from './dto/place-review.dto';

@Injectable()
export class PlaceReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly externalPlaces: ExternalPlaceService,
  ) {}

  async listForPlace(
    userId: string,
    query: { barId?: string; googlePlaceId?: string },
  ) {
    const identity = await this.resolveIdentity(query);
    const where = this.whereForIdentity(identity);

    const [reviews, aggregate, mine] = await Promise.all([
      this.prisma.placeReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.placeReview.aggregate({
        where,
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.placeReview.findFirst({
        where: { userId, ...where },
      }),
    ]);

    return {
      summary: {
        averageRating:
          aggregate._count._all > 0
            ? Math.round((aggregate._avg.rating ?? 0) * 10) / 10
            : null,
        reviewCount: aggregate._count._all,
      },
      myReview: mine
        ? {
            id: mine.id,
            rating: mine.rating,
            comment: mine.comment,
            createdAt: mine.createdAt.toISOString(),
            updatedAt: mine.updatedAt.toISOString(),
          }
        : null,
      items: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        author: {
          id: r.user.id,
          displayName: r.user.displayName,
          avatarUrl: r.user.avatarUrl,
        },
      })),
    };
  }

  async upsert(userId: string, dto: UpsertPlaceReviewDto) {
    const identity = await this.resolveIdentity({
      barId: dto.barId,
      googlePlaceId: dto.googlePlaceId,
    });
    const comment = dto.comment?.trim() || null;

    const existing = await this.prisma.placeReview.findFirst({
      where: { userId, ...this.whereForIdentity(identity) },
    });

    const data: Prisma.PlaceReviewUncheckedCreateInput = {
      userId,
      barId: identity.barId,
      externalPlaceId: identity.externalPlaceId,
      googlePlaceId: identity.googlePlaceId,
      rating: dto.rating,
      comment,
    };

    const saved = existing
      ? await this.prisma.placeReview.update({
          where: { id: existing.id },
          data: {
            rating: dto.rating,
            comment,
            barId: identity.barId,
            externalPlaceId: identity.externalPlaceId,
            googlePlaceId: identity.googlePlaceId,
          },
        })
      : await this.prisma.placeReview.create({ data });

    return this.listForPlace(userId, {
      barId: identity.barId ?? undefined,
      googlePlaceId: identity.googlePlaceId ?? undefined,
    }).then((page) => ({
      ...page,
      savedReviewId: saved.id,
    }));
  }

  private whereForIdentity(identity: {
    barId: string | null;
    googlePlaceId: string | null;
  }): Prisma.PlaceReviewWhereInput {
    if (identity.googlePlaceId) {
      return { googlePlaceId: identity.googlePlaceId };
    }
    return { barId: identity.barId!, googlePlaceId: null };
  }

  private async resolveIdentity(query: {
    barId?: string;
    googlePlaceId?: string;
  }): Promise<{
    barId: string | null;
    externalPlaceId: string | null;
    googlePlaceId: string | null;
  }> {
    const googlePlaceId = query.googlePlaceId?.trim() || undefined;
    const barId = query.barId?.trim() || undefined;
    if (!googlePlaceId && !barId) {
      throw new BadRequestException('Se requiere barId o googlePlaceId.');
    }

    if (googlePlaceId) {
      let bar = barId
        ? await this.prisma.bar.findFirst({
            where: { id: barId, deletedAt: null },
            select: { id: true, googlePlaceId: true },
          })
        : await this.prisma.bar.findFirst({
            where: { googlePlaceId, deletedAt: null },
            select: { id: true, googlePlaceId: true },
          });
      if (barId && !bar) {
        throw new NotFoundException('Establecimiento no encontrado.');
      }
      // ensure ExternalPlace row exists (place_id only ok)
      const external = await this.externalPlaces.ensureStub(googlePlaceId);
      return {
        barId: bar?.id ?? null,
        externalPlaceId: external.id,
        googlePlaceId,
      };
    }

    const bar = await this.prisma.bar.findFirst({
      where: { id: barId!, deletedAt: null },
      select: { id: true, googlePlaceId: true },
    });
    if (!bar) throw new NotFoundException('Establecimiento no encontrado.');

    if (bar.googlePlaceId) {
      const external = await this.externalPlaces.ensureStub(bar.googlePlaceId);
      return {
        barId: bar.id,
        externalPlaceId: external.id,
        googlePlaceId: bar.googlePlaceId,
      };
    }

    return {
      barId: bar.id,
      externalPlaceId: null,
      googlePlaceId: null,
    };
  }
}
