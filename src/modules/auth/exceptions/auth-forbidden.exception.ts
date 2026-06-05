import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/app-exception';

export class AuthForbiddenException extends AppException {
  constructor(message = 'No tienes permisos para realizar esta acción') {
    super('AUTH_FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
}
