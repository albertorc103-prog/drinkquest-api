import { applyDecorators } from '@nestjs/common';
import { ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';

const forbiddenExample = {
  code: 'AUTH_FORBIDDEN',
  message: 'No tienes permisos para realizar esta acción',
  details: {},
  timestamp: '2026-05-28T12:00:00.000Z',
  requestId: 'req-example',
};

/** Documenta 401/403 para rutas con JwtAuthGuard + PermissionsGuard. */
export function ApiAuthForbiddenResponses() {
  return applyDecorators(
    ApiUnauthorizedResponse({ description: 'Token ausente o inválido' }),
    ApiForbiddenResponse({
      description: 'Permisos insuficientes (AUTH_FORBIDDEN)',
      schema: { example: forbiddenExample },
    }),
  );
}
