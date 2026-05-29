import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Request, Response } from 'express';
import { RequestContext } from '../http/request-context.interface';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request & RequestContext>();
    const res = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();
    const requestId = req.requestId ?? 'unknown';

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Date.now() - startedAt;
        this.logger.log(
          JSON.stringify({
            event: 'request_completed',
            requestId,
            userId: req.user?.sub,
            role: req.user?.role,
            endpoint: req.path,
            method: req.method,
            statusCode: res.statusCode,
            durationMs,
          }),
        );
      }),
    );
  }
}

