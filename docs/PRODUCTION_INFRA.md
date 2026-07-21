# Infraestructura de producción — Storage, Email, Redis

Guía paso a paso para configurar los tres servicios externos que DrinkQuest API necesita en Render.

**Verifica el estado** tras configurar:

```bash
curl https://drinkquest-api.onrender.com/api/v1/health
```

Respuesta esperada con todo OK:

```json
{
  "status": "ok",
  "services": {
    "database": "ok",
    "storage": "ok",
    "redis": "ok",
    "mail": "ok",
    ...
  }
}
```

Si falta algún servicio verás `"status": "degraded"` y el campo correspondiente en `degraded`.

---

## Resumen de variables en Render

| Servicio | Variables |
|----------|-----------|
| **Redis** | `REDIS_URL` |
| **Storage (R2)** | `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_REGION`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET`, `MINIO_PUBLIC_URL` |
| **Email** | `MAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `EMAIL_VERIFY_URL`, `EMAIL_RESET_URL` |

---

## 1. Redis — Upstash (recomendado, gratis)

Usado para presencia online en chat WebSocket.

### Crear instancia

1. [console.upstash.com](https://console.upstash.com) → **Create Database**
2. Región: elige la más cercana (ej. `us-east-1` o `sa-east-1` si disponible)
3. Tipo: **Regional** (free tier)
4. Copia la **Redis URL** (formato `rediss://default:TOKEN@HOST:6379`)

### Pegar en Render

Render Dashboard → **drinkquest-api** → **Environment**:

```
REDIS_URL=rediss://default:TU_TOKEN@TU_HOST.upstash.io:6379
```

> El backend normaliza automáticamente el índice de DB a `0` (Render/Upstash no soportan DB 22).

### Alternativa: Render Key Value

1. Render Dashboard → **New +** → **Key Value**
2. Copia **Internal Redis URL** o **External** según dónde esté la API
3. Pégala como `REDIS_URL`

---

## 2. Storage — Cloudflare R2 (recomendado)

Avatares, logos de bar, fotos de promociones y feed. Compatible con el SDK S3 del backend.

### Crear bucket

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage**
2. **Create bucket** → nombre: `drinkquest`
3. **Settings** → **Public access** → habilitar **R2.dev subdomain** (o dominio custom)
4. Copia la URL pública, ej: `https://pub-abc123.r2.dev`

### API tokens

1. R2 → **Manage R2 API Tokens** → **Create API Token**
2. Permisos: **Object Read & Write** en el bucket `drinkquest`
3. Anota **Access Key ID** y **Secret Access Key**
4. Anota el **Endpoint S3**, ej: `https://ACCOUNT_ID.r2.cloudflarestorage.com`

### Variables en Render

```
MINIO_ENDPOINT=ACCOUNT_ID.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_REGION=auto
MINIO_ROOT_USER=<Access Key ID>
MINIO_ROOT_PASSWORD=<Secret Access Key>
MINIO_BUCKET=drinkquest
MINIO_PUBLIC_URL=https://pub-abc123.r2.dev
```

> **MINIO_PUBLIC_URL**: usa la URL pública R2.dev **sin** `/drinkquest` al final (el código detecta R2 automáticamente).

### Probar uploads

Tras redeploy, sube un avatar desde la app o:

```bash
curl -X POST https://drinkquest-api.onrender.com/api/v1/uploads/direct \
  -H "Authorization: Bearer TU_TOKEN" \
  -F "file=@foto.jpg"
```

Debe devolver una URL `https://pub-....r2.dev/avatars/...`.

### Alternativa: AWS S3

```
MINIO_ENDPOINT=s3.amazonaws.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_REGION=us-east-1
MINIO_ROOT_USER=AKIA...
MINIO_ROOT_PASSWORD=...
MINIO_BUCKET=drinkquest
MINIO_PUBLIC_URL=https://drinkquest.s3.amazonaws.com/drinkquest
```

Bucket con acceso público de lectura o CloudFront delante.

---

## 3. Email — Brevo (recomendado, gratis 300/día)

Verificación de email y recuperación de contraseña. Los enlaces abren la **app Android** vía deep link.

### Crear cuenta SMTP

1. [app.brevo.com](https://app.brevo.com) → registro gratis
2. **Settings** → **SMTP & API** → **SMTP**
3. Anota servidor, puerto, login y contraseña SMTP
4. **Senders** → verifica un remitente (ej. `noreply@tudominio.com`)

### Variables en Render

Render a menudo **bloquea o timeout SMTP** (puerto 587) → en logs verás `Connection timeout`.
Usa la **API HTTP de Brevo** (recomendado):

1. Brevo → **Settings** → **SMTP & API** → **API keys** → Create a key  
2. En Render añade:

```
MAIL_ENABLED=true
BREVO_API_KEY=xkeysib-...
SMTP_FROM=tu-remitente-verificado@gmail.com
EMAIL_VERIFY_URL=drinkquest://auth/verify?token={token}
EMAIL_RESET_URL=drinkquest://auth/reset?token={token}
```

SMTP opcional (puede seguir fallando en Render free):

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-login-de-brevo@gmail.com
SMTP_PASS=xsmtpsib-...
```

> Mantén `{token}` literal — el backend lo sustituye al enviar.
> `SMTP_FROM` debe ser un **sender verificado** en Brevo.

### Alternativa: Resend

```
MAIL_ENABLED=true
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=re_...
SMTP_FROM=onboarding@resend.dev
```

(Dominio verificado en Resend para producción.)

### Probar email

1. Registra un usuario nuevo en la app con email real
2. Revisa bandeja (y spam)
3. El enlace debe ser `drinkquest://auth/verify?token=...` y abrir la app

---

## 4. Checklist Render (orden sugerido)

- [ ] **Redis**: `REDIS_URL` → health `redis: ok`
- [ ] **R2**: 8 vars `MINIO_*` → health `storage: ok`
- [ ] **SMTP**: `MAIL_ENABLED=true` + credenciales → health `mail: ok`
- [ ] **Save Changes** → esperar redeploy
- [ ] `curl .../health` → `"status": "ok"`
- [ ] Probar upload de imagen
- [ ] Probar registro con email

---

## 5. Costes orientativos (MXN aprox.)

| Servicio | Free tier | Cuando pagar |
|----------|-----------|--------------|
| Upstash Redis | 10k cmds/día | Tráfico chat alto |
| Cloudflare R2 | 10 GB storage, egress gratis | Mucho almacenamiento |
| Brevo SMTP | 300 emails/día | Más usuarios registrándose |
| Render Web Service | Free (duerme) | **Starter $7/mes** recomendado prod |

---

## 6. Solución de problemas

| Síntoma | Causa | Fix |
|---------|-------|-----|
| `storage: degraded` | `MINIO_PUBLIC_URL` es localhost | URL HTTPS pública R2/S3 |
| Upload 503 "Almacenamiento no configurado" | Mismo + `NODE_ENV=production` | Configurar R2 arriba |
| `redis: degraded` | `REDIS_URL` vacía o incorrecta | Upstash URL completa |
| `ERR Only 0th database is supported` | URL con `/22` | Ya corregido en código; redeploy |
| Email no llega | `MAIL_ENABLED=false` o SMTP timeout en Render | Usa `BREVO_API_KEY` (HTTPS). Revisa logs: `Connection timeout` = SMTP bloqueado |
| `mail: degraded` en health | API key inválida o SMTP caído | Brevo → API keys; `SMTP_FROM` verificado |
| Brevo rechaza envío | `SMTP_FROM` no está en Senders verificados | Usar exactamente el email verificado en Brevo |
| Registro sin correo | Falló SMTP al registrarse (error silencioso) | Pulsa **Reenviar** en perfil tras configurar SMTP |
| Enlace email no abre app | URL web en vez de deep link | Usar `EMAIL_VERIFY_URL` de arriba |

---

## Referencias

- [RENDER.md](./RENDER.md) — deploy general
- [STRIPE_SETUP.md](./STRIPE_SETUP.md) — pagos SaaS
- `.env.example` — todas las variables documentadas
