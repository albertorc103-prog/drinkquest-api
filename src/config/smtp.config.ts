import { registerAs } from '@nestjs/config';

function parseMailEnabled(): boolean {
  const raw = process.env.MAIL_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export default registerAs('smtp', () => ({
  enabled: parseMailEnabled(),
  host: process.env.SMTP_HOST?.trim() || undefined,
  port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER?.trim() || undefined,
  pass: process.env.SMTP_PASS?.trim() || undefined,
  from: process.env.SMTP_FROM?.trim() || 'noreply@drinkquest.com',
}));
