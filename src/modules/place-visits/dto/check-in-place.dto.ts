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

/**
 * Check-in Quest Places.
 * El cliente envía solo fix GPS + identidad del lugar.
 * NO enviar distance / xp / eligible / rewardTier — el backend los calcula.
 */
export class CheckInPlaceDto {
  @ApiPropertyOptional({ description: 'UUID del Bar DrinkQuest (si se conoce).' })
  @IsOptional()
  @IsUUID()
  barId?: string;

  @ApiPropertyOptional({
    description:
      'Google Place ID. El backend resuelve coordenadas del POI vía ExternalPlace / Places API (no confiar en coords del establecimiento enviadas por el cliente).',
  })
  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @ApiProperty({
    description:
      'Latitud actual del usuario (WGS84). Solo se usa para validar presencia; no se persiste en PlaceVisit.',
    example: 20.672,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({
    description:
      'Longitud actual del usuario (WGS84). Solo se usa para validar presencia; no se persiste en PlaceVisit.',
    example: -101.355,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiProperty({
    description:
      'Precisión GPS reportada en metros. Obligatoria. Si es > umbral de servidor, el check-in falla.',
    example: 12,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10_000)
  accuracy!: number;

  @ApiPropertyOptional({
    description:
      'Epoch ms del fix GPS (Location.getTime). Si se envía, no puede ser excesivamente antiguo ni futuro.',
    example: 1_725_000_000_000,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  capturedAtMs?: number;
}
