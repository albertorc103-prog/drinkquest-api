import { AGE_VERIFICATION_REQUIRED_SINCE, assertAgeGateForSensitiveAction } from './age-gate.util';
import { Role } from '@prisma/client';

describe('assertAgeGateForSensitiveAction', () => {
  it('permite USER con ageVerifiedAt', () => {
    expect(() =>
      assertAgeGateForSensitiveAction({
        role: Role.USER,
        ageVerifiedAt: new Date(),
        createdAt: new Date(),
      }),
    ).not.toThrow();
  });

  it('permite legacy (null ageVerifiedAt, createdAt anterior al corte)', () => {
    expect(() =>
      assertAgeGateForSensitiveAction({
        role: Role.USER,
        ageVerifiedAt: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ).not.toThrow();
  });

  it('bloquea cuenta post-FASE2 sin ageVerifiedAt', () => {
    expect(() =>
      assertAgeGateForSensitiveAction({
        role: Role.USER,
        ageVerifiedAt: null,
        createdAt: new Date(AGE_VERIFICATION_REQUIRED_SINCE.getTime() + 86_400_000),
      }),
    ).toThrow(/mayoría de edad/i);
  });

  it('permite ADMIN sin ageVerifiedAt', () => {
    expect(() =>
      assertAgeGateForSensitiveAction({
        role: Role.ADMIN,
        ageVerifiedAt: null,
        createdAt: new Date(),
      }),
    ).not.toThrow();
  });
});
