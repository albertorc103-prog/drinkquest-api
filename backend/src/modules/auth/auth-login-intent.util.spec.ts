import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthLoginIntent } from './enums/auth-login-intent.enum';
import { validateLoginIntent } from './auth-login-intent.util';

describe('validateLoginIntent', () => {
  it('allows USER role with USER intent', () => {
    expect(() =>
      validateLoginIntent(Role.USER, AuthLoginIntent.USER, false),
    ).not.toThrow();
  });

  it('allows BAR role with BAR intent when bar exists', () => {
    expect(() =>
      validateLoginIntent(Role.BAR, AuthLoginIntent.BAR, true),
    ).not.toThrow();
  });

  it('allows SUPER_ADMIN with USER and BAR intents', () => {
    expect(() =>
      validateLoginIntent(Role.SUPER_ADMIN, AuthLoginIntent.USER, false),
    ).not.toThrow();
    expect(() =>
      validateLoginIntent(Role.SUPER_ADMIN, AuthLoginIntent.BAR, false),
    ).not.toThrow();
  });

  it('allows ADMIN with USER and BAR intents', () => {
    expect(() =>
      validateLoginIntent(Role.ADMIN, AuthLoginIntent.USER, false),
    ).not.toThrow();
    expect(() =>
      validateLoginIntent(Role.ADMIN, AuthLoginIntent.BAR, false),
    ).not.toThrow();
  });

  it('rejects BAR account on USER intent', () => {
    expect(() => validateLoginIntent(Role.BAR, AuthLoginIntent.USER, true)).toThrow(
      ForbiddenException,
    );
  });

  it('rejects USER account on BAR intent', () => {
    expect(() => validateLoginIntent(Role.USER, AuthLoginIntent.BAR, false)).toThrow(
      ForbiddenException,
    );
  });

  it('rejects BAR account on BAR intent without linked bar', () => {
    expect(() => validateLoginIntent(Role.BAR, AuthLoginIntent.BAR, false)).toThrow(
      ForbiddenException,
    );
  });
});
