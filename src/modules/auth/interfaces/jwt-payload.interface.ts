import { Role, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { AccountType } from '../permissions/account-type.enum';
import { AuthPermission } from '../permissions/auth-permission.enum';

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
  /** Opcional en tokens legacy; JwtStrategy los rehidrata desde role. */
  permissions?: AuthPermission[];
  accountType?: AccountType;
  isAdmin?: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}
