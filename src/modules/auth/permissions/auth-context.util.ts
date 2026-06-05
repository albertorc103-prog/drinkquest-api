import { Role } from '@prisma/client';
import { AccountType } from './account-type.enum';
import { AuthPermission } from './auth-permission.enum';
import { ROLE_PERMISSIONS } from './role-permissions.map';

export interface AuthContextClaims {
  permissions: AuthPermission[];
  accountType: AccountType;
  isAdmin: boolean;
}

export interface AuthRoleSubject {
  role: Role;
  permissions?: readonly string[];
  accountType?: AccountType;
  isAdmin?: boolean;
}

export function resolveAccountType(role: Role): AccountType {
  if (role === Role.SUPER_ADMIN || role === Role.ADMIN) return AccountType.ADMIN;
  if (role === Role.BAR) return AccountType.BAR;
  return AccountType.USER;
}

export function getPermissionsForRole(role: Role): AuthPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function resolveAuthContext(role: Role): AuthContextClaims {
  const permissions = getPermissionsForRole(role);
  const accountType = resolveAccountType(role);
  return {
    permissions,
    accountType,
    isAdmin: accountType === AccountType.ADMIN,
  };
}

/** Enriquece JWT legacy (sin claims nuevos) con valores derivados del rol actual. */
export function enrichJwtAuthClaims(
  role: Role,
  partial?: Pick<AuthRoleSubject, 'permissions' | 'accountType' | 'isAdmin'>,
): AuthContextClaims {
  const derived = resolveAuthContext(role);
  const permissions =
    partial?.permissions && partial.permissions.length > 0
      ? (partial.permissions as AuthPermission[])
      : derived.permissions;
  const accountType = partial?.accountType ?? derived.accountType;
  const isAdmin = partial?.isAdmin ?? derived.isAdmin;
  return { permissions, accountType, isAdmin };
}

export function isAdmin(subject: AuthRoleSubject): boolean {
  return subject.isAdmin ?? resolveAuthContext(subject.role).isAdmin;
}

export function isBar(subject: AuthRoleSubject): boolean {
  return resolveAccountType(subject.role) === AccountType.BAR;
}

export function isCustomer(subject: AuthRoleSubject): boolean {
  return resolveAccountType(subject.role) === AccountType.USER;
}

/** Permisos efectivos (JWT legacy rehidratado desde rol en BD). */
export function getEffectivePermissions(subject: AuthRoleSubject): AuthPermission[] {
  return enrichJwtAuthClaims(subject.role, {
    permissions: subject.permissions as AuthPermission[] | undefined,
    accountType: subject.accountType,
    isAdmin: subject.isAdmin,
  }).permissions;
}

function hasWildcard(permissions: readonly string[]): boolean {
  return permissions.includes(AuthPermission.ALL) || permissions.includes('*');
}

export function hasPermission(subject: AuthRoleSubject, permission: AuthPermission): boolean {
  const permissions = getEffectivePermissions(subject);
  if (hasWildcard(permissions)) return true;
  return permissions.includes(permission);
}

export function hasAnyPermission(
  subject: AuthRoleSubject,
  required: readonly AuthPermission[],
): boolean {
  if (!required.length) return true;
  return required.some((permission) => hasPermission(subject, permission));
}

export function hasAllPermissions(
  subject: AuthRoleSubject,
  required: readonly AuthPermission[],
): boolean {
  if (!required.length) return true;
  return required.every((permission) => hasPermission(subject, permission));
}
