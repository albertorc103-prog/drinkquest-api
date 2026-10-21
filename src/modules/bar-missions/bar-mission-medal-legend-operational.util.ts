import { SubscriptionPlan } from '@prisma/client';
import { evaluateSubscriptionActive, SubscriptionSlice } from '../subscriptions/bar-access.rules';
import { barCustomMedalEnabledForPlan, normalizeSubscriptionPlan } from '../subscriptions/subscription-plan.util';

export type LegendMedalOperationalState = {
  /** La medalla ACTIVE puede aceptar nuevos desbloqueos y recompensas. */
  operational: boolean;
  /** Suspendida por suscripción/plan (derivado; no cambia status ACTIVE en BD). */
  subscriptionSuspended: boolean;
  suspensionMessage: string | null;
  plan: SubscriptionPlan | null;
};

/**
 * Autoridad backend: elegibilidad Legend para operación de medalla oficial (no Quest Collection histórica).
 */
export function evaluateLegendMedalOperational(
  subscription: (SubscriptionSlice & { plan: SubscriptionPlan }) | null,
  now: Date = new Date(),
): LegendMedalOperationalState {
  if (!subscription) {
    return {
      operational: false,
      subscriptionSuspended: true,
      suspensionMessage: 'Este local no tiene suscripción Legend vigente.',
      plan: null,
    };
  }
  const plan = normalizeSubscriptionPlan(subscription.plan);
  if (!barCustomMedalEnabledForPlan(plan)) {
    return {
      operational: false,
      subscriptionSuspended: true,
      suspensionMessage:
        'La medalla oficial requiere plan Legend. Renueva o actualiza tu suscripción.',
      plan,
    };
  }
  const subDecision = evaluateSubscriptionActive(subscription, now);
  if (!subDecision.allowed) {
    return {
      operational: false,
      subscriptionSuspended: true,
      suspensionMessage: subDecision.message ?? 'Suscripción no vigente para medallas Legend.',
      plan,
    };
  }
  return {
    operational: true,
    subscriptionSuspended: false,
    suspensionMessage: null,
    plan,
  };
}
