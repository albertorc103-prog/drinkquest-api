import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckInPlaceDto {
  @ApiPropertyOptional({ description: 'UUID del Bar DrinkQuest (si se conoce).' })
  @IsOptional()
  @IsUUID()
  barId?: string;

  @ApiPropertyOptional({
    description:
      'Google Place ID. Si viene, el backend resuelve coords vía ExternalPlace / Places API (no confiar en coords POI del cliente).',
  })
  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @ApiProperty({ description: 'Latitud actual del usuario.' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ description: 'Longitud actual del usuario.' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({
    description: 'Precisión GPS en metros. Requerida para check-in válido.',
  })
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsNumber()
  @Min(0)
  accuracy?: number;
}
