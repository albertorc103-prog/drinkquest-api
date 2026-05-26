#!/bin/sh
set -eu

if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
  echo "[entrypoint] Validating Prisma migration SQL encoding..."
  node /app/tools/validate-prisma-migrations.mjs

  echo "[entrypoint] Applying Prisma migrations..."
  if ! npx prisma migrate deploy; then
    echo "[entrypoint] ERROR: prisma migrate deploy failed. Container will exit (no API start)." >&2
    exit 1
  fi
  echo "[entrypoint] Migrations OK."
else
  echo "[entrypoint] SKIP_MIGRATE=1 — migrations handled by migrate service."
fi

echo "[entrypoint] Starting API..."
exec node dist/main.js
