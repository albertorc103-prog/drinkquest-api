import { BadRequestException } from '@nestjs/common';
import {
  BarSubscription,
  Prisma,
  PromotionApprovalStatus,
  PromotionStatus,
} from '@prisma/client';
import { activePromoSubscriptionWhere } from './promotion-feed-subscription.where';
import { assertNotAlreadyExpired, assertValidPromotionWindow } from './promotion-dates.util';

/** Filtro Prisma alineado con GET /promotions/feed (listForUsers). */
export function buildClientPromotionFeedWhere(now: Date = new Date()): Prisma.BarPromotionWhereInput {
  return {
    status: PromotionStatus.ACTIVE,
    approvalStatus: PromotionApprovalStatus.APPROVED,
    startsAt: { lte: now },
    endsAt: { gt: now },
    bar: {
      deletedAt: null,
      isActive: true,
      subscription: { is: activePromoSubscriptionWhere(now) },
    },
  };
}

export function isSubscriptionActiveForPromoFeed(
  subscription: Pick<
    BarSubscription,
    'status' | 'promoEnabled' | 'trialEndsAt' | 'currentPeriodEnd'
  > | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!subscription?.promoEnabled) return false;
  if (subscription.status === 'TRIAL') {
    return subscription.trialEndsAt == null || subscription.trialEndsAt >= now;
  }
  if (subscription.status === 'ACTIVE') {
    return subscription.currentPeriodEnd == null || subscription.currentPeriodEnd >= now;
  }
  return false;
}

export type ApprovalPublishPatch = {
  status: PromotionStatus;
  startsAt?: Date;
  activated: boolean;
  startsAtAdjusted: boolean;
};

/**
 * Tras aprobación admin: deja la promo lista para el feed (ACTIVE, ventana válida, inicio no futuro).
 */
export function computeApprovalPublishPatch(
  promo: { status: PromotionStatus; startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): ApprovalPublishPatch {
  assertValidPromotionWindow(promo.startsAt, promo.endsAt);
  assertNotAlreadyExpired(promo.endsAt, now);

  const startsAtAdjusted = promo.startsAt > now;
  const activated = promo.status !== PromotionStatus.ACTIVE;

  return {
    status: PromotionStatus.ACTIVE,
    ...(startsAtAdjusted ? { startsAt: now } : {}),
    activated,
    startsAtAdjusted,
  };
}

export function evaluateFeedEligibility(
  promo: {
    status: PromotionStatus;
    approvalStatus: PromotionApprovalStatus;
    startsAt: Date;
    endsAt: Date;
  },
  bar: {
    isActive: boolean;
    deletedAt: Date | null;
    subscription: Parameters<typeof isSubscriptionActiveForPromoFeed>[0];
  },
  now: Date = new Date(),
) {
  const checks = {
    statusIsActive: promo.status === PromotionStatus.ACTIVE,
    approvalIsApproved: promo.approvalStatus === PromotionApprovalStatus.APPROVED,
    startsAtLteNow: promo.startsAt <= now,
    endsAtGtNow: promo.endsAt > now,
    barActive: bar.deletedAt == null && bar.isActive,
    subscriptionPromoEnabled: isSubscriptionActiveForPromoFeed(bar.subscription, now),
  };
  return {
    checks,
    passesFeedFilter: Object.values(checks).every(Boolean),
  };
}

export function assertApprovablePromotion(
  promo: { status: PromotionStatus; endsAt: Date },
  now: Date = new Date(),
): void {
  if (promo.status === PromotionStatus.EXPIRED) {
    throw new BadRequestException('No se puede aprobar una promoción expirada.');
  }
  assertNotAlreadyExpired(promo.endsAt, now);
}
