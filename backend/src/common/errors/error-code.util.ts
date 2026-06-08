import { HttpStatus } from '@nestjs/common';

type Domain = 'AUTH' | 'SUBSCRIPTION' | 'QR' | 'PROMOTION' | 'MODERATION' | 'ANALYTICS' | 'ADMIN' | 'SYSTEM';

export function inferDomain(path: string): Domain {
  if (path.includes('/admin/promotions')) return 'MODERATION';
  if (path.includes('/promotions/') && (path.includes('/impression') || path.includes('/open') || path.includes('/qr-scan'))) {
    return 'ANALYTICS';
  }
  if (path.includes('/admin')) return 'ADMIN';
  if (path.includes('/auth')) return 'AUTH';
  if (path.includes('/qr')) return 'QR';
  if (path.includes('/promotions') || path.includes('/bars/promotions'))
    return 'PROMOTION';
  if (path.includes('/bars/me/access') || path.includes('/subscriptions')) return 'SUBSCRIPTION';
  return 'SYSTEM';
}

export function fallbackCode(status: number, domain: Domain): string {
  const byStatus: Record<number, string> = {
    [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'CONFLICT',
    [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
    [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  };
  return `${domain}_${byStatus[status] ?? 'ERROR'}`;
}

