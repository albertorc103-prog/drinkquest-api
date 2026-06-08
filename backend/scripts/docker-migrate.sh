#!/bin/sh
set -eu

# Dev compose: bind mount + node_modules volume — ensure Linux deps before migrate
if [ -f /app/scripts/ensure-linux-node-modules.sh ]; then
  . /app/scripts/ensure-linux-node-modules.sh
fi

echo "[migrate] Validating Prisma migration SQL encoding..."
node /app/tools/validate-prisma-migrations.mjs

echo "[migrate] Applying Prisma migrations..."
npx prisma migrate deploy

echo "[migrate] Done."
