# Push FCM (DrinkQuest)

## Qué hace

- La app registra el token FCM en `POST /api/v1/notifications/device-tokens` tras login/sync.
- Al crear una notificación en inbox, el backend también intenta enviar push FCM.
- Sin credenciales Firebase, el sistema sigue con inbox + Socket.IO (sin crash).

## App Android

1. Firebase Console → crea/abre proyecto → añade app Android `com.drinkquest.app`.
2. Descarga `google-services.json` real y reemplaza `app/google-services.json` (el actual es placeholder).
3. Rebuild: `BuildConfig.FCM_ENABLED` pasa a `true` automáticamente si el JSON no es placeholder.
4. Concede `POST_NOTIFICATIONS` en el dispositivo (Android 13+).

## Backend / Render

1. Firebase Console → Project settings → Service accounts → Generate new private key.
2. En Render → Environment, define `FIREBASE_SERVICE_ACCOUNT_JSON` con el JSON completo (idealmente en una línea).
3. Redeploy el servicio `drinkquest-api`.

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/notifications/device-tokens` | `{ token, platform }` |
| DELETE | `/notifications/device-tokens` | body `{ token }` |

## Tabla

`device_tokens` (Prisma) — ya existía; no requiere migración nueva.
