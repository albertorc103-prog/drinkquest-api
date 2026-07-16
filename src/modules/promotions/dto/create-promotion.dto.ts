import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromotionEventTheme, PromotionPlacementType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePromotionDto {
  @ApiProperty({ example: 'Happy Hour 2x1' })
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'URL pública devuelta por POST /uploads/direct (R2/CDN)' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/.+/i, { message: 'imageUrl debe ser una URL http(s) válida' })
  imageUrl?: string;

  @ApiProperty({ example: '2025-06-01T18:00:00.000Z' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: '2025-06-01T22:00:00.000Z' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ enum: PromotionPlacementType, default: PromotionPlacementType.STANDARD })
  @IsOptional()
  @IsEnum(PromotionPlacementType)
  placementType?: PromotionPlacementType;

  @ApiPropertyOptional({
    enum: PromotionEventTheme,
    default: PromotionEventTheme.STANDARD,
    description:
      'Temática de evento Happy Hour. Distinto de STANDARD solo en plan Legend (Navidad, Año Nuevo, etc.).',
  })
  @IsOptional()
  @IsEnum(PromotionEventTheme)
  eventTheme?: PromotionEventTheme;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;
}
