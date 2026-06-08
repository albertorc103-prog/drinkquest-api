import { Role, User } from '@prisma/client';
import { AuthUserSummaryDto } from '../dto/auth-user-summary.dto';
import { AccountType } from '../permissions/account-type.enum';
import { AuthPermission } from '../permissions/auth-permission.enum';
import { enrichJwtAuthClaims } from '../permissions/auth-context.util';

export function toAuthUserSummary(
  user: Pick<User, 'id' | 'email' | 'role'>,
): AuthUserSummaryDto {
  const claims = enrichJwtAuthClaims(user.role);
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: claims.permissions,
    accountType: claims.accountType,
    isAdmin: claims.isAdmin,
  };
}

export function toAuthUserSummaryFromJwt(
  payload: Pick<
  JwtAuthSubject,
  'sub' | 'email' | 'role' | 'permissions' | 'accountType' | 'isAdmin'
  >,
): AuthUserSummaryDto {
  const claims = enrichJwtAuthClaims(payload.role, {
    permissions: payload.permissions as AuthPermission[] | undefined,
    accountType: payload.accountType,
    isAdmin: payload.isAdmin,
  });
  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    permissions: claims.permissions,
    accountType: claims.accountType,
    isAdmin: claims.isAdmin,
  };
}

interface JwtAuthSubject {
  sub: string;
  email: string;
  role: Role;
  permissions?: AuthPermission[];
  accountType?: AccountType;
  isAdmin?: boolean;
}
