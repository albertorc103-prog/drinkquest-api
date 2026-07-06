# Desplegar DrinkQuest API en Render

Guía para exponer la API en Internet con URL pública (`https://drinkquest-api.onrender.com`, etc.).

## Requisitos previos

- Cuenta en [Render](https://render.com)
- Repositorio en GitHub/GitLab conectado a Render
- **PostgreSQL** (Render PostgreSQL o externo)
- **Redis** (Render Key Value, Upstash, o Redis Cloud) — chat y presencia
- **Almacenamiento S3** (AWS S3, Cloudflare R2, o MinIO público) — uploads de imágenes

## 1. Crear base de datos PostgreSQL

1. Dashboard → **New +** → **PostgreSQL**
2. Nombre: `drinkquest-db`
3. Copia **Internal Database URL** (para el Web Service en Render) o **External** si la DB está fuera.

## 2. Crear Web Service (Node)

1. **New +** → **Web Service**
2. Conecta el repo y selecciona la carpeta **`backend`** como Root Directory.
3. Configuración:

| Campo | Valor |
|-------|--------|
| **Runtime** | Node |
| **Build Command** | `npm ci && npm run render:build` |
| **Start Command** | `npm run render:start` |
| **Health Check Path** | `/api/v1/health` |

4. **Environment** → añade variables (ver tabla abajo).

## 3. Variables de entorno obligatorias

Sustituye `https://TU-SERVICIO.onrender.com` por la URL real de Render.

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=10000

DATABASE_URL=postgresql://...   # desde Render PostgreSQL

JWT_ACCESS_SECRET=<openssl rand -base64 64>
JWT_REFRESH_SECRET=<openssl rand -base64 64>

APP_URL=https://TU-SERVICIO.onrender.com
API_BASE_URL=https://TU-SERVICIO.onrender.com/api/v1

# Frontend web + (opcional) el propio host de la API para Swagger /docs
CORS_ORIGINS=https://tu-web.com,https://TU-SERVICIO.onrender.com

REDIS_URL=redis://:password@host:6379

MINIO_ENDPOINT=s3.amazonaws.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ROOT_USER=...
MINIO_ROOT_PASSWORD=...
MINIO_BUCKET=drinkquest
MINIO_PUBLIC_URL=https://tu-bucket.s3.amazonaws.com/drinkquest

MAIL_ENABLED=false

# Opcional: admin creado automáticamente en cada deploy (seed idempotente)
SEED_ADMIN_EMAIL=admin@drinkquest.app
SEED_ADMIN_PASSWORD=<tu-contraseña-segura>
# Solo para UN deploy: fuerza actualizar la contraseña del admin si ya existía
# SEED_ADMIN_RESET_PASSWORD=true
```

**Notas:**

- `PORT` lo asigna Render automáticamente; no hace falta fijarlo manualmente.
- `JWT_SECRET` opcional si defines `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`.
- Apps **Android/iOS** no dependen de CORS; `CORS_ORIGINS` es para clientes web.
- Define `APP_URL=https://TU-SERVICIO.onrender.com`: el backend también permite ese origen (Swagger en `/docs`) además de los hosts de dev y `https://drinkquest-api.onrender.com`.
- **Seed automático en cada deploy** (plan Free sin Shell): `render:start` ejecuta `prisma migrate deploy` + seed idempotente antes de levantar la API. No hace falta shell manual.
- Admin por defecto (creado/actualizado en seed): `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (defaults `admin@drinkquest.app` / `ChangeMeAdmin123!`).
- Bebidas demo solo se insertan si la tabla `drinks` está vacía.
- Para omitir seed en un arranque: `SKIP_DB_SEED=1`.

## 4. Redis y MinIO en Render

Render no incluye Redis/MinIO en el plan gratuito del Web Service:

- **Redis:** [Upstash](https://upstash.com) o Render Key Value → pega `REDIS_URL`.
- **Archivos:** AWS S3 o Cloudflare R2 con variables `MINIO_*` (el SDK es compatible S3).

**Guía detallada paso a paso:** [PRODUCTION_INFRA.md](./PRODUCTION_INFRA.md) (R2, Upstash, Brevo SMTP, checklist Render).

## 5. Verificar deploy

```bash
curl https://TU-SERVICIO.onrender.com/api/v1/health
```

Respuesta esperada: `{"status":"ok","timestamp":"..."}`

Swagger: `https://TU-SERVICIO.onrender.com/docs`

## 6. App Android (opción Render / producción)

En `local.properties` del proyecto raíz (ya configurado si usas `drinkquest-api.onrender.com`):

```properties
API_BASE_URL_DEV=https\://drinkquest-api.onrender.com/api/v1
API_BASE_URL_PROD=https\://drinkquest-api.onrender.com/api/v1
```

Recompila la app (**Build → Rebuild Project**). En login elige **Admin** e inicia con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

### Restablecer contraseña del admin en Render

Si ves **«Credenciales incorrectas»** con `ChangeMeAdmin123!`, la API de producción tiene **otra** contraseña (el seed no la cambia en deploys normales).

1. Render Dashboard → servicio **drinkquest-api** → **Environment**.
2. Define o actualiza:
   - `SEED_ADMIN_EMAIL` = `admin@drinkquest.app`
   - `SEED_ADMIN_PASSWORD` = la contraseña que quieras usar en la app (ej. una segura que recuerdes)
   - `SEED_ADMIN_RESET_PASSWORD` = `true` (**solo para el próximo deploy**)
3. **Manual Deploy** (o push a la rama conectada).
4. Cuando el deploy termine, **borra** `SEED_ADMIN_RESET_PASSWORD` del entorno y vuelve a desplegar (evita resetear la clave en cada arranque).
5. En la app: chip **Admin**, mismo correo y la contraseña del paso 2.

Verifica el login con Swagger o curl:

```bash
curl -X POST https://drinkquest-api.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@drinkquest.app\",\"password\":\"TU_PASSWORD\",\"intent\":\"USER\"}"
```

Debe devolver `accessToken`, no `401`.

La respuesta debe incluir `user.role` = `SUPER_ADMIN` y `user.isAdmin` = `true`. Si `role` es `USER`, el seed no ha corrido o la cuenta no es la de admin.

### App Android: «no tiene acceso al panel administrativo»

La app exige `UserRole.ADMIN` tras login (modo Admin). Eso se deriva de:

- `user.isAdmin === true` en la respuesta de login, o
- `user.role` ∈ `ADMIN`, `SUPER_ADMIN`

Tras desplegar backend + recompilar la app, inicia sesión con chip **Admin**.

| Variable Render | Mantener |
|-----------------|----------|
| `SEED_ADMIN_EMAIL` | `admin@drinkquest.app` |
| `SEED_ADMIN_PASSWORD` | Tu contraseña (ej. `ChangeMeAdmin123!`) |
| `SEED_ADMIN_RESET_PASSWORD` | Solo `true` un deploy si cambias contraseña; luego quitar |
| `SKIP_DB_SEED` | No definir (o `0`) para que el seed corra |

**Desplegar:** carpeta `backend/` (Web Service). **App:** recompilar APK con el fix de `ApiAuthRepository` (mapeo `SUPER_ADMIN`).

## 7. Blueprint (opcional)

En la raíz del repo puedes usar `backend/render.yaml` con **New Blueprint** en Render para provisionar DB + Web Service.

## Scripts npm usados en Render

| Script | Acción |
|--------|--------|
| `render:build` | Valida migraciones, `prisma generate`, `nest build` |
| `render:start` | `prisma migrate deploy` + `node dist/main.js` |
| `start` | Solo `node dist/main.js` (sin migraciones) |

## Solución de problemas

| Síntoma | Causa probable |
|---------|----------------|
| Deploy falla en build | Revisa logs; ejecuta `npm run render:build` en local |
| 502 / timeout al arrancar | DB/Redis inalcanzables; revisa `DATABASE_URL` / `REDIS_URL` |
| CORS en navegador | Añade tu dominio web a `CORS_ORIGINS` |
| App móvil no conecta | Usa `API_BASE_URL` HTTPS público, no `10.x` ni `localhost` |
