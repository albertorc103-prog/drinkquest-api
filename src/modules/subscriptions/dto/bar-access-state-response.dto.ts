import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { BarAccessDenialReason } from '../enums/bar-access-denial-reason.enum';

export interface BarAccessFlagsDto {
  subscriptionActive: boolean;
  canGenerateQr: boolean;
  canUsePromotions: boolean;
  denialReason?: BarAccessDenialReason;
  denialMessage?: string;
}

/** Estado SaaS autoritativo para dashboard BAR (Android). */
export interface BarAccessStateResponseDto {
  barId: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  qrEnabled: boolean;
  promoEnabled: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  access: BarAccessFlagsDto;
}
