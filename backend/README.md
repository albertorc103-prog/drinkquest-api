# DrinkQuest API

Backend enterprise **NestJS 11** + **PostgreSQL** + **Prisma** + **Redis** + **MinIO** + **Socket.IO**.

Sin Firebase ni servicios Google en la capa de datos.

## Requisitos

- Node.js 20+
- Docker & Docker Compose
- (Producción) [Render](docs/RENDER.md), Railway, o VPS con Docker

## Inicio rápido (desarrollo)

```bash
cd backend
cp .env.example .env
# Edita JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

docker compose up -d postgres redis minio minio-init
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```

- API: http://localhost:3000/api/v1/health  
- Swagger: http://localhost:3000/docs  

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Desarrollo con hot-reload |
| `npm run build` / `start:prod` | Producción |
| `npm run render:build` / `render:start` | Build y arranque en [Render](docs/RENDER.md) |
| `npm run migrate` | Migraciones en deploy |
| `npm run seed` | Catálogo, misiones, admin |
| `npm run docker:up` | Infra completa |

## Módulos

- `auth` — JWT, refresh, email, password reset  
- `users` — Perfil, búsqueda, avatar  
- `friends` — Solicitudes, bloqueo  
- `chat` — REST + WebSocket `/chat`  
- `drinks` — Catálogo, favoritos, historial  
- `qr` — Sesiones temporales, canje  
- `bars` — Panel establecimiento  
- `missions` — Progreso y logros  
- `feed` — Publicaciones, likes, trending  
- `admin` — Moderación y analytics  
- `uploads` — Presigned URLs MinIO  

## Roles (RBAC)

`USER` · `BAR` · `ADMIN` · `SUPER_ADMIN`

## Documentación

- [Instalación y desarrollo](./docs/DEVELOPMENT.md)
- [Despliegue VPS Ubuntu](./docs/DEPLOYMENT.md)
- [Migración app Android](./docs/MOBILE_API_MIGRATION.md)

## App móvil

La app en `../app` es **Android Kotlin/Compose** (no Flutter). Ver `docs/MOBILE_API_MIGRATION.md`.
