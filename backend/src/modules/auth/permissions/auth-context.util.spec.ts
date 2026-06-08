import { Role } from '@prisma/client';
import { AccountType } from './account-type.enum';
import { AuthPermission } from './auth-permission.enum';
import {
  enrichJwtAuthClaims,
  getEffectivePermissions,
  getPermissionsForRole,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isAdmin,
  isBar,
  isCustomer,
  resolveAccountType,
} from './auth-context.util';

describe('auth-context.util', () => {
  it('maps roles to account types', () => {
    expect(resolveAccountType(Role.USER)).toBe(AccountType.USER);
    expect(resolveAccountType(Role.BAR)).toBe(AccountType.BAR);
    expect(resolveAccountType(Role.ADMIN)).toBe(AccountType.ADMIN);
    expect(resolveAccountType(Role.SUPER_ADMIN)).toBe(AccountType.ADMIN);
  });

  it('assigns permissions by role', () => {
    expect(getPermissionsForRole(Role.SUPER_ADMIN)).toEqual([AuthPermission.ALL]);
    expect(getPermissionsForRole(Role.USER)).toEqual([]);
    expect(getPermissionsForRole(Role.BAR)).toContain(AuthPermission.MANAGE_BAR);
  });

  it('enriches legacy jwt claims from role', () => {
    const ctx = enrichJwtAuthClaims(Role.SUPER_ADMIN, {});
    expect(ctx.isAdmin).toBe(true);
    expect(ctx.permissions).toContain(AuthPermission.ALL);
  });

  it('helpers classify subjects', () => {
    expect(isAdmin({ role: Role.ADMIN })).toBe(true);
    expect(isBar({ role: Role.BAR })).toBe(true);
    expect(isCustomer({ role: Role.USER })).toBe(true);
    expect(hasPermission({ role: Role.ADMIN }, AuthPermission.MODERATE_CONTENT)).toBe(true);
  });

  it('rehydrates legacy empty permissions from role', () => {
    expect(getEffectivePermissions({ role: Role.ADMIN, permissions: [] })).toContain(
      AuthPermission.MANAGE_USERS,
    );
    expect(hasPermission({ role: Role.ADMIN, permissions: [] }, AuthPermission.VIEW_ANALYTICS)).toBe(
      true,
    );
  });

  it('hasAny and hasAll work', () => {
    const admin = { role: Role.ADMIN };
    expect(
      hasAnyPermission(admin, [AuthPermission.MANAGE_SYSTEM, AuthPermission.MODERATE_CONTENT]),
    ).toBe(true);
    expect(
      hasAllPermissions(admin, [AuthPermission.MODERATE_CONTENT, AuthPermission.MANAGE_USERS]),
    ).toBe(true);
    expect(hasAllPermissions(admin, [AuthPermission.MANAGE_SYSTEM])).toBe(false);
    expect(hasAnyPermission({ role: Role.USER }, [AuthPermission.MANAGE_USERS])).toBe(false);
  });

  it('SUPER_ADMIN wildcard bypasses any check', () => {
    expect(hasPermission({ role: Role.SUPER_ADMIN }, AuthPermission.MANAGE_SYSTEM)).toBe(true);
  });
});
