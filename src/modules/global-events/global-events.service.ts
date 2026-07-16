import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GlobalEventGoalType,
  GlobalEventStatus,
  NotificationType,
  SubscriptionPlan,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { evaluateSubscriptionActive } from '../subscriptions/bar-access.rules';
import {
  globalEventsEnabledForPlan,
  normalizeSubscriptionPlan,
} from '../subscriptions/subscription-plan.util';
import {
  CreateGlobalEventDto,
  SetGlobalEventBarsDto,
  UpdateGlobalEventDto,
} from './dto/global-event.dto';
import { mapGlobalEvent } from './mappers/global-event.mapper';

const barInclude = {
  bars: {
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
  },
} as const;

@Injectable()
export class GlobalEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listEligibleLegendBars() {
    const now = new Date();
    const bars = await this.prisma.bar.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        businessName: true,
        slug: true,
        city: true,
        logoUrl: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            canceledAt: true,
            qrEnabled: true,
            promoEnabled: true,
          },
        },
      },
      orderBy: { businessName: 'asc' },
    });
    const items = bars
      .filter((b) => {
        if (!evaluateSubscriptionActive(b.subscription, now).allowed) return false;
        return globalEventsEnabledForPlan(normalizeSubscriptionPlan(b.subscription?.plan));
      })
      .map((b) => ({
        id: b.id,
        businessName: b.businessName,
        slug: b.slug,
        city: b.city,
        logoUrl: b.logoUrl,
        plan: SubscriptionPlan.LEGEND,
      }));
    return { items, total: items.length };
  }

  async listForAdmin() {
    const rows = await this.prisma.globalEvent.findMany({
      where: { deletedAt: null },
      include: barInclude,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((r) => mapGlobalEvent(r)) };
  }

  async create(adminUserId: string, dto: CreateGlobalEventDto) {
    this.assertDateRange(dto.startsAt, dto.endsAt);
    await this.assertLegendBarPool(dto.barIds, dto.targetCount);

    const created = await this.prisma.$transaction(async (tx) => {
      const event = await tx.globalEvent.create({
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),
          imageUrl: dto.imageUrl?.trim() || null,
          goalType: GlobalEventGoalType.VISIT_BARS,
          targetCount: dto.targetCount,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt),
          status: dto.activate ? GlobalEventStatus.ACTIVE : GlobalEventStatus.DRAFT,
          medalTitle: dto.medalTitle.trim(),
          medalDescription: dto.medalDescription.trim(),
          createdByAdminId: adminUserId,
          bars: {
            create: dto.barIds.map((barId) => ({ barId })),
          },
        },
        include: barInclude,
      });
      return event;
    });

    return mapGlobalEvent(created);
  }

  async update(eventId: string, dto: UpdateGlobalEventDto) {
    const event = await this.requireEvent(eventId);
    if (event.status === GlobalEventStatus.ENDED) {
      throw new BadRequestException('No se puede editar un evento finalizado.');
    }
    const startsAt = dto.startsAt ?? event.startsAt.toISOString();
    const endsAt = dto.endsAt ?? event.endsAt.toISOString();
    this.assertDateRange(startsAt, endsAt);

    if (dto.barIds) {
      const target = dto.targetCount ?? event.targetCount;
      await this.assertLegendBarPool(dto.barIds, target);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.barIds) {
        await tx.globalEventBar.deleteMany({ where: { eventId } });
        await tx.globalEventBar.createMany({
          data: dto.barIds.map((barId) => ({ eventId, barId })),
        });
      }
      return tx.globalEvent.update({
        where: { id: eventId },
        data: {
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          imageUrl:
            dto.imageUrl !== undefined ? dto.imageUrl.trim() || null : undefined,
          targetCount: dto.targetCount,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          medalTitle: dto.medalTitle?.trim(),
          medalDescription: dto.medalDescription?.trim(),
        },
        include: barInclude,
      });
    });
    return mapGlobalEvent(updated);
  }

  async setBars(eventId: string, dto: SetGlobalEventBarsDto) {
    const event = await this.requireEvent(eventId);
    await this.assertLegendBarPool(dto.barIds, event.targetCount);
    await this.prisma.$transaction(async (tx) => {
      await tx.globalEventBar.deleteMany({ where: { eventId } });
      await tx.globalEventBar.createMany({
        data: dto.barIds.map((barId) => ({ eventId, barId })),
      });
    });
    const updated = await this.prisma.globalEvent.findUniqueOrThrow({
      where: { id: eventId },
      include: barInclude,
    });
    return mapGlobalEvent(updated);
  }

  async activate(eventId: string) {
    const event = await this.requireEvent(eventId);
    const barCount = await this.prisma.globalEventBar.count({ where: { eventId } });
    if (barCount < event.targetCount) {
      throw new BadRequestException(
        `Necesitas al menos ${event.targetCount} bares Legend en el pool.`,
      );
    }
    const updated = await this.prisma.globalEvent.update({
      where: { id: eventId },
      data: { status: GlobalEventStatus.ACTIVE },
      include: barInclude,
    });
    return mapGlobalEvent(updated);
  }

  async end(eventId: string) {
    await this.requireEvent(eventId);
    const updated = await this.prisma.globalEvent.update({
      where: { id: eventId },
      data: { status: GlobalEventStatus.ENDED },
      include: barInclude,
    });
    return mapGlobalEvent(updated);
  }

  async softDelete(eventId: string) {
    await this.requireEvent(eventId);
    await this.prisma.globalEvent.update({
      where: { id: eventId },
      data: { deletedAt: new Date(), status: GlobalEventStatus.ENDED },
    });
    return { deleted: true };
  }

  async listActiveForUser(userId: string) {
    const now = new Date();
    const rows = await this.prisma.globalEvent.findMany({
      where: {
        deletedAt: null,
        status: GlobalEventStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: {
        ...barInclude,
        progress: { where: { userId }, take: 1 },
        medals: { where: { userId }, take: 1 },
      },
      orderBy: { endsAt: 'asc' },
    });
    return {
      items: rows.map((r) =>
        mapGlobalEvent(r, {
          userProgress: r.progress[0]?.progress ?? 0,
          completedAt: r.progress[0]?.completedAt ?? null,
          hasMedal: r.medals.length > 0,
        }),
      ),
    };
  }

  async listMedalsForUser(userId: string) {
    const medals = await this.prisma.userGlobalEventMedal.findMany({
      where: { userId },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            medalTitle: true,
            medalDescription: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { unlockedAt: 'desc' },
    });
    return {
      items: medals.map((m) => ({
        id: m.id,
        eventId: m.eventId,
        eventTitle: m.event.title,
        medalTitle: m.event.medalTitle,
        medalDescription: m.event.medalDescription,
        imageUrl: m.event.imageUrl,
        unlockedAt: m.unlockedAt.toISOString(),
      })),
    };
  }

  async listForBarOwner(ownerUserId: string) {
    const bar = await this.prisma.bar.findFirst({
      where: { ownerUserId, deletedAt: null },
      include: { subscription: true },
    });
    if (!bar) throw new NotFoundException('Bar no encontrado');
    const plan = normalizeSubscriptionPlan(bar.subscription?.plan);
    if (!globalEventsEnabledForPlan(plan)) {
      throw new ForbiddenException(
        'Los eventos globales son exclusivos del plan Legend.',
      );
    }
    const now = new Date();
    const rows = await this.prisma.globalEvent.findMany({
      where: {
        deletedAt: null,
        status: { in: [GlobalEventStatus.ACTIVE, GlobalEventStatus.DRAFT] },
        bars: { some: { barId: bar.id } },
      },
      include: barInclude,
      orderBy: { startsAt: 'desc' },
    });
    return {
      eligible: true,
      items: rows.map((r) => ({
        ...mapGlobalEvent(r),
        isLive:
          r.status === GlobalEventStatus.ACTIVE &&
          r.startsAt <= now &&
          r.endsAt >= now,
      })),
    };
  }

  /** Tras QR unlock: progreso en eventos globales activos que incluyen este bar Legend. */
  async onQrUnlock(userId: string, barId: string) {
    const now = new Date();
    const memberships = await this.prisma.globalEventBar.findMany({
      where: {
        barId,
        event: {
          deletedAt: null,
          status: GlobalEventStatus.ACTIVE,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
      },
      include: { event: true },
    });
    if (memberships.length === 0) return;

    for (const membership of memberships) {
      const event = membership.event;
      const poolBarIds = (
        await this.prisma.globalEventBar.findMany({
          where: { eventId: event.id },
          select: { barId: true },
        })
      ).map((b) => b.barId);

      const unlocks = await this.prisma.userDrinkUnlock.findMany({
        where: {
          userId,
          barId: { in: poolBarIds },
          unlockedAt: { gte: event.startsAt, lte: event.endsAt },
        },
        select: { barId: true },
      });
      const distinctBars = new Set(unlocks.map((u) => u.barId));
      const progress = Math.min(distinctBars.size, event.targetCount);
      const completed = progress >= event.targetCount;

      const prev = await this.prisma.userGlobalEventProgress.findUnique({
        where: { userId_eventId: { userId, eventId: event.id } },
      });

      await this.prisma.userGlobalEventProgress.upsert({
        where: { userId_eventId: { userId, eventId: event.id } },
        create: {
          userId,
          eventId: event.id,
          progress,
          completedAt: completed ? now : null,
        },
        update: {
          progress,
          completedAt: completed ? now : null,
        },
      });

      if (completed) {
        const existingMedal = await this.prisma.userGlobalEventMedal.findUnique({
          where: { userId_eventId: { userId, eventId: event.id } },
        });
        if (!existingMedal) {
          await this.prisma.userGlobalEventMedal.create({
            data: { userId, eventId: event.id },
          });
          await this.notifications.create(
            userId,
            NotificationType.GLOBAL_EVENT_COMPLETED,
            `Medalla: ${event.medalTitle}`,
            event.medalDescription,
            { eventId: event.id, category: 'global_events' },
          );
        }
      } else if (!prev || progress > prev.progress) {
        await this.notifications.create(
          userId,
          NotificationType.GLOBAL_EVENT_PROGRESS,
          event.title,
          `Progreso ${progress}/${event.targetCount} bares Legend.`,
          { eventId: event.id, progress, category: 'global_events' },
        );
      }
    }
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

  private async assertLegendBarPool(barIds: string[], targetCount: number) {
    const unique = [...new Set(barIds)];
    if (unique.length < targetCount) {
      throw new BadRequestException(
        `El pool debe tener al menos ${targetCount} bares Legend distintos.`,
      );
    }
    const now = new Date();
    const bars = await this.prisma.bar.findMany({
      where: { id: { in: unique }, deletedAt: null, isActive: true },
      include: { subscription: true },
    });
    if (bars.length !== unique.length) {
      throw new BadRequestException('Uno o más bares no existen o están inactivos.');
    }
    for (const bar of bars) {
      if (!evaluateSubscriptionActive(bar.subscription, now).allowed) {
        throw new BadRequestException(
          `${bar.businessName} no tiene suscripción activa.`,
        );
      }
      if (!globalEventsEnabledForPlan(normalizeSubscriptionPlan(bar.subscription?.plan))) {
        throw new BadRequestException(
          `${bar.businessName} no es plan Legend (requerido para eventos globales).`,
        );
      }
    }
  }

  private async requireEvent(eventId: string) {
    const event = await this.prisma.globalEvent.findFirst({
      where: { id: eventId, deletedAt: null },
    });
    if (!event) throw new NotFoundException('Evento global no encontrado.');
    return event;
  }
}
