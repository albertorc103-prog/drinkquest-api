# Desarrollo — DrinkQuest API

## 1. Variables de entorno

Copia `.env.example` → `.env`. Obligatorias:

**Correo en local:** deja `MAIL_ENABLED=false` y `SMTP_HOST` vacío. El registro funciona sin SMTP; verás `[MAIL_DISABLED] Verification email skipped` en logs.

- `DATABASE_URL`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (mín. 32 caracteres)
- `REDIS_PASSWORD`
- `MINIO_ROOT_PASSWORD`

## 2. Infraestructura local

### Producción local (imagen Linux, sin node_modules de Windows)

```bash
docker compose up -d --build
```

`.dockerignore` evita copiar `node_modules` del host. `bcrypt` y Prisma se compilan dentro del contenedor.

### Desarrollo en Windows (hot reload + volumen Linux para node_modules)

```bash
npm run docker:dev
```

Monta el código desde Windows pero **`node_modules` vive solo en el volumen `drinkquest_node_modules_linux`** (nunca en bind mount).

Tras cambiar `package.json` / `package-lock.json`:

```bash
docker volume rm drinkquest_node_modules_linux
npm run docker:dev
```

Verificar binarios nativos:

```bash
npm run docker:verify-native
```

### Solo infra (API en host con `npm run dev`)

```bash
docker compose up -d postgres redis minio minio-init
```

## 3. Base de datos

Antes de migrar (obligatorio en Windows/Cursor — evita P3018 por BOM):

```bash
npm run migrate:check
# o auto-corregir LF / quitar BOM:
npm run migrate:fix-encoding
```

```bash
npx prisma migrate dev
npm run seed
```

### Migraciones en Docker

```bash
docker compose up -d postgres redis minio minio-init
docker compose run --rm migrate
docker compose up -d api
```

El servicio `migrate` corre una sola vez (`restart: no`). Si una migración falló por BOM u otro error y la BD quedó sin tablas:

```bash
docker compose run --rm --entrypoint npx migrate prisma migrate resolve --rolled-back 20250525120000_init
docker compose run --rm migrate
```

Los archivos `prisma/migrations/**/migration.sql` deben ser **UTF-8 sin BOM** (ver `tools/validate-prisma-migrations.mjs` y `.gitattributes`).

Admin por defecto: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` del `.env`.

## 4. API

```bash
npm run dev
```

Probar login:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@drinkquest.app","password":"ChangeMeAdmin123!"}'
```

## 5. WebSocket (chat)

Conecta a `ws://localhost:3000/chat` con auth:

```json
{ "token": "<accessToken>" }
```

Eventos: `join_room`, `send_message`, `typing`, `read_message`.

## 6. Android emulador

`API_BASE_URL=http://10.0.2.2:3000/api/v1` en `local.properties`.

## 7. Estructura Clean Architecture

```
src/
  config/          # Configuración tipada
  database/        # PrismaService
  common/          # Guards, Redis, Logger, Health
  modules/         # Dominios (auth, qr, …)
  sockets/         # Gateways Socket.IO
prisma/
  schema.prisma
  seed.ts
```
