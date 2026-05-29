/**
 * Arranque seguro para Render: migrate deploy → seed idempotente → API.
 * El seed compilado (dist-seed) evita depender de ts-node en runtime (plan Free sin shell).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(command, args, label) {
  console.log(`[render-bootstrap] ${label}…`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`[render-bootstrap] ${label} failed (exit ${result.status ?? 'unknown'})`);
    process.exit(result.status ?? 1);
  }
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
