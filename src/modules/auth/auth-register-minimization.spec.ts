import { Role } from '@prisma/client';
import { resolveAgeVerifiedAt } from './auth-register-age.logic';
import { toAuthUserSummary } from './mappers/auth-user.mapper';
import { toAuthProfileDto } from './mappers/auth-profile.mapper';

describe('FASE 2 birthDate minimization', () => {
  const now = new Date('2026-10-05T18:00:00.000Z');

  it('TEST 11/12: birthDate no forma parte del resultado de verificación ni de DTOs de usuario', () => {
    const verifiedAt = resolveAgeVerifiedAt({ birthDate: '1995-03-20' }, Role.USER, now);
    expect(verifiedAt).toEqual(now);

    const summary = toAuthUserSummary({
      id: 'u1',
      email: 'a@b.com',
      role: Role.USER,
    });
    expect(summary).not.toHaveProperty('birthDate');
    expect(summary).not.toHaveProperty('ageVerifiedAt');

    const profile = toAuthProfileDto({
      displayName: 'Alex',
      bio: null,
      avatarUrl: null,
      profileVisibility: 'PUBLIC' as never,
      totalXp: 0,
      level: 1,
      emailVerified: false,
    });
    expect(profile).not.toHaveProperty('birthDate');
    expect(JSON.stringify(profile)).not.toContain('birthDate');
  });

  it('datos de create User permitidos no incluyen birthDate', () => {
    // Contrato de AuthService.register: solo estos campos + ageVerifiedAt
    const createData = {
      email: 'x@y.com',
      passwordHash: 'hash',
      displayName: 'X',
      role: Role.USER,
      ageVerifiedAt: now,
    };
    expect(Object.keys(createData)).not.toContain('birthDate');
    expect(Object.keys(createData)).not.toContain('birth_date');
  });
});
