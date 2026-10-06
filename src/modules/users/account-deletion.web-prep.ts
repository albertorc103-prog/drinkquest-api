/**
 * FASE WEB (pendiente): solicitud pública de eliminación de cuenta.
 *
 * Flujo previsto (NO expuesto aún — no crear endpoint público inseguro):
 * 1. POST /account-deletion/request { email } → envía email con token de un solo uso.
 * 2. POST /account-deletion/confirm { token } → verifica identidad.
 * 3. AccountDeletionService.executeDeletion(userId) — MISMO servicio que Android.
 *
 * Helper de token: buildAccountDeletionRequestToken() en account-deletion.service.ts
 * Persistencia futura: tabla AccountDeletionRequest (tokenHash, expiresAt, usedAt).
 */
export const ACCOUNT_DELETION_WEB_PHASE_NOTES = {
  status: 'prepared_not_implemented',
  sharedService: 'AccountDeletionService.executeDeletion',
  androidEntry: 'POST /users/me/delete + password',
} as const;
