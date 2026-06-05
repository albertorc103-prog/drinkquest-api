import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuthForbiddenException } from '../exceptions/auth-forbidden.exception';
import { AuthPermission } from '../permissions/auth-permission.enum';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

function mockContext(user?: { sub: string; role: Role; permissions?: string[] }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('allows when no permissions metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({ sub: '1', role: Role.USER }))).toBe(true);
  });

  it('throws Unauthorized when user missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AuthPermission.MANAGE_USERS]);
    expect(() => guard.canActivate(mockContext())).toThrow(UnauthorizedException);
  });

  it('allows SUPER_ADMIN wildcard', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AuthPermission.MANAGE_SYSTEM]);
    const ok = guard.canActivate(
      mockContext({
        sub: '1',
        role: Role.SUPER_ADMIN,
        permissions: [AuthPermission.ALL],
      }),
    );
    expect(ok).toBe(true);
  });

  it('allows ADMIN with derived permissions from role (legacy JWT)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AuthPermission.MODERATE_CONTENT]);
    const ok = guard.canActivate(
      mockContext({
        sub: '1',
        role: Role.ADMIN,
      }),
    );
    expect(ok).toBe(true);
  });

  it('denies USER without permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AuthPermission.MANAGE_USERS]);
    expect(() =>
      guard.canActivate(mockContext({ sub: '1', role: Role.USER, permissions: [] })),
    ).toThrow(AuthForbiddenException);
  });

  it('denies BAR for admin subscription permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AuthPermission.MANAGE_SUBSCRIPTIONS]);
    expect(() => guard.canActivate(mockContext({ sub: '1', role: Role.BAR }))).toThrow(
      AuthForbiddenException,
    );
  });

  it('requires all listed permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      AuthPermission.MANAGE_USERS,
      AuthPermission.VIEW_ANALYTICS,
    ]);
    expect(() => guard.canActivate(mockContext({ sub: '1', role: Role.ADMIN }))).not.toThrow();
    expect(() => guard.canActivate(mockContext({ sub: '1', role: Role.BAR }))).toThrow(
      AuthForbiddenException,
    );
  });

  it('uses PERMISSIONS_KEY constant', () => {
    expect(PERMISSIONS_KEY).toBe('permissions');
  });
});
