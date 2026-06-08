import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  SubscriptionEventType,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SubscriptionChangeContext } from './interfaces/subscription-change-context.interface';

type DbClient = Prisma.TransactionClient | PrismaService;

type MutateOptions = {
  eventType: SubscriptionEventType;
  statusChange?: boolean;
  payload?: Prisma.InputJsonValue;
};

@Injectable()
export class BarSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createTrialSubscription(
    barId: string,
    tx?: Prisma.TransactionClient,
    options?: { plan?: SubscriptionPlan; trialDays?: number },
  ) {
    const db = this.client(tx);
    await this.assertBarExists(barId, db);

    const existing = await db.barSubscription.findUnique({ where: { barId } });
    if (existing) {
      throw new ConflictException('Este local ya tiene una suscripción registrada.');
    }

    const trialDays = options?.trialDays ?? this.config.get<number>('subscription.barTrialDays', 14);
    const trialEndsAt = this.addDays(new Date(), trialDays);

    return db.barSubscription.create({
      data: {
        barId,
        status: SubscriptionStatus.TRIAL,
        plan: options?.plan ?? SubscriptionPlan.BASIC,
        trialEndsAt,
        currentPeriodEnd: trialEndsAt,
        qrEnabled: true,
        promoEnabled: true,
      },
    });
  }

  /** @deprecated Prefer AdminSubscriptionsService — kept for compat interna. */
  async activateSubscription(
    barId: string,
    options?: {
      plan?: SubscriptionPlan;
      periodDays?: number;
      qrEnabled?: boolean;
      promoEnabled?: boolean;
    },
    ctx: SubscriptionChangeContext = { actorSource: 'system' },
  ) {
    const sub = await this.requireSubscription(barId);
    const periodDays = options?.periodDays ?? 30;
    const periodEnd = this.addDays(new Date(), periodDays);

    return this.mutate(
      barId,
      {
        status: SubscriptionStatus.ACTIVE,
        plan: options?.plan ?? sub.plan,
        currentPeriodEnd: periodEnd,
        canceledAt: null,
        qrEnabled: options?.qrEnabled ?? true,
        promoEnabled: options?.promoEnabled ?? true,
      },
      ctx,
      { eventType: SubscriptionEventType.ACTIVATED, statusChange: true },
      sub,
    );
  }

  /** @deprecated Prefer AdminSubscriptionsService */
  async suspendSubscription(barId: string, ctx: SubscriptionChangeContext = { actorSource: 'system' }) {
    const sub = await this.requireSubscription(barId);
    return this.mutate(
      barId,
      {
        status: SubscriptionStatus.SUSPENDED,
        qrEnabled: false,
        promoEnabled: false,
      },
      ctx,
      { eventType: SubscriptionEventType.SUSPENDED, statusChange: true },
      sub,
    );
  }

  async findByBarId(barId: string) {
    return this.prisma.barSubscription.findUnique({ where: { barId } });
  }

  /**
   * Punto único de escritura: auditoría en fila + evento histórico.
   * Usado por AdminSubscriptionsService y futuros webhooks Stripe.
   */
  async mutate(
    barId: string,
    data: Prisma.BarSubscriptionUpdateInput,
    ctx: SubscriptionChangeContext,
    options: MutateOptions,
    existing?: { id: string; status: SubscriptionStatus },
  ) {
    const sub = existing ?? (await this.requireSubscription(barId));
    const now = new Date();
    const nextStatus = (data.status as SubscriptionStatus | undefined) ?? sub.status;
    const statusChanging =
      options.statusChange === true || (data.status !== undefined && nextStatus !== sub.status);

    const audit: Prisma.BarSubscriptionUpdateInput = {};
    if (statusChanging) {
      audit.lastStatusChangedAt = now;
      if (ctx.actorSource === 'admin' && ctx.actorUserId) {
        audit.updatedByAdminId = ctx.actorUserId;
      }
      if (ctx.reason !== undefined) {
        audit.statusReason = ctx.reason ?? null;
      }
    }

    const updated = await this.prisma.barSubscription.update({
      where: { id: sub.id },
      data: { ...data, ...audit },
    });

    await this.prisma.barSubscriptionEvent.create({
      data: {
        subscriptionId: updated.id,
        barId,
        eventType: options.eventType,
        actorUserId: ctx.actorUserId,
        actorSource: ctx.actorSource,
        previousStatus: statusChanging ? sub.status : undefined,
        newStatus: statusChanging ? updated.status : undefined,
        reason: ctx.reason,
        payload: options.payload,
      },
    });

    return updated;
  }

  private client(tx?: Prisma.TransactionClient): DbClient {
    return tx ?? this.prisma;
  }

  private async assertBarExists(barId: string, db: DbClient) {
    const bar = await db.bar.findFirst({
      where: { id: barId, deletedAt: null },
      select: { id: true },
    });
    if (!bar) throw new NotFoundException('Local no encontrado o dado de baja.');
  }

  async requireSubscription(barId: string) {
    const sub = await this.prisma.barSubscription.findUnique({ where: { barId } });
    if (!sub) {
      throw new NotFoundException('No existe suscripción para este local.');
    }
    return sub;
  }

  addDays(from: Date, days: number): Date {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }
}
