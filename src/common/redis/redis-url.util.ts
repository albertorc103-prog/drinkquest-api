import type { RedisOptions } from 'ioredis';
import Redis from 'ioredis';

/**
 * Render Redis / Upstash solo soportan DB 0.
 * URLs tipo redis://host:6379/22 provocan ERR Only 0th database is supported.
 */
export function normalizeRedisUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.pathname = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/\d+(?=[?#]|$)/, '');
  }
}

/** Opciones explícitas con db: 0 — no confiar solo en el path de la URL. */
export function redisOptionsFromUrl(rawUrl: string): RedisOptions {
  const parsed = new URL(normalizeRedisUrl(rawUrl));
  const options: RedisOptions = {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    db: 0,
  };
  if (parsed.username) options.username = decodeURIComponent(parsed.username);
  if (parsed.password) options.password = decodeURIComponent(parsed.password);
  if (parsed.protocol === 'rediss:') options.tls = {};
  return options;
}

export function createRedisClient(rawUrl: string): Redis {
  let client: Redis;
  try {
    client = new Redis(redisOptionsFromUrl(rawUrl));
  } catch {
    client = new Redis(normalizeRedisUrl(rawUrl), { db: 0 });
  }
  client.on('error', () => {
    /* evita "Unhandled error event"; health / logs cubren fallos */
  });
  return client;
}
