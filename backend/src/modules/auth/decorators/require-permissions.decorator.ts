import { SetMetadata } from '@nestjs/common';
import { AuthPermission } from '../permissions/auth-permission.enum';

export const PERMISSIONS_KEY = 'permissions';

/** Requiere todos los permisos listados (AND). SUPER_ADMIN con `*` hace bypass. */
export const RequirePermissions = (...permissions: AuthPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
