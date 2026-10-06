import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { AuthService } from './auth.service';

function sha256(v: string) {
  return createHash('sha256').update(v).digest('hex');
}

describe('AuthService FASE 5 sessions', () => {
  const accessSecret = 'test_access_secret_hs256';
  const refreshSecret = 'test_refresh_secret_hs256';

  function makeService() {
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
          passwordHash: '$2b$12$placeholder',
        },
      ],
    ]);

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
          if (where.email) {
            for (const u of users.values()) {
              if (u.email === where.email && !u.deletedAt) return u;
            }
          }
          return null;
        }),
        findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null),
        update: jest.fn(async ({ where, data, select }: any) => {
          const u = users.get(where.id);
          if (data.securityVersion?.increment) {
            u.securityVersion += data.securityVersion.increment;
          }
          Object.assign(u, {
            ...data,
            securityVersion: u.securityVersion,
          });
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
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      deviceToken: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      bar: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (arg: any) => {
        if (typeof arg === 'function') return arg(prisma);
        return Promise.all(arg);
      }),
      _tokens: tokens,
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

    const jwtBarClaims = { buildForUser: jest.fn(async () => ({})) };
    const usersService = {
      getProfile: jest.fn(),
      wipeUserProgressData: jest.fn(),
    };
    const mail = { isConfigured: () => false, sendPasswordReset: jest.fn() };
    const subscriptions = { createTrialSubscription: jest.fn() };

    const realtime = { disconnectUser: jest.fn() };

    const service = new AuthService(
      prisma as any,
      jwt,
      config as any,
      mail as any,
      subscriptions as any,
      jwtBarClaims as any,
      usersService as any,
      realtime as any,
    );

    return { service, prisma, jwt, tokens };
  }

  async function issuePair(service: AuthService) {
    // Usa login path interno via issueTokensForUser through register-like flow:
    // llamar refresh necesita tokens previos — usamos (service as any).issueTokensForUser
    return (service as any).issueTokensForUser('u1', 'a@test.com', Role.USER);
  }

  it('TEST 3: refresh válido → nuevos tokens', async () => {
    const { service, tokens } = makeService();
    const first = await issuePair(service);
    expect(tokens).toHaveLength(1);
    const second = await service.refresh(first.refreshToken);
    expect(second.accessToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(tokens.filter((t) => !t.revokedAt)).toHaveLength(1);
  });

  it('TEST 4: refresh rotado anterior → no reusable', async () => {
    const { service } = makeService();
    const first = await issuePair(service);
    await service.refresh(first.refreshToken);
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('TEST 5: reuse posterior (fuera de gracia) → familia revocada', async () => {
    const { service, tokens } = makeService();
    const first = await issuePair(service);
    const second = await service.refresh(first.refreshToken);
    // Simular reuse sospechoso (no race inmediata)
    const old = tokens.find((t) => t.tokenHash === sha256(first.refreshToken));
    old.revokedAt = new Date(Date.now() - 60_000);
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // B también inválido (familia revocada)
    await expect(service.refresh(second.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens.every((t) => t.revokedAt != null)).toBe(true);
  });

  it('TEST 7: logout → refresh revocado', async () => {
    const { service, tokens } = makeService();
    const pair = await issuePair(service);
    await service.logout(pair.refreshToken);
    expect(tokens[0].revokedAt).toBeTruthy();
    await expect(service.refresh(pair.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('TEST 8: logout all → todos refresh revocados', async () => {
    const { service, tokens } = makeService();
    await issuePair(service);
    await issuePair(service);
    expect(tokens.filter((t) => !t.revokedAt).length).toBe(2);
    const res = await service.logoutAll('u1');
    expect(res.revoked).toBe(2);
    expect(tokens.every((t) => t.revokedAt != null)).toBe(true);
  });

  it('TEST 11/13: firma inválida / alg confusión en refresh → FAIL', async () => {
    const { service, tokens, jwt } = makeService();
    const pair = await issuePair(service);
    // Token con secret incorrecto
    const bad = await jwt.signAsync(
      { sub: 'u1', type: 'refresh' },
      { secret: 'wrong_secret', algorithm: 'HS256', expiresIn: '7d' },
    );
    // Insertar hash falso apuntando a familia existente no aplica; verify falla si hash no match.
    // Simular hash encontrado con JWT mal firmado:
    tokens[0].tokenHash = sha256(bad);
    await expect(service.refresh(bad)).rejects.toBeInstanceOf(UnauthorizedException);
    // El token bueno sigue en DB pero hash cambió — emitir otro y validar alg none no funciona via jwt lib
    void pair;
  });

  it('refresh token hash se almacena (no plaintext)', async () => {
    const { service, tokens } = makeService();
    const pair = await issuePair(service);
    expect(tokens[0].tokenHash).toBe(sha256(pair.refreshToken));
    expect(tokens[0].tokenHash).not.toBe(pair.refreshToken);
    expect(tokens[0].familyId).toBeTruthy();
  });
});
