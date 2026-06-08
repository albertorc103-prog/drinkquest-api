import { AuthPermission } from './auth-permission.enum';
import {
  getEffectivePermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type AuthRoleSubject,
} from './auth-context.util';

/** Helpers para React Native / web (misma lógica que el backend). */
export type ClientAuthUser = AuthRoleSubject;

export { AuthPermission, getEffectivePermissions, hasPermission, hasAnyPermission, hasAllPermissions };

export function canManageUsers(user: ClientAuthUser): boolean {
  return hasPermission(user, AuthPermission.MANAGE_USERS);
}

export function canManageBars(user: ClientAuthUser): boolean {
  return hasPermission(user, AuthPermission.MANAGE_BARS);
}

export function canManageOwnBar(user: ClientAuthUser): boolean {
  return hasPermission(user, AuthPermission.MANAGE_BAR);
}

export function canManagePromotions(user: ClientAuthUser): boolean {
  return hasPermission(user, AuthPermission.MANAGE_PROMOTIONS);
}

export function canModerateContent(user: ClientAuthUser): boolean {
  return hasPermission(user, AuthPermission.MODERATE_CONTENT);
}

export function canManageSubscriptions(user: ClientAuthUser): boolean {
  return hasPermission(user, AuthPermission.MANAGE_SUBSCRIPTIONS);
}

export function canViewAnalytics(user: ClientAuthUser): boolean {
  return hasPermission(user, AuthPermission.VIEW_ANALYTICS);
}

export function canManageSystem(user: ClientAuthUser): boolean {
  return hasPermission(user, AuthPermission.MANAGE_SYSTEM);
}
