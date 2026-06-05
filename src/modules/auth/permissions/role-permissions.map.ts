import { Role } from '@prisma/client';
import { AuthPermission } from './auth-permission.enum';

const ALL = [AuthPermission.ALL] as const;

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly AuthPermission[]>> = {
  [Role.SUPER_ADMIN]: ALL,
  [Role.ADMIN]: [
    AuthPermission.MANAGE_USERS,
    AuthPermission.MANAGE_BARS,
    AuthPermission.MANAGE_PROMOTIONS,
    AuthPermission.MODERATE_CONTENT,
    AuthPermission.MANAGE_SUBSCRIPTIONS,
    AuthPermission.VIEW_ANALYTICS,
  ],
  [Role.BAR]: [AuthPermission.MANAGE_BAR, AuthPermission.MANAGE_PROMOTIONS],
  [Role.USER]: [],
};
