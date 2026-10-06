import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  resolveAgeVerifiedAt,
  resolvePublicRegisterRole,
} from './auth-register-age.logic';

describe('auth-register-age.logic', () => {
  const now = new Date('2026-10-05T18:00:00.000Z');

  it('TEST 8: role ADMIN públicamente → FAIL', () => {
    expect(() => resolvePublicRegisterRole('ADMIN')).toThrow(BadRequestException);
  });

  it('TEST 9: role SUPER_ADMIN públicamente → FAIL', () => {
    expect(() => resolvePublicRegisterRole('SUPER_ADMIN')).toThrow(BadRequestException);
  });

  it('acepta USER y BAR', () => {
    expect(resolvePublicRegisterRole('USER')).toBe(Role.USER);
    expect(resolvePublicRegisterRole('BAR')).toBe(Role.BAR);
    expect(resolvePublicRegisterRole(undefined)).toBe(Role.USER);
  });

  it('TEST 10: USER válido → ageVerifiedAt Date', () => {
    const at = resolveAgeVerifiedAt({ birthDate: '2000-05-15' }, Role.USER, now);
    expect(at).toEqual(now);
  });

  it('USER menor → FAIL con mensaje 18+', () => {
    expect(() =>
      resolveAgeVerifiedAt({ birthDate: '2015-01-01' }, Role.USER, now),
    ).toThrow(/18 años/i);
  });

  it('TEST 15: BAR con adultConfirmed → ageVerifiedAt', () => {
    const at = resolveAgeVerifiedAt({ adultConfirmed: true }, Role.BAR, now);
    expect(at).toEqual(now);
  });

  it('TEST 15b: BAR sin adultConfirmed → FAIL', () => {
    expect(() => resolveAgeVerifiedAt({}, Role.BAR, now)).toThrow(/mayor de 18/i);
  });

  it('BAR no usa birthDate como sustituto', () => {
    expect(() =>
      resolveAgeVerifiedAt({ birthDate: '1990-01-01', adultConfirmed: false }, Role.BAR, now),
    ).toThrow(/mayor de 18/i);
  });
});
