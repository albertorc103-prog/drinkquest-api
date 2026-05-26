# Producción — VPS Ubuntu

## 1. Servidor

- Ubuntu 22.04 LTS
- 2+ vCPU, 4 GB RAM mínimo
- Puertos: 80, 443, 22 (SSH)

## 2. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

## 3. Clonar y configurar

```bash
git clone <repo> /opt/drinkquest
cd /opt/drinkquest/backend
cp .env.example .env
nano .env   # secrets de producción
```

Producción `.env` (obligatorio):

| Variable | Ejemplo |
|----------|---------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` (o el que asigne el PaaS) |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/drinkquest` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | secretos largos (`openssl rand -base64 64`) |
| `APP_URL` | `https://api.tudominio.com` |
| `API_BASE_URL` | `https://api.tudominio.com/api/v1` |
| `CORS_ORIGINS` | `https://app.tudominio.com` (sin `*`) |
| `MINIO_PUBLIC_URL` | URL pública del bucket/CDN |
| `REDIS_HOST` / `REDIS_URL` | host del servicio Redis |

También: contraseñas fuertes en Postgres, Redis, MinIO; SMTP real si `MAIL_ENABLED=true`.

**Android / clientes:** en `local.properties` usa `API_BASE_URL=https://api.tudominio.com/api/v1` (no IPs locales).

## 4. Levantar stack

```bash
docker compose up -d --build
docker compose run --rm migrate
# Si hubo un fallo previo sin esquema aplicado:
# docker compose run --rm --entrypoint npx migrate prisma migrate resolve --rolled-back <migration_name>
docker compose exec api npm run seed
```

## 5. Nginx reverse proxy (ejemplo)

```nginx
server {
  listen 443 ssl http2;
  server_name api.tudominio.com;

  ssl_certificate     /etc/letsencrypt/live/api.tudominio.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.tudominio.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

Certbot: `sudo certbot --nginx -d api.tudominio.com`

## 6. Backups

- Postgres: `pg_dump` diario
- MinIO: replicación o backup del volumen `minio_data`
- Redis: persistencia AOF activada en compose

## 7. Escalado

- API stateless → varias réplicas detrás de load balancer
- Redis compartido para presencia/chat
- Postgres con connection pooling (PgBouncer)
- MinIO cluster o S3 externo compatible

## 8. Seguridad

- Firewall: solo 80/443 públicos
- No exponer Postgres/Redis/MinIO a internet
- Rotar JWT secrets periódicamente
- Rate limit ya activo (`@nestjs/throttler`)
