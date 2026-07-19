import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  VenueEventModerationStatus,
  VenueEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { mapVenueEvent } from './mappers/venue-event.mapper';

@Injectable()
export class VenueEventsFeedService {
  private readonly logger = new Logger(VenueEventsFeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForUsers(page = 1, limit = 20, barId?: string) {
    const now = new Date();
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const where = {
      deletedAt: null,
      status: VenueEventStatus.ACTIVE,
      moderationStatus: VenueEventModerationStatus.VISIBLE,
      endsAt: { gte: now },
      ...(barId ? { barId } : {}),
      bar: {
        deletedAt: null,
        isActive: true,
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.barVenueEvent.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: [{ startsAt: 'asc' }],
        include: {
          bar: {
            select: {
              id: true,
              businessName: true,
              slug: true,
              logoUrl: true,
              city: true,
            },
          },
        },
      }),
      this.prisma.barVenueEvent.count({ where }),
    ]);

    this.logger.debug(
      JSON.stringify({
        event: 'venue_events_feed_list',
        page: safePage,
        limit: safeLimit,
        barId: barId ?? null,
        total,
        returned: rows.length,
      }),
    );

    return {
      items: rows.map(mapVenueEvent),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  async listForBar(barId: string, limit = 10) {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!bar) throw new NotFoundException('Bar no encontrado.');
    const result = await this.listForUsers(1, limit, barId);
    return { items: result.items };
  }
}
