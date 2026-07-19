import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  VenueEventModerationStatus,
  VenueEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { mapVenueEvent } from './mappers/venue-event.mapper';

@Injectable()
export class AdminVenueEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(limit = 100, includeRemoved = false) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const rows = await this.prisma.barVenueEvent.findMany({
      where: {
        deletedAt: null,
        status: { in: [VenueEventStatus.ACTIVE, VenueEventStatus.DRAFT] },
        ...(includeRemoved
          ? {}
          : { moderationStatus: VenueEventModerationStatus.VISIBLE }),
      },
      take: safeLimit,
      orderBy: [{ updatedAt: 'desc' }],
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
    });
    return { items: rows.map(mapVenueEvent) };
  }

  async remove(eventId: string, adminUserId: string, reason?: string) {
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 3) {
      throw new BadRequestException('Indica un motivo de al menos 3 caracteres.');
    }
    const event = await this.prisma.barVenueEvent.findFirst({
      where: { id: eventId, deletedAt: null },
    });
    if (!event) throw new NotFoundException('Evento no encontrado.');

    const updated = await this.prisma.barVenueEvent.update({
      where: { id: event.id },
      data: {
        moderationStatus: VenueEventModerationStatus.REMOVED,
        removalReason: trimmed,
        removedByAdminId: adminUserId,
        removedAt: new Date(),
        status: VenueEventStatus.DRAFT,
      },
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
    });
    return mapVenueEvent(updated);
  }
}
