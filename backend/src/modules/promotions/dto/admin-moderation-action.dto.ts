import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminModerationActionDto {
  @ApiPropertyOptional({ description: 'Razón administrativa visible en auditoría.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

