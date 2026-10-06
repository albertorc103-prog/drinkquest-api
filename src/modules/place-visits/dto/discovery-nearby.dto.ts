import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PLACE_DISCOVERY_CONFIG } from '../place-discovery.config';

export class DiscoveryNearbyDto {
  @ApiProperty({ description: 'Latitud actual del usuario (solo para consulta; no se persiste).' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ description: 'Longitud actual del usuario (solo para consulta; no se persiste).' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ description: 'Precisión GPS opcional (informativa).' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10_000)
  accuracy?: number;

  @ApiPropertyOptional({
    description: `Máximo de candidatos (default ${PLACE_DISCOVERY_CONFIG.MAX_CANDIDATES}, tope igual).`,
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(PLACE_DISCOVERY_CONFIG.MAX_CANDIDATES)
  limit?: number;

  /**
   * Semilla técnica: solo Google place_id descubiertos por Nearby en Android.
   * El backend resuelve/autoriza; NO aceptar rating/partner/prioridad del cliente.
   */
  @ApiPropertyOptional({
    type: [String],
    description:
      'Google place_id semilla (máx. 40). Solo IDs; metadatos del cliente se ignoran.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PLACE_DISCOVERY_CONFIG.MAX_SEED_PLACE_IDS)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  @Type(() => String)
  seedPlaceIds?: string[];
}

export class DiscoveryCandidateDto {
  placeKey!: string;
  placeType!: 'DRINKQUEST_BAR' | 'EXTERNAL';
  barId!: string | null;
  googlePlaceId!: string | null;
  name!: string;
  latitude!: number;
  longitude!: number;
  geofenceRadiusMeters!: number;
  /** Promedio reseñas DrinkQuest; null si no hay reseñas. */
  drinkQuestRating!: number | null;
  drinkQuestReviewCount!: number;
  drinkQuestPartner!: boolean;
  discoveryPriority!: number;
  discoveryReason!: string | null;
  hasActivePromotion!: boolean;
}

export class DiscoveryNearbyResponseDto {
  candidates!: DiscoveryCandidateDto[];
  regionRadiusMeters!: number;
  placeGeofenceRadiusMeters!: number;
  searchRadiusMeters!: number;
}

export class ResolvePlaceQueryDto {
  @ApiProperty({
    description:
      'Clave: google place_id, google:<id>, dq:<barUuid>. No usar nombre.',
  })
  @IsString()
  @MaxLength(320)
  placeKey!: string;
}

export class ResolvedPlaceDto {
  available!: boolean;
  message?: string | null;
  placeKey?: string;
  placeType?: 'DRINKQUEST_BAR' | 'EXTERNAL';
  barId?: string | null;
  googlePlaceId?: string | null;
  name?: string;
  latitude?: number;
  longitude?: number;
  drinkQuestRating?: number | null;
  drinkQuestReviewCount?: number;
  drinkQuestPartner?: boolean;
}
