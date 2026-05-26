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

CORS_ORIGINS=https://tu-web.com

REDIS_URL=redis://:password@host:6379

MINIO_ENDPOINT=s3.amazonaws.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ROOT_USER=...
MINIO_ROOT_PASSWORD=...
MINIO_BUCKET=drinkquest
MINIO_PUBLIC_URL=https://tu-bucket.s3.amazonaws.com/drinkquest

MAIL_ENABLED=false
```

**Notas:**

- `PORT` lo asigna Render automáticamente; no hace falta fijarlo manualmente.
- `JWT_SECRET` opcional si defines `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`.
- Apps **Android/iOS** no dependen de CORS; `CORS_ORIGINS` es para clientes web.
- Tras el primer deploy: `npm run seed` solo si la tabla `drinks` está vacía (ejecutar en shell de Render o local contra `DATABASE_URL`).

## 4. Redis y MinIO en Render

Render no incluye Redis/MinIO en el plan gratuito del Web Service:

- **Redis:** [Upstash](https://upstash.com) o Render Key Value → pega `REDIS_URL`.
- **Archivos:** AWS S3 o R2 con variables `MINIO_*` (el SDK es compatible S3).

## 5. Verificar deploy

```bash
curl https://TU-SERVICIO.onrender.com/api/v1/health
```

Respuesta esperada: `{"status":"ok","timestamp":"..."}`

Swagger: `https://TU-SERVICIO.onrender.com/docs`

## 6. App Android

En `local.properties` del proyecto raíz:

```properties
API_BASE_URL=https://TU-SERVICIO.onrender.com/api/v1
```

Quita `API_LAN_HOST` o déjalo vacío. Recompila la app.

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
