import { Role, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

/** Claims SaaS opcionales en JWT (solo cuentas BAR). */
export interface BarJwtClaims {
  barId?: string;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionPlan?: SubscriptionPlan;
  qrEnabled?: boolean;
  promoEnabled?: boolean;
}

export interface JwtPayload extends BarJwtClaims {
  sub: string;
  email: string;
  role: Role;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}
