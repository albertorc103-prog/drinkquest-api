# Deploy productivo DrinkQuest (Render)

DrinkQuest valida funcionalmente en **Render Producción + PostgreSQL Render**.
No uses PostgreSQL local, Docker DB, `migrate dev`, `migrate reset` ni `db push` contra producción.

## Estados de cierre (no mezclar)

| Estado | Significado |
|--------|-------------|
| **CODE_READY** | Código y migraciones en repo; listos para desplegar |
| **PREFLIGHT_PASS** | `prod:preflight:bar-medals` PASS contra DB Render (READ-ONLY) |
| **MIGRATIONS_APPLIED** | `prisma migrate deploy` exitoso en el arranque Render |
| **PRODUCTION_VALIDATED** | Smoke QA (health, roles, medalla QA, regresiones) OK |

## Pipeline Render actual

Definido en `render.yaml` / Dashboard:

| Fase | Comando |
|------|---------|
| **Build** | `npm ci && npm run render:build` |
| **Start** | `npm run render:start` → `scripts/render-bootstrap.mjs` |

`render:build` hace:

1. `migrate:check` (encoding SQL)
2. `prisma generate`
3. `nest build`
4. `build:seed`

`render:start` (`render-bootstrap.mjs`) hace:

1. `npx prisma migrate deploy` (**único** comando de migración en prod)
2. seed idempotente (salvo `SKIP_DB_SEED=1`)
3. sync de catálogo (salvo `SKIP_CATALOG_SYNC=1`)
4. `node dist/main.js`

Si `migrate deploy` falla, el bootstrap **sale con error** y la API **no** arranca.

Healthcheck: `GET /api/v1/health`

## DATABASE_URL

- Origen: Render PostgreSQL → property `connectionString` (Internal para el Web Service).
- Para preflight desde tu máquina: usa la **External Database URL** del Dashboard.
- Variable: `DATABASE_URL` (no hardcodear host/puerto).
- No hay `DIRECT_URL` obligatorio en este proyecto.

Nunca commits de connection strings / passwords.

## Preflight / postcheck Medallas v2 (en Render)

Se ejecutan automáticamente en `render:start` (`scripts/render-bootstrap.mjs`):

1. **PREFLIGHT** READ-ONLY (`BAR_MEDAL_CHECK_MODE=preflight`)
2. `npx prisma migrate deploy`
3. **POSTCHECK** READ-ONLY (`BAR_MEDAL_CHECK_MODE=postcheck`)
4. seed + API

Usan `process.env.DATABASE_URL` **interna** de Render (`drinkquest-db`).
No requiere External Database URL ni PostgreSQL local.

Omitir solo en emergencia: `SKIP_BAR_MEDAL_DB_CHECKS=1`.

Manual (solo tiene sentido dentro de un shell/job con la misma `DATABASE_URL` de Render):

```bash
npm run prod:preflight:bar-medals
npm run prod:postcheck:bar-medals
```

## Checklist deploy Medallas v2

1. Push a la rama conectada a `drinkquest-api` (o Manual Deploy)
2. Logs: preflight PASS → migrate deploy PASS → postcheck PASS → start API
3. `curl https://drinkquest-api.onrender.com/api/v1/health`
4. Smoke USER/BAR/ADMIN + endpoints medallas
5. Human QA en dispositivos → `HUMAN_QA_PENDING` / `COMPLETED`

## Comandos prohibidos en producción

| Prohibido | Motivo |
|-----------|--------|
| `prisma migrate dev` | Reescribe historial / no es deploy |
| `prisma migrate reset` | Borra datos |
| `prisma db push` | Sin historial de migraciones |
| `DROP` / `TRUNCATE` / `DELETE` masivo | Destructivo |

Guardas npm: `migrate:dev`, `migrate:reset` y `smoke:reset` ejecutan `tools/guard-nonprod-database.mjs` y **abortan** si `DATABASE_URL` apunta a Render (`*.render.com` / `dpg-*`) o `NODE_ENV=production`.

Override de emergencia (no usar en operación normal): `ALLOW_DESTRUCTIVE_DATABASE=1`.

## Rollback

### Código

Render → Deploy anterior (redeploy de commit previo).

### Base de datos

Las migraciones Prisma son **forward-only**. No hay DOWN automático.

Si el schema falla tras un migrate parcial:

1. No `migrate reset`
2. Diagnosticar migración exacta en logs
3. Crear **nueva** migración correctiva
4. Volver a desplegar

## Variables nuevas Medallas v2

Ninguna variable de entorno nueva obligatoria.
Usa el stack existente (`DATABASE_URL`, JWT, Redis, FCM, etc.).

Opcionales ya documentadas: `SKIP_DB_SEED`, `SKIP_CATALOG_SYNC`, `RENDER_BOOTSTRAP_REPAIR_SAAS`.

## Android

Por defecto apunta a `https://drinkquest-api.onrender.com/api/v1` (`app/build.gradle.kts`).
No configurar localhost / `10.0.2.2` para validar Medallas v2.

## Referencias

- `docs/RENDER.md` — setup general Render
- `docs/PRODUCTION_INFRA.md` — Redis / R2 / SMTP
- Migraciones medal: `prisma/migrations/2026100612*` … `2026100616*`
