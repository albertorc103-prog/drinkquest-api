/**
 * Arranque seguro para Render: reparar migraciones fallidas → migrate deploy → seed → API.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(command, args, label, { allowFailure = false } = {}) {
  console.log(`[render-bootstrap] ${label}…`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
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

/** Repara P3009: migración SaaS fallida en el primer deploy (enum + UPDATE en misma tx). */
const FAILED_SAAS_MIGRATIONS = [
  '20250625120000_saas_plans_and_banner',
  '20250625120001_saas_plans_data',
  '20250625120001_saas_plans_enum',
];

for (const name of FAILED_SAAS_MIGRATIONS) {
  run(
    'npx',
    ['prisma', 'migrate', 'resolve', '--rolled-back', name],
    `repair failed migration ${name}`,
    { allowFailure: true },
  );
}

run('npx', ['prisma', 'migrate', 'deploy'], 'prisma migrate deploy');

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

run('node', ['dist/main.js'], 'start API');
