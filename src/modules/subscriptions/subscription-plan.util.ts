import { SubscriptionPlan } from '@prisma/client';

/** Planes aceptados en API (incluye alias legacy BASIC/PRO). */
export const SUBSCRIPTION_PLAN_INPUTS = [
  'EXPLORER',
  'INTERMEDIATE',
  'INTERMEDIO',
  'MEDIUM',
  'LEGEND',
  'LEGENDARY',
  'PREMIUM',
  'BASIC',
  'PRO',
  'FREE',
] as const;

export function normalizeSubscriptionPlan(
  plan?: string | SubscriptionPlan | null,
): SubscriptionPlan {
  switch (String(plan ?? SubscriptionPlan.EXPLORER).toUpperCase()) {
    case 'INTERMEDIATE':
    case 'INTERMEDIO':
    case 'MEDIUM':
    case 'PRO':
      return SubscriptionPlan.INTERMEDIATE;
    case 'LEGEND':
    case 'LEGENDARY':
    case 'PREMIUM':
      return SubscriptionPlan.LEGEND;
    case 'EXPLORER':
    case 'BASIC':
    case 'FREE':
    default:
      return SubscriptionPlan.EXPLORER;
  }
}

/** Promociones habilitadas para todos los planes (Explorer con tope de activas). */
export function promotionsEnabledForPlan(plan: SubscriptionPlan): boolean {
  switch (normalizeSubscriptionPlan(plan)) {
    case SubscriptionPlan.EXPLORER:
    case SubscriptionPlan.INTERMEDIATE:
    case SubscriptionPlan.LEGEND:
      return true;
    default:
      return false;
  }
}

/**
 * Límite de promociones ACTIVAS simultáneas por plan.
 * `null` = ilimitado. Explorer permite hasta 3; el resto se define en fases posteriores.
 */
export function activePromotionLimitForPlan(plan: SubscriptionPlan): number | null {
  switch (normalizeSubscriptionPlan(plan)) {
    case SubscriptionPlan.EXPLORER:
      return 3;
    case SubscriptionPlan.INTERMEDIATE:
    case SubscriptionPlan.LEGEND:
    default:
      return null;
  }
}

export function subscriptionPlanPriceMxn(plan: SubscriptionPlan): number {
  switch (plan) {
    case SubscriptionPlan.INTERMEDIATE:
      return 1000;
    case SubscriptionPlan.LEGEND:
      return 1500;
    case SubscriptionPlan.EXPLORER:
    default:
      return 499;
  }
}

/** Plan Explorer: el admin asigna hasta N bebidas del catálogo para QR. */
export function explorerQrDrinkLimit(): number {
  return 15;
}

export function isExplorerPlan(plan: SubscriptionPlan): boolean {
  return normalizeSubscriptionPlan(plan) === SubscriptionPlan.EXPLORER;
}

export function qrDrinkLimitForPlan(plan: SubscriptionPlan): number | null {
  return isExplorerPlan(plan) ? explorerQrDrinkLimit() : null;
}
