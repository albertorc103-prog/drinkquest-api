#!/bin/sh
set -eu

. /app/scripts/ensure-linux-node-modules.sh

if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
  echo "[dev] Validating migration SQL encoding..."
  node /app/tools/validate-prisma-migrations.mjs
  echo "[dev] Applying migrations..."
  npx prisma migrate deploy
fi

echo "[dev] Starting NestJS with hot reload..."
exec npm run dev
