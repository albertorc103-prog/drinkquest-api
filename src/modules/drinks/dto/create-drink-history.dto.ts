import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateDrinkHistoryDto {
  @ApiProperty({ description: 'UUID de la bebida en el catálogo remoto' })
  @IsUUID()
  drinkId!: string;

  @ApiPropertyOptional({ description: 'UUID del bar (opcional)' })
  @IsOptional()
  @IsUUID()
  barId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, example: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  rating?: number;

  @ApiPropertyOptional({ description: 'Notas o nombre del lugar' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'ISO-8601; por defecto ahora',
    example: '2026-08-04T23:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
