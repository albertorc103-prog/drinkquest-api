import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SubscriptionEventType,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';
import { BarSubscriptionService } from '../subscriptions/bar-subscription.service';
import {
  normalizeSubscriptionPlan,
  promotionsEnabledForPlan,
} from '../subscriptions/subscription-plan.util';
import { planForStripePriceId } from './stripe-plan.util';

@Injectable()
export class StripeSubscriptionSyncService {
  private readonly logger = new Logger(StripeSubscriptionSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: BarSubscriptionService,
    private readonly config: ConfigService,
  ) {}

  async applyStripeSubscription(
    stripeSub: Stripe.Subscription,
    fallbackBarId?: string,
  ): Promise<void> {
    const barId =
      stripeSub.metadata?.barId ||
      fallbackBarId ||
      (await this.findBarIdByStripeCustomer(String(stripeSub.customer)));

    if (!barId) {
      this.logger.warn(
        JSON.stringify({
          event: 'stripe_subscription_orphan',
          subscriptionId: stripeSub.id,
          customerId: stripeSub.customer,
        }),
      );
      return;
    }

    const local = await this.prisma.barSubscription.findUnique({ where: { barId } });
    if (!local) {
      throw new NotFoundException(`Suscripción local no encontrada para bar ${barId}`);
    }

    const priceId = stripeSub.items.data[0]?.price?.id;
    const planFromPrice = priceId ? planForStripePriceId(priceId, this.config) : null;
    // Si los Price ID de env no coinciden (test/live o typo), usar metadata del checkout.
    const planFromMeta = stripeSub.metadata?.plan
      ? normalizeSubscriptionPlan(stripeSub.metadata.plan)
      : null;
    const plan = planFromPrice ?? planFromMeta ?? normalizeSubscriptionPlan(local.plan);
    const status = this.mapStripeStatus(stripeSub.status);
    const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
    const canceledAt = stripeSub.canceled_at
      ? new Date(stripeSub.canceled_at * 1000)
      : null;
    const accessAllowed = status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIAL;

    const eventType = this.eventTypeForTransition(local.status, status);

    await this.subscriptions.mutate(
      barId,
      {
        status,
        plan,
        currentPeriodEnd,
        canceledAt,
        stripeCustomerId: String(stripeSub.customer),
        stripeSubscriptionId: stripeSub.id,
        qrEnabled: accessAllowed,
        promoEnabled: accessAllowed && promotionsEnabledForPlan(plan),
        trialEndsAt:
          status === SubscriptionStatus.TRIAL ? currentPeriodEnd : local.trialEndsAt,
      },
      { actorSource: 'stripe', reason: `stripe:${stripeSub.status}` },
      { eventType, statusChange: local.status !== status, payload: { stripeSubscriptionId: stripeSub.id } },
      local,
    );
  }

  async markPastDue(stripeSub: Stripe.Subscription): Promise<void> {
    const barId =
      stripeSub.metadata?.barId ||
      (await this.findBarIdByStripeCustomer(String(stripeSub.customer)));
    if (!barId) return;

    const local = await this.prisma.barSubscription.findUnique({ where: { barId } });
    if (!local) return;

    await this.subscriptions.mutate(
      barId,
      {
        status: SubscriptionStatus.PAST_DUE,
        stripeSubscriptionId: stripeSub.id,
        qrEnabled: false,
        promoEnabled: false,
      },
      { actorSource: 'stripe', reason: 'invoice.payment_failed' },
      { eventType: SubscriptionEventType.STATUS_CHANGED, statusChange: true },
      local,
    );
  }

  private async findBarIdByStripeCustomer(customerId: string): Promise<string | undefined> {
    const row = await this.prisma.barSubscription.findFirst({
      where: { stripeCustomerId: customerId },
      select: { barId: true },
    });
    return row?.barId;
  }

  private mapStripeStatus(raw: Stripe.Subscription.Status): SubscriptionStatus {
    switch (raw) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIAL;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'unpaid':
      case 'paused':
      case 'incomplete_expired':
        return SubscriptionStatus.SUSPENDED;
      case 'incomplete':
      default:
        return SubscriptionStatus.PAST_DUE;
    }
  }

  private eventTypeForTransition(
    previous: SubscriptionStatus,
    next: SubscriptionStatus,
  ): SubscriptionEventType {
    if (next === SubscriptionStatus.ACTIVE && previous !== SubscriptionStatus.ACTIVE) {
      return SubscriptionEventType.ACTIVATED;
    }
    if (next === SubscriptionStatus.SUSPENDED) {
      return SubscriptionEventType.SUSPENDED;
    }
    if (next === SubscriptionStatus.ACTIVE && previous === SubscriptionStatus.SUSPENDED) {
      return SubscriptionEventType.REACTIVATED;
    }
    return SubscriptionEventType.STATUS_CHANGED;
  }
}
