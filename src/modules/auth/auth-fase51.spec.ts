import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { hashPassword } from '../../common/utils/crypto.util';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

function sha256(v: string) {
  return createHash('sha256').update(v).digest('hex');
}

describe('FASE 5.1 — securityVersion + refresh race', () => {
  const accessSecret = 'test_access_secret_hs256';
  const refreshSecret = 'test_refresh_secret_hs256';

  function makeService(opts?: { passwordHash?: string }) {
    const tokens: any[] = [];
    const users = new Map<string, any>([
      [
        'u1',
        {
          id: 'u1',
          email: 'a@test.com',
          role: Role.USER,
          deletedAt: null,
          securityVersion: 0,
          passwordHash: opts?.passwordHash ?? '$2b$12$placeholder',
        },
      ],
    ]);
    const passwordResets: any[] = [];
    const deviceTokens: any[] = [{ userId: 'u1', token: 'fcm-1' }];
    const disconnected: string[] = [];

    const prisma: any = {
      user: {
        findFirst: jest.fn(async ({ where, select }: any) => {
          if (where.id) {
            const u = users.get(where.id);
            if (!u || (where.deletedAt === null && u.deletedAt)) return null;
            if (select) {
              const out: any = {};
              for (const k of Object.keys(select)) if (select[k]) out[k] = u[k];
              return out;
            }
            return u;
          }
          return null;
        }),
        findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null),
        update: jest.fn(async ({ where, data, select }: any) => {
          const u = users.get(where.id);
          if (data.passwordHash) u.passwordHash = data.passwordHash;
          if (data.securityVersion?.increment) {
            u.securityVersion += data.securityVersion.increment;
          } else if (typeof data.securityVersion === 'number') {
            u.securityVersion = data.securityVersion;
          }
          if (select) {
            const out: any = {};
            for (const k of Object.keys(select)) if (select[k]) out[k] = u[k];
            return out;
          }
          return u;
        }),
      },
      refreshToken: {
        findFirst: jest.fn(async ({ where, select }: any) => {
          const row =
            tokens.find((t) => {
              if (where.id && t.id !== where.id) return false;
              if (where.tokenHash && t.tokenHash !== where.tokenHash) return false;
              if (where.revokedAt === null && t.revokedAt) return false;
              return true;
            }) ?? null;
          if (!row) return null;
          if (select) {
            const out: any = {};
            for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
            return out;
          }
          return { ...row, user: users.get(row.userId) };
        }),
        create: jest.fn(async ({ data }: any) => {
          const row = {
            id: randomUUID(),
            ...data,
            revokedAt: null,
            replacedById: null,
            user: users.get(data.userId),
          };
          tokens.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = tokens.find((t) => t.id === where.id);
          Object.assign(row, data);
          return row;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const t of tokens) {
            if (where.id && t.id !== where.id) continue;
            if (where.familyId && t.familyId !== where.familyId) continue;
            if (where.userId && t.userId !== where.userId) continue;
            if (where.revokedAt === null && t.revokedAt) continue;
            Object.assign(t, data);
            count += 1;
          }
          return { count };
        }),
      },
      passwordReset: {
        findFirst: jest.fn(async ({ where }: any) => {
          return (
            passwordResets.find((r) => {
              if (where.tokenHash && r.tokenHash !== where.tokenHash) return false;
              if (where.usedAt === null && r.usedAt) return false;
              if (where.expiresAt?.gt && r.expiresAt <= where.expiresAt.gt) return false;
              return true;
            }) ?? null
          );
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = passwordResets.find((r) => r.id === where.id);
          Object.assign(row, data);
          return row;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const r of passwordResets) {
            if (where.userId && r.userId !== where.userId) continue;
            if (where.usedAt === null && r.usedAt) continue;
            if (where.id?.not && r.id === where.id.not) continue;
            Object.assign(r, data);
            count += 1;
          }
          return { count };
        }),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: randomUUID(), usedAt: null, ...data };
          passwordResets.push(row);
          return row;
        }),
      },
      deviceToken: {
        deleteMany: jest.fn(async ({ where }: any) => {
          const before = deviceTokens.length;
          for (let i = deviceTokens.length - 1; i >= 0; i--) {
            if (deviceTokens[i].userId === where.userId) deviceTokens.splice(i, 1);
          }
          return { count: before - deviceTokens.length };
        }),
      },
      bar: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (arg: any) => {
        if (typeof arg === 'function') return arg(prisma);
        return Promise.all(arg);
      }),
      _tokens: tokens,
      _users: users,
      _passwordResets: passwordResets,
      _deviceTokens: deviceTokens,
      _disconnected: disconnected,
    };

    const jwt = new JwtService({});
    const config = {
      get: (k: string, def?: string) => {
        if (k === 'auth.accessSecret') return accessSecret;
        if (k === 'auth.refreshSecret') return refreshSecret;
        if (k === 'auth.accessExpires') return '15m';
        if (k === 'auth.refreshExpires') return '7d';
        return def;
      },
      getOrThrow: (k: string) => {
        const v = config.get(k);
        if (!v) throw new Error(k);
        return v;
      },
    };

    const realtime = {
      disconnectUser: jest.fn((userId: string) => disconnected.push(userId)),
    };

    const service = new AuthService(
      prisma as any,
      jwt,
      config as any,
      { isConfigured: () => false, sendPasswordReset: jest.fn() } as any,
      { createTrialSubscription: jest.fn() } as any,
      { buildForUser: jest.fn(async () => ({})) } as any,
      { getProfile: jest.fn(), wipeUserProgressData: jest.fn() } as any,
      realtime as any,
    );

    return { service, prisma, jwt, tokens, users, passwordResets, deviceTokens, disconnected };
  }

  async function issuePair(service: AuthService) {
    return (service as any).issueTokensForUser('u1', 'a@test.com', Role.USER);
  }

  async function decodeAccess(jwt: JwtService, access: string) {
    return jwt.verifyAsync(access, { secret: accessSecret, algorithms: ['HS256'] });
  }

  it('TEST 1: token sv correcto → payload incluye sv', async () => {
    const { service, jwt, users } = makeService();
    const pair = await issuePair(service);
    const payload: any = await decodeAccess(jwt, pair.accessToken);
    expect(payload.sv).toBe(users.get('u1').securityVersion);
  });

  it('TEST 2: token sv menor que DB → JwtStrategy 401', async () => {
    const { jwt, users } = makeService();
    users.get('u1').securityVersion = 3;
    const stale = await jwt.signAsync(
      { sub: 'u1', email: 'a@test.com', role: Role.USER, sv: 0 },
      { secret: accessSecret, algorithm: 'HS256', expiresIn: '15m' },
    );
    const prisma = {
      user: {
        findFirst: jest.fn(async () => ({
          id: 'u1',
          email: 'a@test.com',
          role: Role.USER,
          securityVersion: 3,
        })),
      },
    };
    const strategy = new JwtStrategy(
      { getOrThrow: () => accessSecret } as any,
      prisma as any,
    );
    const payload = await jwt.verifyAsync(stale, {
      secret: accessSecret,
      algorithms: ['HS256'],
    });
    await expect(strategy.validate(payload as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('TEST 3: token sin sv → JwtStrategy 401 (corte limpio)', async () => {
    const strategy = new JwtStrategy(
      { getOrThrow: () => accessSecret } as any,
      {
        user: {
          findFirst: jest.fn(async () => ({
            id: 'u1',
            email: 'a@test.com',
            role: Role.USER,
            securityVersion: 0,
          })),
        },
      } as any,
    );
    await expect(
      strategy.validate({ sub: 'u1', email: 'a@test.com', role: Role.USER } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('TEST 4: password change incrementa sv y emite sesión nueva', async () => {
    const passwordHash = await hashPassword('oldpass12');
    const { service, users, tokens, jwt, disconnected } = makeService({ passwordHash });
    const before = await issuePair(service);
    const beforeSv = users.get('u1').securityVersion;
    const after = await service.changePassword('u1', 'oldpass12', 'newpass99');
    expect(users.get('u1').securityVersion).toBe(beforeSv + 1);
    const payload: any = await decodeAccess(jwt, after.accessToken);
    expect(payload.sv).toBe(beforeSv + 1);
    // refresh antiguos revocados; el nuevo activo queda
    expect(tokens.filter((t) => !t.revokedAt).length).toBe(1);
    expect(disconnected).toContain('u1');
    void before;
  });

  it('TEST 5: password reset incrementa sv', async () => {
    const { service, users, passwordResets, tokens } = makeService();
    await issuePair(service);
    const raw = 'reset-token-abc';
    passwordResets.push({
      id: randomUUID(),
      userId: 'u1',
      tokenHash: sha256(raw),
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const before = users.get('u1').securityVersion;
    await service.resetPassword(raw, 'brandnew1');
    expect(users.get('u1').securityVersion).toBe(before + 1);
    expect(tokens.every((t) => t.revokedAt != null)).toBe(true);
  });

  it('TEST 6: logout-all incrementa sv + limpia FCM', async () => {
    const { service, users, tokens, deviceTokens, disconnected } = makeService();
    await issuePair(service);
    await issuePair(service);
    const before = users.get('u1').securityVersion;
    await service.logoutAll('u1');
    expect(users.get('u1').securityVersion).toBe(before + 1);
    expect(tokens.every((t) => t.revokedAt != null)).toBe(true);
    expect(deviceTokens).toHaveLength(0);
    expect(disconnected).toContain('u1');
  });

  it('TEST 7: logout individual NO incrementa sv ni cierra otra familia', async () => {
    const { service, users, tokens } = makeService();
    const a = await issuePair(service);
    const b = await issuePair(service);
    const sv = users.get('u1').securityVersion;
    await service.logout(a.refreshToken);
    expect(users.get('u1').securityVersion).toBe(sv);
    const familyA = tokens.find((t) => t.tokenHash === sha256(a.refreshToken)).familyId;
    const familyB = tokens.find((t) => t.tokenHash === sha256(b.refreshToken)).familyId;
    expect(familyA).not.toBe(familyB);
    expect(tokens.filter((t) => t.familyId === familyA).every((t) => t.revokedAt)).toBe(true);
    await expect(service.refresh(b.refreshToken)).resolves.toBeTruthy();
  });

  it('TEST 8/9: dos refresh simultáneos → un solo successor', async () => {
    const { service, tokens } = makeService();
    const first = await issuePair(service);
    const results = await Promise.allSettled([
      service.refresh(first.refreshToken),
      service.refresh(first.refreshToken),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const fail = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(tokens.filter((t) => !t.revokedAt)).toHaveLength(1);
  });

  it('TEST 10: race inmediata no revoca successor', async () => {
    const { service, tokens } = makeService();
    const first = await issuePair(service);
    const second = await service.refresh(first.refreshToken);
    // Re-presentación inmediata de A = race, no theft
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // B sigue válido
    await expect(service.refresh(second.refreshToken)).resolves.toBeTruthy();
    expect(tokens.filter((t) => !t.revokedAt).length).toBe(1);
  });

  it('TEST 11: reuse posterior sospechoso → familia revocada', async () => {
    const { service, tokens } = makeService();
    const first = await issuePair(service);
    const second = await service.refresh(first.refreshToken);
    const old = tokens.find((t) => t.tokenHash === sha256(first.refreshToken));
    old.revokedAt = new Date(Date.now() - 60_000);
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.refresh(second.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('TEST 12: token antiguo nunca vuelve a emitir', async () => {
    const { service, tokens } = makeService();
    const first = await issuePair(service);
    await service.refresh(first.refreshToken);
    const before = tokens.length;
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens.length).toBe(before);
  });

  it('TEST 13: login A+B → families diferentes', async () => {
    const { service, tokens } = makeService();
    const a = await issuePair(service);
    const b = await issuePair(service);
    const fa = tokens.find((t) => t.tokenHash === sha256(a.refreshToken)).familyId;
    const fb = tokens.find((t) => t.tokenHash === sha256(b.refreshToken)).familyId;
    expect(fa).not.toBe(fb);
  });

  it('TEST 15: logout-all invalida access viejos vía sv', async () => {
    const { service, jwt, users } = makeService();
    const a = await issuePair(service);
    const beforeSv = (await decodeAccess(jwt, a.accessToken) as any).sv;
    await service.logoutAll('u1');
    expect(users.get('u1').securityVersion).toBe(beforeSv + 1);
    const strategy = new JwtStrategy(
      { getOrThrow: () => accessSecret } as any,
      {
        user: {
          findFirst: jest.fn(async () => ({
            id: 'u1',
            email: 'a@test.com',
            role: Role.USER,
            securityVersion: users.get('u1').securityVersion,
          })),
        },
      } as any,
    );
    await expect(
      strategy.validate(await decodeAccess(jwt, a.accessToken) as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('TEST 18: access robado falla tras password change', async () => {
    const passwordHash = await hashPassword('oldpass12');
    const { service, jwt, users } = makeService({ passwordHash });
    const stolen = await issuePair(service);
    await service.changePassword('u1', 'oldpass12', 'newpass99');
    const strategy = new JwtStrategy(
      { getOrThrow: () => accessSecret } as any,
      {
        user: {
          findFirst: jest.fn(async () => ({
            id: 'u1',
            email: 'a@test.com',
            role: Role.USER,
            securityVersion: users.get('u1').securityVersion,
          })),
        },
      } as any,
    );
    await expect(
      strategy.validate(await decodeAccess(jwt, stolen.accessToken) as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(stolen.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('TEST 20: access robado falla tras logout-all', async () => {
    const { service, jwt, users } = makeService();
    const stolen = await issuePair(service);
    await service.logoutAll('u1');
    const strategy = new JwtStrategy(
      { getOrThrow: () => accessSecret } as any,
      {
        user: {
          findFirst: jest.fn(async () => ({
            id: 'u1',
            email: 'a@test.com',
            role: Role.USER,
            securityVersion: users.get('u1').securityVersion,
          })),
        },
      } as any,
    );
    await expect(
      strategy.validate(await decodeAccess(jwt, stolen.accessToken) as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('TEST 28/29: hash + rotación normal intactos', async () => {
    const { service, tokens } = makeService();
    const first = await issuePair(service);
    expect(tokens[0].tokenHash).toBe(sha256(first.refreshToken));
    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(tokens.find((t) => t.tokenHash === sha256(first.refreshToken)).replacedById).toBeTruthy();
  });
});
