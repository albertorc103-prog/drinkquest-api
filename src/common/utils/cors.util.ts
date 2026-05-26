import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** Parsea lista separada por comas de orígenes CORS. */
export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * CORS para REST y Socket.IO.
 *
 * - Producción: lista explícita en CORS_ORIGINS (nunca `*` con credentials).
 *   Peticiones sin cabecera `Origin` (app Android/iOS, curl) se permiten.
 * - Desarrollo: `*` o vacío → cualquier origen (`origin: true`).
 *   DrinkQuest usa Bearer JWT; `credentials: true` queda para cookies futuras.
 */
export function buildCorsOptions(nodeEnv: string, corsOriginsRaw: string): CorsOptions {
  const origins = parseCorsOrigins(corsOriginsRaw);
  const isProduction = nodeEnv === 'production';
  const allowAll = origins.length === 0 || origins.includes('*');

  if (isProduction && allowAll) {
    throw new Error(
      'CORS_ORIGINS must list explicit origins in production (e.g. https://app.example.com). Wildcard * is not allowed.',
    );
  }

  if (!isProduction && allowAll) {
    return {
      origin: true,
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    };
  }

  const allowed = new Set(origins);

  return {
    origin: (origin, callback) => {
      // Apps nativas y herramientas sin Origin no usan CORS del navegador.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  };
}

/** Opciones CORS para Socket.IO (mismo criterio que HTTP). */
export function buildSocketIoCorsOptions(
  nodeEnv: string,
  corsOriginsRaw: string,
): { origin: CorsOptions['origin']; credentials: boolean } {
  const http = buildCorsOptions(nodeEnv, corsOriginsRaw);
  return {
    origin: http.origin,
    credentials: http.credentials ?? true,
  };
}
