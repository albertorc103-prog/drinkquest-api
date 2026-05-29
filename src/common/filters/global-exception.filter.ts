import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from '../errors/app-exception';
import { fallbackCode, inferDomain } from '../errors/error-code.util';
import { RequestContext } from '../http/request-context.interface';

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & RequestContext>();
    const response = ctx.getResponse<Response>();

    const requestId = request.requestId ?? 'unknown';
    const timestamp = new Date().toISOString();
    const domain = inferDomain(request.path);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = fallbackCode(status, domain);
    let message = 'Ha ocurrido un error inesperado.';
    let details: Record<string, unknown> = {};

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = (exception.getResponse() as { message?: string })?.message ?? exception.message;
      details = exception.details ?? {};
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as
        | string
        | { code?: string; message?: string | string[]; details?: Record<string, unknown> };
      code = typeof res === 'object' && res?.code ? res.code : fallbackCode(status, domain);
      const rawMessage =
        typeof res === 'object' && res?.message
          ? res.message
          : exception.message;
      message = Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage || message;
      details = typeof res === 'object' && res?.details ? res.details : {};
    }

    const payload = {
      code,
      message,
      details,
      timestamp,
      requestId,
    };

    if (status >= 500) {
      const safeError = exception instanceof Error ? exception.message : String(exception);
      this.logger.error(
        JSON.stringify({
          event: 'request_error',
          requestId,
          path: request.path,
          method: request.method,
          statusCode: status,
          code,
          error: safeError,
        }),
      );
    } else {
      this.logger.warn(
        JSON.stringify({
          event: 'request_fail',
          requestId,
          path: request.path,
          method: request.method,
          statusCode: status,
          code,
          userId: request.user?.sub,
          role: request.user?.role,
        }),
      );
    }

    response.status(status).json(payload);
  }
}

