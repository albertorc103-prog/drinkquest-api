import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertAdultBirthDate, ageCheckErrorMessage } from '../../common/utils/age.util';
import { PUBLIC_REGISTER_ROLES } from './dto/register.dto';

/**
 * Lógica pura de registro público (espejo de AuthService.resolve*).
 * Probada sin Nest para TEST 8–10 y reglas de rol.
 */
export function resolvePublicRegisterRole(raw?: string): Role {
  const role = (raw ?? 'USER').toUpperCase();
  if (!(PUBLIC_REGISTER_ROLES as readonly string[]).includes(role)) {
    throw new BadRequestException('El rol de registro solo puede ser USER o BAR.');
  }
  return role as Role;
}

export function resolveAgeVerifiedAt(
  input: { birthDate?: string; adultConfirmed?: boolean },
  role: Role,
  now: Date = new Date(),
): Date {
  if (role === Role.USER) {
    const check = assertAdultBirthDate(input.birthDate, now);
    if (!check.ok) {
      throw new BadRequestException(ageCheckErrorMessage(check.code));
    }
    return now;
  }
  if (role === Role.BAR) {
    if (input.adultConfirmed !== true) {
      throw new BadRequestException(
        'Debes confirmar que eres mayor de 18 años para registrar un negocio.',
      );
    }
    return now;
  }
  throw new BadRequestException('El rol de registro solo puede ser USER o BAR.');
}
