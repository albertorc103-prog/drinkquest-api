/** Permisos de aplicación (escalable para guards RBAC). */
export enum AuthPermission {
  ALL = '*',
  MANAGE_USERS = 'manage_users',
  MANAGE_BARS = 'manage_bars',
  MANAGE_BAR = 'manage_bar',
  MANAGE_PROMOTIONS = 'manage_promotions',
  MODERATE_CONTENT = 'moderate_content',
  MANAGE_SUBSCRIPTIONS = 'manage_subscriptions',
  VIEW_ANALYTICS = 'view_analytics',
  MANAGE_SYSTEM = 'manage_system',
}

export type AuthPermissionCode = `${AuthPermission}`;
