/**
 * Refuse destructive Prisma commands against Render / production-looking DATABASE_URL.
 * Used by migrate:dev, migrate:reset, smoke:reset.
 *
 * Allow with explicit override (emergency only):
 *   ALLOW_DESTRUCTIVE_DATABASE=1
 */
function safeHostFromDatabaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const normalized = raw.replace(/^postgresql:/i, 'http:').replace(/^postgres:/i, 'http:');
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const url = process.env.DATABASE_URL;
const host = safeHostFromDatabaseUrl(url);

if (process.env.ALLOW_DESTRUCTIVE_DATABASE === '1') {
  console.warn(
    '[guard-nonprod-database] ALLOW_DESTRUCTIVE_DATABASE=1 — skip host guard (dangerous).',
  );
  process.exit(0);
}

if (!host) {
  console.error('[guard-nonprod-database] DATABASE_URL ausente o inválida. Abortando.');
  process.exit(1);
}

const blockedPatterns = [
  /\.render\.com$/i,
  /\.onrender\.com$/i,
  /^dpg-/i, // Render managed Postgres host prefix
];

const blocked = blockedPatterns.some((re) => re.test(host));
if (blocked || process.env.NODE_ENV === 'production') {
  console.error('[guard-nonprod-database] BLOQUEADO: comando destructivo contra host productor.');
  console.error(`[guard-nonprod-database] host=${host}`);
  console.error(
    '[guard-nonprod-database] Usa solo `npx prisma migrate deploy` en Render (vía render:start).',
  );
  console.error(
    '[guard-nonprod-database] Nunca: migrate dev / migrate reset / db push sobre producción.',
  );
  process.exit(1);
}

console.log(`[guard-nonprod-database] OK host=${host}`);
process.exit(0);
