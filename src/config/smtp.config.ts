import { registerAs } from '@nestjs/config';

function parseMailEnabled(): boolean {
  const raw = process.env.MAIL_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function authLinkTemplate(envKey: string, fallback: string): string {
  const raw = process.env[envKey]?.trim();
  return raw && raw.includes('{token}') ? raw : fallback;
}

export default registerAs('smtp', () => ({
  enabled: parseMailEnabled(),
  host: process.env.SMTP_HOST?.trim() || undefined,
  port: parseInt(process.env.SMTP_PORT ?? '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER?.trim() || undefined,
  pass: process.env.SMTP_PASS?.trim() || undefined,
  from: process.env.SMTP_FROM?.trim() || 'noreply@drinkquest.com',
  /** Preferido en Render: API HTTPS evita Connection timeout del SMTP. */
  brevoApiKey: process.env.BREVO_API_KEY?.trim() || undefined,
  /** Deep link Android; sustituir {token} al enviar. */
  verifyEmailUrlTemplate: authLinkTemplate(
    'EMAIL_VERIFY_URL',
    'drinkquest://auth/verify?token={token}',
  ),
  resetPasswordUrlTemplate: authLinkTemplate(
    'EMAIL_RESET_URL',
    'drinkquest://auth/reset?token={token}',
  ),
}));
