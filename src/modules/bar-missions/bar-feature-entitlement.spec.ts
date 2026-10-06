import { SubscriptionPlan } from '@prisma/client';
import {
  BarFeature,
  barCustomMedalEnabledForPlan,
  barMissionsEnabledForPlan,
  planHasFeature,
} from '../subscriptions/subscription-plan.util';

describe('BAR_CUSTOM_MEDAL entitlement', () => {
  it('TEST 1: Legend tiene BAR_CUSTOM_MEDAL', () => {
    expect(planHasFeature(SubscriptionPlan.LEGEND, BarFeature.BAR_CUSTOM_MEDAL)).toBe(true);
    expect(barCustomMedalEnabledForPlan(SubscriptionPlan.LEGEND)).toBe(true);
    expect(barMissionsEnabledForPlan(SubscriptionPlan.LEGEND)).toBe(true);
  });

  it('TEST 2: Explorer/Intermediate no tienen BAR_CUSTOM_MEDAL', () => {
    expect(barCustomMedalEnabledForPlan(SubscriptionPlan.EXPLORER)).toBe(false);
    expect(barCustomMedalEnabledForPlan(SubscriptionPlan.INTERMEDIATE)).toBe(false);
    expect(planHasFeature(SubscriptionPlan.EXPLORER, BarFeature.BAR_MISSIONS)).toBe(false);
  });
});
