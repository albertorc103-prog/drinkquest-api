import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** Orígenes típicos de desarrollo (localhost + emulador Android). */
export const DEFAULT_DEV_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.0.2.2:3000',
] as const;

/** Producción Render (Swagger UI y requests desde el mismo host de la API). */
export const DEFAULT_RENDER_API_ORIGIN = 'https://drinkquest-api.onrender.com';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Parsea lista separada por comas de orígenes CORS. */
export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => stripTrailingSlash(s.trim()))
    .filter(Boolean);
}

/**
 * Combina CORS_ORIGINS con orígenes de dev y la URL pública de la API (Swagger en /docs).
 */
export function mergeCorsOrigins(corsOriginsRaw: string, appPublicUrl?: string): string[] {
  const merged = new Set<string>([
    ...DEFAULT_DEV_CORS_ORIGINS,
    DEFAULT_RENDER_API_ORIGIN,
    ...parseCorsOrigins(corsOriginsRaw),
  ]);
  if (appPublicUrl?.trim()) {
    merged.add(stripTrailingSlash(appPublicUrl.trim()));
  }
  merged.delete('*');
  return [...merged];
}

/**
 * CORS para REST y Socket.IO.
 *
 * - Producción: lista explícita en CORS_ORIGINS (nunca `*` con credentials).
 *   Peticiones sin cabecera `Origin` (app Android/iOS, curl) se permiten.
 * - Desarrollo: `*` o vacío → cualquier origen (`origin: true`).
 *   DrinkQuest usa Bearer JWT; `credentials: true` queda para cookies futuras.
 */
export function buildCorsOptions(
  nodeEnv: string,
  corsOriginsRaw: string,
  appPublicUrl?: string,
): CorsOptions {
  const envOrigins = parseCorsOrigins(corsOriginsRaw);
  const isProduction = nodeEnv === 'production';
  const allowAll = envOrigins.length === 0 && !corsOriginsRaw.trim();

  if (isProduction && allowAll && !appPublicUrl?.trim()) {
    throw new Error(
      'CORS_ORIGINS must list explicit origins in production (e.g. https://app.example.com). Wildcard * is not allowed.',
    );
  }

  if (!isProduction && (allowAll || envOrigins.includes('*'))) {
    return {
      origin: true,
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    };
  }

  const allowed = new Set(mergeCorsOrigins(corsOriginsRaw, appPublicUrl));

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
  appPublicUrl?: string,
): { origin: CorsOptions['origin']; credentials: boolean } {
  const http = buildCorsOptions(nodeEnv, corsOriginsRaw, appPublicUrl);
  return {
    origin: http.origin,
    credentials: http.credentials ?? true,
  };
}
