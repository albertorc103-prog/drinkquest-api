import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminSubscriptionActionDto {
  @ApiPropertyOptional({ description: 'Motivo visible en auditoría' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
