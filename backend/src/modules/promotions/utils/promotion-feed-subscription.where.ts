import { Prisma } from '@prisma/client';

/** Filtro Prisma: solo bares con suscripción SaaS que permite promos visibles. */
export function activePromoSubscriptionWhere(now: Date = new Date()): Prisma.BarSubscriptionWhereInput {
  return {
    promoEnabled: true,
    OR: [
      {
        status: 'TRIAL',
        OR: [{ trialEndsAt: null }, { trialEndsAt: { gte: now } }],
      },
      {
        status: 'ACTIVE',
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: now } }],
      },
    ],
  };
}
