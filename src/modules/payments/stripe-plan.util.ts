import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlan } from '@prisma/client';
import { normalizeSubscriptionPlan } from '../subscriptions/subscription-plan.util';

const PRICE_ENV_KEYS: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.EXPLORER]: 'STRIPE_PRICE_EXPLORER',
  [SubscriptionPlan.INTERMEDIATE]: 'STRIPE_PRICE_INTERMEDIATE',
  [SubscriptionPlan.LEGEND]: 'STRIPE_PRICE_LEGEND',
  [SubscriptionPlan.BASIC]: 'STRIPE_PRICE_EXPLORER',
  [SubscriptionPlan.PRO]: 'STRIPE_PRICE_INTERMEDIATE',
};

export function stripePriceIdForPlan(
  planInput: string | SubscriptionPlan,
  config: ConfigService,
): string {
  const plan = normalizeSubscriptionPlan(planInput);
  const envKey = PRICE_ENV_KEYS[plan];
  const priceId = config.get<string>(envKey)?.trim();
  if (!priceId) {
    throw new BadRequestException(
      `Stripe no está configurado para el plan ${plan}. Define ${envKey} en el servidor.`,
    );
  }
  return priceId;
}

export function planForStripePriceId(
  priceId: string,
  config: ConfigService,
): SubscriptionPlan | null {
  const normalized = priceId.trim();
  for (const plan of [
    SubscriptionPlan.EXPLORER,
    SubscriptionPlan.INTERMEDIATE,
    SubscriptionPlan.LEGEND,
  ]) {
    const envKey = PRICE_ENV_KEYS[plan];
    if (config.get<string>(envKey)?.trim() === normalized) {
      return plan;
    }
  }
  return null;
}
