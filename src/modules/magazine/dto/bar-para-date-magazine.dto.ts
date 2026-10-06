import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const PARA_DATE_PROMO_CATEGORIES = [
  'ELEGANTE',
  'ROMANTICO',
  'TERRAZA',
  'DULCE',
  'BRUNCH',
  'CENA',
] as const;

export class CreateBarParaDateMagazineDto {
  @ApiProperty({ example: 'Mesa íntima + 2 cócteles' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title!: string;

  @ApiProperty({ example: 'Reserva sugerida. Ambiente bajo luces, ideal para primera cita.' })
  @IsString()
  @MinLength(8)
  @MaxLength(400)
  teaser!: string;

  @ApiPropertyOptional({ enum: PARA_DATE_PROMO_CATEGORIES, default: 'ELEGANTE' })
  @IsOptional()
  @IsIn([...PARA_DATE_PROMO_CATEGORIES])
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

  @ApiPropertyOptional({ example: 'Terraza · reserva desde las 19:00' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  venueNote?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateBarParaDateMagazineDto {
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

  @ApiPropertyOptional({ enum: PARA_DATE_PROMO_CATEGORIES })
  @IsOptional()
  @IsIn([...PARA_DATE_PROMO_CATEGORIES])
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
