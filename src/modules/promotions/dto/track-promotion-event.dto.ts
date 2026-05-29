import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class TrackPromotionEventDto {
  @ApiPropertyOptional({
    description: 'Metadata opcional del cliente (pantalla, posición, sessionId, etc).',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

