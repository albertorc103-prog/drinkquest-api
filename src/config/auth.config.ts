import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => {
  const sharedSecret = process.env.JWT_SECRET?.trim();
  return {
    accessSecret:
      process.env.JWT_ACCESS_SECRET?.trim() ??
      sharedSecret ??
      'dev_access_secret_change_in_production',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET?.trim() ??
      sharedSecret ??
      'dev_refresh_secret_change_in_production',
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  };
});
