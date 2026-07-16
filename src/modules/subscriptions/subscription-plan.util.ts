import { DrinkRarity, SubscriptionPlan } from '@prisma/client';

/** Cupos de bebidas especializadas por rareza (0 = no permitido). */
export type SpecialDrinkRarityQuotas = Record<DrinkRarity, number>;

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

/** Bebidas especializadas del local: Intermedio y Legend. */
export function specialDrinksEnabledForPlan(plan: SubscriptionPlan): boolean {
  const normalized = normalizeSubscriptionPlan(plan);
  return (
    normalized === SubscriptionPlan.INTERMEDIATE ||
    normalized === SubscriptionPlan.LEGEND
  );
}

/**
 * Cupos por rareza:
 * - Intermedio: 3 comunes (resto 0)
 * - Legend: 5 comunes, 3 raras, 2 épicas, 1 legendaria
 */
export function specialDrinkQuotasForPlan(
  plan: SubscriptionPlan,
): SpecialDrinkRarityQuotas | null {
  switch (normalizeSubscriptionPlan(plan)) {
    case SubscriptionPlan.INTERMEDIATE:
      return {
        [DrinkRarity.COMMON]: 3,
        [DrinkRarity.RARE]: 0,
        [DrinkRarity.EPIC]: 0,
        [DrinkRarity.LEGENDARY]: 0,
      };
    case SubscriptionPlan.LEGEND:
      return {
        [DrinkRarity.COMMON]: 5,
        [DrinkRarity.RARE]: 3,
        [DrinkRarity.EPIC]: 2,
        [DrinkRarity.LEGENDARY]: 1,
      };
    default:
      return null;
  }
}

/** Suma de cupos (tope total de slots no eliminados). */
export function specialDrinkLimitForPlan(plan: SubscriptionPlan): number | null {
  const quotas = specialDrinkQuotasForPlan(plan);
  if (!quotas) return null;
  return Object.values(quotas).reduce((sum, n) => sum + n, 0);
}

export function specialDrinkXpForRarity(rarity: DrinkRarity): number {
  switch (rarity) {
    case DrinkRarity.RARE:
      return 25;
    case DrinkRarity.EPIC:
      return 50;
    case DrinkRarity.LEGENDARY:
      return 100;
    case DrinkRarity.COMMON:
    default:
      return 10;
  }
}

/** Temporada de misiones + medalla del local: solo Legend. */
export function barMissionsEnabledForPlan(plan: SubscriptionPlan): boolean {
  return normalizeSubscriptionPlan(plan) === SubscriptionPlan.LEGEND;
}

/** Eventos temáticos Happy Hour (Navidad, aniversario, etc.): solo Legend. */
export function thematicEventsEnabledForPlan(plan: SubscriptionPlan): boolean {
  return normalizeSubscriptionPlan(plan) === SubscriptionPlan.LEGEND;
}

/** Rooftop (terraza/jardín + paquetes): solo Legend. */
export function rooftopEnabledForPlan(plan: SubscriptionPlan): boolean {
  return normalizeSubscriptionPlan(plan) === SubscriptionPlan.LEGEND;
}

/** Reservas de mesa (nombre, personas, fecha; sin depósito): solo Legend. */
export function reservationsEnabledForPlan(plan: SubscriptionPlan): boolean {
  return normalizeSubscriptionPlan(plan) === SubscriptionPlan.LEGEND;
}
