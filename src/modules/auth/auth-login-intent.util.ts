import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthLoginIntent } from './enums/auth-login-intent.enum';

/** Roles que pueden autenticarse con intent USER o BAR (sin intent ADMIN dedicado). */
export const ADMIN_LOGIN_ROLES: ReadonlySet<Role> = new Set([Role.ADMIN, Role.SUPER_ADMIN]);

export function isAdminLoginRole(role: Role): boolean {
  return ADMIN_LOGIN_ROLES.has(role);
}

/**
 * Valida intent vs rol (solo cuando el cliente envía intent).
 * ADMIN/SUPER_ADMIN pasan en ambos intents para Swagger y clientes legacy.
 * Login unificado (sin intent) no llama a esta función.
 */
export function validateLoginIntent(
  role: Role,
  intent: AuthLoginIntent,
  hasLinkedBar: boolean,
): void {
  const isAdmin = isAdminLoginRole(role);

  if (intent === AuthLoginIntent.USER) {
    if (role !== Role.USER && !isAdmin) {
      if (role === Role.BAR) {
        throw new ForbiddenException(
          'Esta cuenta es de establecimiento. Inicia sesión de nuevo para continuar.',
        );
      }
      throw new ForbiddenException(
        'Este tipo de cuenta no puede usar el acceso de cliente.',
      );
    }
    return;
  }

  if (role !== Role.BAR && !isAdmin) {
    if (role === Role.USER) {
      throw new ForbiddenException(
        'Esta cuenta es de cliente. Inicia sesión de nuevo para continuar.',
      );
    }
    throw new ForbiddenException(
      'Este tipo de cuenta no puede usar el panel de negocio.',
    );
  }

  if (!isAdmin && !hasLinkedBar) {
    throw new ForbiddenException(
      'No hay un local vinculado a esta cuenta. Contacta a soporte de DrinkQuest.',
    );
  }
}
