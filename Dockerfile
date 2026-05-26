# DrinkQuest API — Linux-native deps (bcrypt, Prisma). Never COPY host node_modules.
# Targets: development | runner (production)

FROM node:20-bookworm-slim AS base

WORKDIR /app

# bcrypt (node-gyp) + Prisma OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# ─── Dependencies (Linux npm ci) ───────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json* ./

RUN npm ci \
  && node -e "require('bcrypt'); console.log('[deps] bcrypt native module OK')" \
  && npx prisma version

# ─── Development (hot reload; use with docker-compose.dev.yml + node_modules volume) ─
FROM deps AS development

ENV NODE_ENV=development

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

COPY scripts/docker-entrypoint.dev.sh scripts/docker-entrypoint.sh scripts/docker-migrate.sh scripts/ensure-linux-node-modules.sh /app/scripts/
RUN chmod +x /app/scripts/docker-entrypoint.dev.sh /app/scripts/docker-entrypoint.sh /app/scripts/docker-migrate.sh /app/scripts/ensure-linux-node-modules.sh

EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.dev.sh"]

# ─── Production build ──────────────────────────────────────────────────────────
FROM deps AS builder

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

RUN npm run build \
  && node -e "require('bcrypt'); console.log('[builder] bcrypt OK')" \
  && test -d node_modules/.prisma/client

# ─── Production runtime ────────────────────────────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production

RUN addgroup --system drinkquest && adduser --system --ingroup drinkquest drinkquest

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tools ./tools
COPY scripts/docker-entrypoint.sh scripts/docker-migrate.sh /app/scripts/
RUN chmod +x /app/scripts/docker-entrypoint.sh /app/scripts/docker-migrate.sh \
  && node -e "require('bcrypt'); console.log('[runner] bcrypt OK')" \
  && npx prisma version

USER drinkquest

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
