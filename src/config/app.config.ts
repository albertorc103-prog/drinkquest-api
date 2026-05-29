import { registerAs } from '@nestjs/config';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function resolvePort(): number {
  const raw = process.env.PORT ?? process.env.API_PORT ?? '3000';
  const port = parseInt(raw, 10);
  return Number.isFinite(port) && port > 0 ? port : 3000;
}

/** Render/Docker requieren 0.0.0.0; en local puedes usar HOST=127.0.0.1 */
function resolveHost(nodeEnv: string): string {
  const explicit = process.env.HOST?.trim();
  if (explicit) return explicit;
  if (nodeEnv === 'production') return '0.0.0.0';
  return '0.0.0.0';
}

function resolveAppUrl(prefix: string): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);

  const apiBase = process.env.API_BASE_URL?.trim();
  if (apiBase) {
    const withoutPrefix = apiBase.replace(/\/?api\/v1\/?$/i, '');
    return stripTrailingSlash(withoutPrefix || apiBase);
  }

  return 'http://localhost:3000';
}

function resolveApiBaseUrl(appUrl: string, prefix: string): string {
  const explicit = process.env.API_BASE_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);
  return `${appUrl}/${prefix}`;
}

export default registerAs('app', () => {
  const prefix = process.env.API_PREFIX ?? 'api/v1';
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const url = resolveAppUrl(prefix);
  const apiBaseUrl = resolveApiBaseUrl(url, prefix);

  return {
    name: process.env.APP_NAME ?? 'DrinkQuest API',
    /** URL pública del servidor (emails, enlaces). */
    url,
    /** URL base para clientes móviles/web: incluye prefijo /api/v1 */
    apiBaseUrl,
    port: resolvePort(),
    host: resolveHost(nodeEnv),
    /** Full API path prefix including version (e.g. api/v1). Not combined with Nest URI versioning. */
    prefix,
    corsOrigins: process.env.CORS_ORIGINS ?? '',
    /** Detrás de Cloudflare/Render: true o número de saltos proxy. */
    trustProxy:
      process.env.TRUST_PROXY === 'true' ||
      process.env.TRUST_PROXY === '1' ||
      nodeEnv === 'production',
    nodeEnv,
    qrSessionTtlMinutes: parseInt(process.env.QR_SESSION_TTL_MINUTES ?? '10', 10),
  };
});
