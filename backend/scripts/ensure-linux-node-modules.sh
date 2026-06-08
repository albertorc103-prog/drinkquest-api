#!/bin/sh
# Sources Linux node_modules into /app/node_modules (Docker volume). Safe on production images (no-op if deps exist).

NODE_MODULES_DIR="/app/node_modules"
MARKER="${NODE_MODULES_DIR}/.linux-native-deps"
LOCK_FILE="${NODE_MODULES_DIR}/.package-lock.sha256"

_lock_hash() {
  if [ -f /app/package-lock.json ]; then
    sha256sum /app/package-lock.json | awk '{print $1}'
  else
    echo "no-lockfile"
  fi
}

# Production image: bcrypt already validated at build time
if [ -f "${NODE_MODULES_DIR}/bcrypt/package.json" ] && node -e "require('bcrypt')" 2>/dev/null; then
  return 0 2>/dev/null || exit 0
fi

CURRENT_HASH="$(_lock_hash)"
STORED_HASH="$(cat "${LOCK_FILE}" 2>/dev/null || true)"

if [ -f "${MARKER}" ] && [ "${CURRENT_HASH}" = "${STORED_HASH}" ]; then
  node -e "require('bcrypt')" 2>/dev/null && return 0 2>/dev/null || exit 0
fi

echo "[deps] Installing Linux native modules (npm ci) — never use host node_modules..."
npm ci
npx prisma generate
_lock_hash > "${LOCK_FILE}"
touch "${MARKER}"
node -e "require('bcrypt'); console.log('[deps] bcrypt OK')"
npx prisma version
