/**
 * Arranque seguro para Render:
 *   preflight Medallas v2 (READ-ONLY)
 *   → prisma migrate deploy
 *   → postcheck Medallas v2 (READ-ONLY)
 *   → seed
 *   → API
 *
 * Usa process.env.DATABASE_URL (Internal de drinkquest-db). Nunca imprime secretos.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(command, args, label, { allowFailure = false, env } = {}) {
  console.log(`[render-bootstrap] ${label}…`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (result.status !== 0) {
    if (allowFailure) {
      console.warn(
        `[render-bootstrap] ${label} finished with exit ${result.status ?? 'unknown'} (continuing)`,
      );
      return false;
    }
    console.error(`[render-bootstrap] ${label} failed (exit ${result.status ?? 'unknown'})`);
    process.exit(result.status ?? 1);
  }
  return true;
}

/** Repara P3009 solo si RENDER_BOOTSTRAP_REPAIR_SAAS=1 (primer deploy con migración fallida). */
const FAILED_SAAS_MIGRATIONS = [
  '20250625120000_saas_plans_and_banner',
  '20250625120002_saas_plans_data',
  '20250625120001_saas_plans_enum',
];

if (process.env.RENDER_BOOTSTRAP_REPAIR_SAAS === '1') {
  for (const name of FAILED_SAAS_MIGRATIONS) {
    run(
      'npx',
      ['prisma', 'migrate', 'resolve', '--rolled-back', name],
      `repair failed migration ${name}`,
      { allowFailure: true },
    );
  }
}

const skipMedalChecks = process.env.SKIP_BAR_MEDAL_DB_CHECKS === '1';

if (skipMedalChecks) {
  console.warn('[render-bootstrap] SKIP_BAR_MEDAL_DB_CHECKS=1 — preflight/postcheck omitidos');
} else {
  run(
    'node',
    ['tools/bar-medal-db-check.mjs'],
    'bar-medals PREFLIGHT (READ-ONLY)',
    { env: { BAR_MEDAL_CHECK_MODE: 'preflight' } },
  );
}

run('npx', ['prisma', 'migrate', 'deploy'], 'prisma migrate deploy');

if (!skipMedalChecks) {
  run(
    'node',
    ['tools/bar-medal-db-check.mjs'],
    'bar-medals POSTCHECK (READ-ONLY)',
    { env: { BAR_MEDAL_CHECK_MODE: 'postcheck' } },
  );
}

if (process.env.SKIP_DB_SEED === '1') {
  console.log('[render-bootstrap] SKIP_DB_SEED=1 — seed omitido');
} else {
  const compiledSeed = join(process.cwd(), 'dist-seed', 'prisma', 'seed.js');
  if (existsSync(compiledSeed)) {
    run('node', [compiledSeed], 'database seed (compiled)');
  } else {
    run('npx', ['prisma', 'db', 'seed'], 'database seed (prisma db seed)');
  }
}

if (process.env.SKIP_CATALOG_SYNC === '1') {
  console.log('[render-bootstrap] SKIP_CATALOG_SYNC=1 — sync de catálogo omitido');
} else {
  const compiledSync = join(
    process.cwd(),
    'dist-seed',
    'prisma',
    'sync-canonical-catalog.js',
  );
  if (existsSync(compiledSync)) {
    run('node', [compiledSync], 'catalog sync (compiled)', { allowFailure: true });
  } else {
    run(
      'npx',
      ['ts-node', '-r', 'tsconfig-paths/register', 'prisma/sync-canonical-catalog.ts'],
      'catalog sync (ts-node)',
      { allowFailure: true },
    );
  }
}

run('node', ['dist/main.js'], 'start API');
