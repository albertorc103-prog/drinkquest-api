import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/app-exception';
import { BarAccessDenialReason } from '../enums/bar-access-denial-reason.enum';

export class BarAccessDeniedException extends AppException {
  constructor(
    public readonly code: BarAccessDenialReason,
    message: string,
  ) {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}
