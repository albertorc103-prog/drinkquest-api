import { SubscriptionPlan } from '@prisma/client';
import {
  shapeAnalyticsForPlan,
  analyticsTrendsEnabledForPlan,
  analyticsPeakHoursEnabledForPlan,
  advancedAnalyticsEnabledForPlan,
} from './subscription-plan.util';

const sample = {
  unlocksToday: 5,
  unlocksYesterday: 3,
  mostPopularDrink: 'Mojito',
  uniqueUsers: 10,
  totalScans: 20,
  weeklyActivity: [1, 2, 3, 4, 5, 6, 7],
  topDrinks: [
    { name: 'A', count: 8 },
    { name: 'B', count: 7 },
    { name: 'C', count: 6 },
    { name: 'D', count: 5 },
    { name: 'E', count: 4 },
  ],
  peakHours: Array.from({ length: 24 }, (_, i) => i),
  newUsers: 2,
  returningUsers: 8,
  updatedAt: '2026-07-19T12:00:00.000Z',
};

describe('shapeAnalyticsForPlan', () => {
  it('Explorer: solo KPIs básicos', () => {
    const shaped = shapeAnalyticsForPlan(sample, SubscriptionPlan.EXPLORER);
    expect(shaped.planTier).toBe('basic');
    expect(shaped.unlocksToday).toBe(5);
    expect(shaped.weeklyActivity.every((n) => n === 0)).toBe(true);
    expect(shaped.topDrinks).toEqual([]);
    expect(shaped.peakHours.every((n) => n === 0)).toBe(true);
    expect(shaped.newUsers).toBe(0);
    expect(shaped.returningUsers).toBe(0);
  });

  it('Intermedio: tendencias y horas pico, top 3, sin audiencia', () => {
    const shaped = shapeAnalyticsForPlan(sample, SubscriptionPlan.INTERMEDIATE);
    expect(shaped.planTier).toBe('trends');
    expect(shaped.weeklyActivity).toEqual(sample.weeklyActivity);
    expect(shaped.topDrinks).toHaveLength(3);
    expect(shaped.peakHours[10]).toBe(10);
    expect(shaped.newUsers).toBe(0);
    expect(shaped.returningUsers).toBe(0);
  });

  it('Legend: dashboard completo', () => {
    const shaped = shapeAnalyticsForPlan(sample, SubscriptionPlan.LEGEND);
    expect(shaped.planTier).toBe('advanced');
    expect(shaped.topDrinks).toHaveLength(5);
    expect(shaped.newUsers).toBe(2);
    expect(shaped.returningUsers).toBe(8);
  });
});

describe('analytics plan helpers', () => {
  it('aligns with SaaS catalog', () => {
    expect(analyticsTrendsEnabledForPlan(SubscriptionPlan.EXPLORER)).toBe(false);
    expect(analyticsTrendsEnabledForPlan(SubscriptionPlan.INTERMEDIATE)).toBe(true);
    expect(analyticsPeakHoursEnabledForPlan(SubscriptionPlan.INTERMEDIATE)).toBe(true);
    expect(advancedAnalyticsEnabledForPlan(SubscriptionPlan.INTERMEDIATE)).toBe(false);
    expect(advancedAnalyticsEnabledForPlan(SubscriptionPlan.LEGEND)).toBe(true);
  });
});
