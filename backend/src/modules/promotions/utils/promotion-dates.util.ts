import { BadRequestException } from '@nestjs/common';

export function assertValidPromotionWindow(startsAt: Date, endsAt: Date): void {
  if (endsAt <= startsAt) {
    throw new BadRequestException('La fecha de fin debe ser posterior al inicio.');
  }
}

export function assertNotAlreadyExpired(endsAt: Date, now: Date = new Date()): void {
  if (endsAt <= now) {
    throw new BadRequestException('No se puede publicar una promoción ya vencida.');
  }
}
