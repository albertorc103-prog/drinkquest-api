import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  VenueEventModerationStatus,
  VenueEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import {
  normalizeSubscriptionPlan,
  VENUE_EVENT_POLICY_LINES,
  venueEventsEnabledForPlan,
} from '../subscriptions/subscription-plan.util';
import {
  ActivateVenueEventDto,
  CreateVenueEventDto,
  UpdateVenueEventDto,
} from './dto/venue-event.dto';
import { mapVenueEvent } from './mappers/venue-event.mapper';

@Injectable()
export class VenueEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
  ) {}

  async listForOwner(ownerUserId: string) {
    const { bar } = await this.assertOwnerCanManage(ownerUserId);
    const rows = await this.prisma.barVenueEvent.findMany({
      where: { barId: bar.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map(mapVenueEvent),
      policyLines: [...VENUE_EVENT_POLICY_LINES],
    };
  }

  async create(ownerUserId: string, dto: CreateVenueEventDto) {
    const { bar } = await this.assertOwnerCanManage(ownerUserId);
    this.assertDateRange(dto.startsAt, dto.endsAt);

    const created = await this.prisma.barVenueEvent.create({
      data: {
        barId: bar.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        status: VenueEventStatus.DRAFT,
        moderationStatus: VenueEventModerationStatus.VISIBLE,
      },
    });
    return mapVenueEvent(created);
  }

  async update(ownerUserId: string, eventId: string, dto: UpdateVenueEventDto) {
    await this.assertOwnerCanManage(ownerUserId);
    const event = await this.requireOwnedEvent(ownerUserId, eventId);
    if (event.status === VenueEventStatus.ARCHIVED) {
      throw new BadRequestException('No se puede editar un evento archivado.');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : event.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : event.endsAt;
    this.assertDateRange(startsAt.toISOString(), endsAt.toISOString());

    const wasRemoved = event.moderationStatus === VenueEventModerationStatus.REMOVED;

    const updated = await this.prisma.barVenueEvent.update({
      where: { id: event.id },
      data: {
        title: dto.title?.trim(),
        description:
          dto.description !== undefined ? dto.description.trim() || null : undefined,
        imageUrl:
          dto.imageUrl !== undefined
            ? dto.imageUrl === null
              ? null
              : dto.imageUrl.trim() || null
            : undefined,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        ...(wasRemoved
          ? {
              status: VenueEventStatus.DRAFT,
              policiesAcceptedAt: null,
            }
          : {}),
      },
    });
    return mapVenueEvent(updated);
  }

  async activate(ownerUserId: string, eventId: string, dto: ActivateVenueEventDto) {
    await this.assertOwnerCanManage(ownerUserId);
    const event = await this.requireOwnedEvent(ownerUserId, eventId);

    if (!dto.policiesAccepted) {
      throw new BadRequestException(
        'Debes aceptar las políticas de publicidad antes de publicar el evento.',
      );
    }
    if (event.status === VenueEventStatus.ARCHIVED) {
      throw new BadRequestException('No se puede activar un evento archivado.');
    }
    this.assertDateRange(event.startsAt.toISOString(), event.endsAt.toISOString());

    const updated = await this.prisma.barVenueEvent.update({
      where: { id: event.id },
      data: {
        status: VenueEventStatus.ACTIVE,
        moderationStatus: VenueEventModerationStatus.VISIBLE,
        removalReason: null,
        removedByAdminId: null,
        removedAt: null,
        policiesAcceptedAt: new Date(),
      },
    });
    return mapVenueEvent(updated);
  }

  async pause(ownerUserId: string, eventId: string) {
    await this.assertOwnerCanManage(ownerUserId);
    const event = await this.requireOwnedEvent(ownerUserId, eventId);
    if (event.status !== VenueEventStatus.ACTIVE) {
      throw new BadRequestException('Solo se pueden pausar eventos activos.');
    }
    const updated = await this.prisma.barVenueEvent.update({
      where: { id: event.id },
      data: { status: VenueEventStatus.DRAFT },
    });
    return mapVenueEvent(updated);
  }

  async softDelete(ownerUserId: string, eventId: string) {
    await this.assertOwnerCanManage(ownerUserId);
    const event = await this.requireOwnedEvent(ownerUserId, eventId);
    await this.prisma.barVenueEvent.update({
      where: { id: event.id },
      data: {
        deletedAt: new Date(),
        status: VenueEventStatus.ARCHIVED,
      },
    });
    return { deleted: true };
  }

  private assertDateRange(startsAt: string, endsAt: string) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new BadRequestException('Fechas inválidas.');
    }
    if (end <= start) {
      throw new BadRequestException('La fecha de fin debe ser posterior al inicio.');
    }
  }

  private async assertOwnerCanManage(ownerUserId: string) {
    const ctx = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    if (!this.barAccess.isSubscriptionActive(ctx)) {
      throw new ForbiddenException(
        'Tu suscripción no está activa. Renueva el plan para gestionar eventos del lugar.',
      );
    }
    const plan = normalizeSubscriptionPlan(ctx.subscription?.plan);
    if (!venueEventsEnabledForPlan(plan)) {
      throw new ForbiddenException('Los eventos del lugar son exclusivos del plan Legend.');
    }
    return { bar: ctx.bar, plan };
  }

  private async requireOwnedEvent(ownerUserId: string, eventId: string) {
    const { bar } = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    const event = await this.prisma.barVenueEvent.findFirst({
      where: { id: eventId, barId: bar.id, deletedAt: null },
    });
    if (!event) throw new NotFoundException('Evento del lugar no encontrado.');
    return event;
  }
}
