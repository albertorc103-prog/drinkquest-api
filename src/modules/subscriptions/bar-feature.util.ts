import { SubscriptionPlan } from '@prisma/client';

/**
 * Features comerciales de bar (entitlements).
 * El dominio de medallas/misiones consulta features, no el nombre del plan.
 */
export enum BarFeature {
  /** Temporadas de misiones del local. */
  BAR_MISSIONS = 'BAR_MISSIONS',
  /** Medalla de local configurable + review (v2). */
  BAR_CUSTOM_MEDAL = 'BAR_CUSTOM_MEDAL',
}

/** Mapa plan → features. Cambiar aquí para ampliar planes sin tocar dominio. */
const PLAN_FEATURES: Readonly<Record<SubscriptionPlan, readonly BarFeature[]>> = {
  [SubscriptionPlan.EXPLORER]: [],
  [SubscriptionPlan.INTERMEDIATE]: [],
  [SubscriptionPlan.LEGEND]: [BarFeature.BAR_MISSIONS, BarFeature.BAR_CUSTOM_MEDAL],
  [SubscriptionPlan.BASIC]: [],
  [SubscriptionPlan.PRO]: [],
};

export function featuresForPlan(plan: SubscriptionPlan): readonly BarFeature[] {
  return PLAN_FEATURES[plan] ?? [];
}

export function planHasFeature(plan: SubscriptionPlan, feature: BarFeature): boolean {
  return featuresForPlan(plan).includes(feature);
}
