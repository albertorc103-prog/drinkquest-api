import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { BarAccessDenialReason } from '../enums/bar-access-denial-reason.enum';

export interface BarSubscriptionAccessDto {
  subscriptionActive: boolean;
  canGenerateQr: boolean;
  canUsePromotions: boolean;
  denialReason?: BarAccessDenialReason;
  denialMessage?: string;
}

export interface BarSubscriptionPayloadDto {
  id: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  qrEnabled: boolean;
  promoEnabled: boolean;
  canceledAt: string | null;
  lastStatusChangedAt: string | null;
  statusReason: string | null;
  updatedByAdminId: string | null;
}

export interface BarSubscriptionAdminResponseDto {
  barId: string;
  businessName: string;
  subscription: BarSubscriptionPayloadDto;
  access: BarSubscriptionAccessDto;
}
