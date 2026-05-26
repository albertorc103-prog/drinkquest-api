# Migración Android → DrinkQuest API

> La app en este repositorio es **Kotlin + Jetpack Compose**, no Flutter.

## Cambios realizados

1. Backend en `backend/` (NestJS).
2. Cliente HTTP Retrofit en `app/.../data/remote/`.
3. `ApiAuthRepository` y `ApiQrUnlockRepository` sustituyen Firebase.
4. Dependencias Firebase Auth/Firestore **eliminadas** del `build.gradle.kts`.
5. `SessionManager` guarda `apiUserId` (UUID) + tokens JWT.

## Configurar URL

En `local.properties` del proyecto Android:

```properties
API_BASE_URL=http://10.0.2.2:3000/api/v1
```

Dispositivo físico (misma Wi‑Fi que el PC):

```properties
API_BASE_URL=http://192.168.1.X:3000/api/v1
```

Producción:

```properties
API_BASE_URL=https://api.tudominio.com/api/v1
```

## Flujo QR (compatible con app actual)

**Generar (bar):** `POST /qr/sessions` + `{ drinkId: "<uuid>" }`  
Respuesta alineada con `QrSessionPayload`:

```json
{
  "sessionId": "uuid",
  "businessId": "bar-uuid",
  "drinkId": "drink-uuid",
  "drinkName": "Aviation",
  "timestamp": 1710000000000,
  "expiresAt": 1710000600000,
  "token": "hex"
}
```

**Canjear (usuario):** `POST /qr/redeem` con el mismo JSON.

## Mapeo de roles

| Android `UserRole` | API `Role` |
|--------------------|------------|
| USER | USER |
| BUSINESS | BAR |
| (admin futuro) | ADMIN |

## Próximos pasos en la app

- Sincronizar catálogo Room desde `GET /drinks`
- Menú del bar desde `GET /bars/me`
- Chat: cliente Socket.IO (`io.socket:socket.io-client`)
- Feed y amigos: pantallas nuevas contra REST

## Archivos clave Android

- `data/remote/DrinkQuestApi.kt`
- `data/remote/TokenStore.kt`
- `data/repository/ApiAuthRepository.kt`
- `data/repository/ApiQrUnlockRepository.kt`
- `di/NetworkModule.kt`
