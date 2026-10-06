import { ForbiddenException } from '@nestjs/common';
import { Role, User } from '@prisma/client';

/**
 * Cuentas creadas a partir de esta fecha deben tener ageVerifiedAt.
 * Anteriores = LEGACY_UNVERIFIED (permitidas sin inventar DOB).
 */
export const AGE_VERIFICATION_REQUIRED_SINCE = new Date('2026-10-05T00:00:00.000Z');

/**
 * Defensa en profundidad post-registro (p. ej. QR redeem de bebidas).
 * - ageVerifiedAt presente → OK (cuentas nuevas FASE 2).
 * - null + createdAt < cutoff → legacy permitido.
 * - null + createdAt >= cutoff → bloqueado (registro anómalo).
 */
export function assertAgeGateForSensitiveAction(
  user: Pick<User, 'role' | 'ageVerifiedAt' | 'createdAt'>,
): void {
  if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) return;
  if (user.ageVerifiedAt) return;

  if (user.createdAt >= AGE_VERIFICATION_REQUIRED_SINCE) {
    throw new ForbiddenException(
      'Tu cuenta no tiene verificación de mayoría de edad. Contacta soporte DrinkQuest.',
    );
  }
}
