import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  BarReservationStatus,
  NotificationType,
  SubscriptionPlan,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import {
  normalizeSubscriptionPlan,
  reservationsEnabledForPlan,
} from '../subscriptions/subscription-plan.util';
import { BarMissionsService } from '../bar-missions/bar-missions.service';
import { CreateReservationDto } from './dto/reservation.dto';
import { mapReservation } from './mappers/reservation.mapper';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => BarMissionsService))
    private readonly barMissions: BarMissionsService,
  ) {}

  async listBookableBars() {
    const now = new Date();
    const bars = await this.prisma.bar.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        subscription: {
          plan: SubscriptionPlan.LEGEND,
          OR: [
            {
              status: 'TRIAL',
              OR: [{ trialEndsAt: null }, { trialEndsAt: { gte: now } }],
            },
            {
              status: 'ACTIVE',
              OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: now } }],
            },
          ],
        },
      },
      select: {
        id: true,
        businessName: true,
        slug: true,
        city: true,
        address: true,
        logoUrl: true,
        bannerUrl: true,
      },
      orderBy: { businessName: 'asc' },
    });
    return { items: bars, total: bars.length };
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.barReservation.findMany({
      where: { userId },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            address: true,
          },
        },
      },
      orderBy: [{ reservedFor: 'desc' }, { createdAt: 'desc' }],
    });
    return { items: rows.map(mapReservation) };
  }

  async create(userId: string, dto: CreateReservationDto) {
    await this.assertBarAcceptsReservations(dto.barId);
    this.assertPartySize(dto.partySize);
    const reservedFor = this.parseFutureDate(dto.reservedFor);
    const guestName = dto.guestName.trim();
    if (guestName.length < 2) {
      throw new BadRequestException('Indica un nombre de al menos 2 caracteres.');
    }

    const created = await this.prisma.barReservation.create({
      data: {
        barId: dto.barId,
        userId,
        guestName,
        partySize: dto.partySize,
        reservedFor,
        notes: dto.notes?.trim() || null,
        status: BarReservationStatus.PENDING,
      },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            address: true,
            ownerUserId: true,
          },
        },
      },
    });

    await this.notifications.notifyBarOwner(
      created.barId,
      NotificationType.RESERVATION_CREATED,
      'Nueva reserva de mesa',
      `${guestName} · ${dto.partySize} pers. · ${reservedFor.toISOString().slice(0, 10)}`,
      {
        reservationId: created.id,
        barId: created.barId,
        category: 'reservations',
      },
    );

    return mapReservation(created);
  }

  async cancelByUser(userId: string, reservationId: string) {
    const row = await this.requireUserReservation(userId, reservationId);
    if (
      row.status !== BarReservationStatus.PENDING &&
      row.status !== BarReservationStatus.CONFIRMED
    ) {
      throw new BadRequestException('Solo puedes cancelar reservas pendientes o confirmadas.');
    }
    const updated = await this.prisma.barReservation.update({
      where: { id: row.id },
      data: {
        status: BarReservationStatus.CANCELLED,
        resolvedAt: new Date(),
      },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            address: true,
          },
        },
      },
    });
    await this.notifications.notifyBarOwner(
      updated.barId,
      NotificationType.RESERVATION_CANCELLED,
      'Reserva cancelada por el usuario',
      `${updated.guestName} canceló su reserva del ${updated.reservedFor.toISOString().slice(0, 10)}.`,
      { reservationId: updated.id, barId: updated.barId },
    );
    return mapReservation(updated);
  }

  async listForBarOwner(ownerUserId: string, status?: string) {
    const { bar } = await this.assertOwnerLegend(ownerUserId);
    const whereStatus =
      status && Object.values(BarReservationStatus).includes(status as BarReservationStatus)
        ? (status as BarReservationStatus)
        : undefined;
    const rows = await this.prisma.barReservation.findMany({
      where: {
        barId: bar.id,
        ...(whereStatus ? { status: whereStatus } : {}),
      },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        bar: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            address: true,
          },
        },
      },
      orderBy: [{ reservedFor: 'asc' }, { createdAt: 'desc' }],
    });
    return { items: rows.map(mapReservation) };
  }

  async confirm(ownerUserId: string, reservationId: string, barResponse?: string) {
    const row = await this.requireOwnedReservation(ownerUserId, reservationId);
    if (row.status !== BarReservationStatus.PENDING) {
      throw new BadRequestException('Solo se pueden confirmar reservas pendientes.');
    }
    const updated = await this.prisma.barReservation.update({
      where: { id: row.id },
      data: {
        status: BarReservationStatus.CONFIRMED,
        barResponse: barResponse?.trim() || null,
        resolvedAt: new Date(),
      },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            address: true,
          },
        },
      },
    });
    await this.notifications.create(
      updated.userId,
      NotificationType.RESERVATION_CONFIRMED,
      'Reserva confirmada',
      `${updated.bar.businessName} confirmó tu mesa para ${updated.partySize} el ${updated.reservedFor.toISOString().slice(0, 10)}.`,
      { reservationId: updated.id, barId: updated.barId, category: 'reservations' },
    );
    await this.barMissions.onReservationConfirmed(
      updated.userId,
      updated.barId,
      updated.partySize,
    );
    return mapReservation(updated);
  }

  async decline(ownerUserId: string, reservationId: string, barResponse?: string) {
    const row = await this.requireOwnedReservation(ownerUserId, reservationId);
    if (row.status !== BarReservationStatus.PENDING) {
      throw new BadRequestException('Solo se pueden rechazar reservas pendientes.');
    }
    const reason = (barResponse ?? 'El local no puede aceptar esta reserva.').trim();
    const updated = await this.prisma.barReservation.update({
      where: { id: row.id },
      data: {
        status: BarReservationStatus.DECLINED,
        barResponse: reason,
        resolvedAt: new Date(),
      },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            address: true,
          },
        },
      },
    });
    await this.notifications.create(
      updated.userId,
      NotificationType.RESERVATION_DECLINED,
      'Reserva no disponible',
      `${updated.bar.businessName}: ${reason}`,
      { reservationId: updated.id, barId: updated.barId, category: 'reservations' },
    );
    return mapReservation(updated);
  }

  async complete(ownerUserId: string, reservationId: string) {
    const row = await this.requireOwnedReservation(ownerUserId, reservationId);
    if (row.status !== BarReservationStatus.CONFIRMED) {
      throw new BadRequestException('Solo se pueden completar reservas confirmadas.');
    }
    const updated = await this.prisma.barReservation.update({
      where: { id: row.id },
      data: {
        status: BarReservationStatus.COMPLETED,
        resolvedAt: new Date(),
      },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            address: true,
          },
        },
      },
    });
    return mapReservation(updated);
  }

  async cancelByBar(ownerUserId: string, reservationId: string, barResponse?: string) {
    const row = await this.requireOwnedReservation(ownerUserId, reservationId);
    if (
      row.status !== BarReservationStatus.PENDING &&
      row.status !== BarReservationStatus.CONFIRMED
    ) {
      throw new BadRequestException('Esta reserva ya no se puede cancelar.');
    }
    const updated = await this.prisma.barReservation.update({
      where: { id: row.id },
      data: {
        status: BarReservationStatus.CANCELLED,
        barResponse: barResponse?.trim() || null,
        resolvedAt: new Date(),
      },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            address: true,
          },
        },
      },
    });
    await this.notifications.create(
      updated.userId,
      NotificationType.RESERVATION_CANCELLED,
      'Reserva cancelada por el local',
      `${updated.bar.businessName} canceló tu reserva del ${updated.reservedFor.toISOString().slice(0, 10)}.`,
      { reservationId: updated.id, barId: updated.barId, category: 'reservations' },
    );
    return mapReservation(updated);
  }

  private assertPartySize(partySize: number) {
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
      throw new BadRequestException('El número de personas debe ser entre 1 y 20.');
    }
  }

  private parseFutureDate(iso: string): Date {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) {
      throw new BadRequestException('Fecha de reserva inválida.');
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (date < startOfToday) {
      throw new BadRequestException('La fecha de reserva no puede ser en el pasado.');
    }
    return date;
  }

  private async assertBarAcceptsReservations(barId: string) {
    const ctx = await this.barAccess.resolveByBarId(barId);
    if (!this.barAccess.isSubscriptionActive(ctx)) {
      throw new ForbiddenException('Este local no acepta reservas en este momento.');
    }
    const plan = normalizeSubscriptionPlan(ctx.subscription?.plan);
    if (!reservationsEnabledForPlan(plan)) {
      throw new ForbiddenException('Las reservas están exclusivas de bares con plan Legend.');
    }
  }

  private async assertOwnerLegend(ownerUserId: string) {
    const ctx = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    if (!this.barAccess.isSubscriptionActive(ctx)) {
      throw new ForbiddenException('Tu suscripción no está activa.');
    }
    const plan = normalizeSubscriptionPlan(ctx.subscription?.plan);
    if (!reservationsEnabledForPlan(plan)) {
      throw new ForbiddenException('Las reservas son exclusivas del plan Legend.');
    }
    return { bar: ctx.bar, plan };
  }

  private async requireUserReservation(userId: string, reservationId: string) {
    const row = await this.prisma.barReservation.findFirst({
      where: { id: reservationId, userId },
    });
    if (!row) throw new NotFoundException('Reserva no encontrada.');
    return row;
  }

  private async requireOwnedReservation(ownerUserId: string, reservationId: string) {
    const { bar } = await this.assertOwnerLegend(ownerUserId);
    const row = await this.prisma.barReservation.findFirst({
      where: { id: reservationId, barId: bar.id },
    });
    if (!row) throw new NotFoundException('Reserva no encontrada.');
    return row;
  }
}
