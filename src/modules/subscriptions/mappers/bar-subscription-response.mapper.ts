import { Bar, BarSubscription } from '@prisma/client';
import { BarAccessService } from '../bar-access.service';
import {
  BarSubscriptionAdminResponseDto,
  BarSubscriptionPayloadDto,
} from '../dto/bar-subscription-response.dto';

export function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export function mapSubscriptionPayload(sub: BarSubscription): BarSubscriptionPayloadDto {
  return {
    id: sub.id,
    status: sub.status,
    plan: sub.plan,
    trialEndsAt: toIso(sub.trialEndsAt),
    currentPeriodEnd: toIso(sub.currentPeriodEnd),
    qrEnabled: sub.qrEnabled,
    promoEnabled: sub.promoEnabled,
    canceledAt: toIso(sub.canceledAt),
    lastStatusChangedAt: toIso(sub.lastStatusChangedAt),
    statusReason: sub.statusReason,
    updatedByAdminId: sub.updatedByAdminId,
  };
}

export function buildAdminResponse(
  bar: Pick<Bar, 'id' | 'businessName' | 'ownerUserId' | 'isActive' | 'deletedAt'>,
  subscription: BarSubscription,
  barAccess: BarAccessService,
): BarSubscriptionAdminResponseDto {
  const ctx = { bar, subscription };
  const subDecision = barAccess.canGenerateQr(ctx);
  const promoDecision = barAccess.canUsePromotions(ctx);

  return {
    barId: bar.id,
    businessName: bar.businessName,
    subscription: mapSubscriptionPayload(subscription),
    access: {
      subscriptionActive: barAccess.isSubscriptionActive(ctx),
      canGenerateQr: subDecision.allowed,
      canUsePromotions: promoDecision.allowed,
      denialReason: subDecision.reason ?? promoDecision.reason,
      denialMessage: subDecision.message ?? promoDecision.message,
    },
  };
}
