import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessStateService } from '../subscriptions/bar-access-state.service';
import { normalizeSubscriptionPlan } from '../subscriptions/subscription-plan.util';
import { stripePriceIdForPlan } from './stripe-plan.util';
import { StripeService } from './stripe.service';
import { StripeSubscriptionSyncService } from './stripe-subscription-sync.service';

@Injectable()
export class BarStripeCheckoutService {
  private readonly logger = new Logger(BarStripeCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
    private readonly sync: StripeSubscriptionSyncService,
    private readonly accessState: BarAccessStateService,
  ) {}

  async createCheckoutSession(ownerUserId: string, planInput: string) {
    const stripe = this.stripe.requireClient();
    const bar = await this.prisma.bar.findFirst({
      where: { ownerUserId, deletedAt: null },
    });
    if (!bar) throw new NotFoundException('Bar no encontrado');

    const plan = normalizeSubscriptionPlan(planInput);
    const priceId = stripePriceIdForPlan(plan, this.config);

    const subscription = await this.prisma.barSubscription.findUnique({
      where: { barId: bar.id },
    });
    if (!subscription) {
      throw new BadRequestException('Este local no tiene suscripción registrada.');
    }

    let customerId = subscription.stripeCustomerId;
    if (!customerId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: ownerUserId },
        select: { email: true, displayName: true },
      });
      const customer = await stripe.customers.create({
        email: owner?.email ?? undefined,
        name: bar.businessName || owner?.displayName || 'Bar DrinkQuest',
        metadata: { barId: bar.id, ownerUserId },
      });
      customerId = customer.id;
      await this.prisma.barSubscription.update({
        where: { barId: bar.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: this.stripe.checkoutSuccessUrl(),
      cancel_url: this.stripe.checkoutCancelUrl(),
      client_reference_id: bar.id,
      metadata: {
        barId: bar.id,
        plan,
        ownerUserId,
      },
      subscription_data: {
        metadata: {
          barId: bar.id,
          plan,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      locale: 'es',
    });

    if (!session.url) {
      throw new BadRequestException('Stripe no devolvió URL de checkout.');
    }

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      plan,
    };
  }

  /**
   * Sincroniza la suscripción local con Stripe (por si el webhook aún no llegó).
   * Útil justo después del deep link de checkout exitoso.
   */
  async syncSubscriptionFromStripe(ownerUserId: string, checkoutSessionId?: string) {
    const stripe = this.stripe.requireClient();
    const bar = await this.prisma.bar.findFirst({
      where: { ownerUserId, deletedAt: null },
    });
    if (!bar) throw new NotFoundException('Bar no encontrado');

    const local = await this.prisma.barSubscription.findUnique({
      where: { barId: bar.id },
    });
    if (!local) {
      throw new BadRequestException('Este local no tiene suscripción registrada.');
    }

    let stripeSubId = local.stripeSubscriptionId ?? undefined;

    if (checkoutSessionId?.trim()) {
      try {
        const session = await stripe.checkout.sessions.retrieve(checkoutSessionId.trim());
        if (session.subscription) {
          stripeSubId = String(session.subscription);
        }
      } catch (err) {
        this.logger.warn(
          `No se pudo leer checkout session ${checkoutSessionId}: ${(err as Error).message}`,
        );
      }
    }

    if (!stripeSubId && local.stripeCustomerId) {
      const listed = await stripe.subscriptions.list({
        customer: local.stripeCustomerId,
        status: 'all',
        limit: 10,
      });
      const preferred =
        listed.data.find((s) => s.status === 'active' || s.status === 'trialing') ??
        listed.data[0];
      stripeSubId = preferred?.id;
    }

    if (stripeSubId) {
      const sub = await stripe.subscriptions.retrieve(stripeSubId);
      await this.sync.applyStripeSubscription(sub, bar.id);
    } else {
      this.logger.warn(
        JSON.stringify({
          event: 'stripe_sync_no_subscription',
          barId: bar.id,
          checkoutSessionId: checkoutSessionId ?? null,
        }),
      );
    }

    return this.accessState.getStateForOwner(ownerUserId);
  }

  /** Evita que un usuario BAR pague por otro local (defensa en profundidad). */
  assertOwner(ownerUserId: string, barId: string) {
    return this.prisma.bar
      .findFirst({
        where: { id: barId, ownerUserId, deletedAt: null },
        select: { id: true },
      })
      .then((row) => {
        if (!row) throw new ForbiddenException('Sin permisos sobre este local.');
      });
  }
}
