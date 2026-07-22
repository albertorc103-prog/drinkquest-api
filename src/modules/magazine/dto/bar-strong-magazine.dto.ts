import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const STRONG_PROMO_CATEGORIES = [
  'SHOT',
  'FUERTE',
  'WHISKY',
  'RON',
  'TEQUILA',
  'TROPICAL',
  'MEZCAL',
] as const;

export class CreateBarStrongMagazineDto {
  @ApiProperty({ example: 'B-52 2×1' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title!: string;

  @ApiProperty({ example: 'Viernes y sábado después de las 22:00. Ideal para grupos.' })
  @IsString()
  @MinLength(8)
  @MaxLength(400)
  teaser!: string;

  @ApiPropertyOptional({ enum: STRONG_PROMO_CATEGORIES, default: 'SHOT' })
  @IsOptional()
  @IsIn([...STRONG_PROMO_CATEGORIES])
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Bebida del catálogo DrinkQuest (opcional)' })
  @IsOptional()
  @IsUUID()
  drinkId?: string;

  @ApiPropertyOptional({ example: 'Solo en barra · hasta agotar' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  venueNote?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateBarStrongMagazineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(400)
  teaser?: string;

  @ApiPropertyOptional({ enum: STRONG_PROMO_CATEGORIES })
  @IsOptional()
  @IsIn([...STRONG_PROMO_CATEGORIES])
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  drinkId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  venueNote?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
