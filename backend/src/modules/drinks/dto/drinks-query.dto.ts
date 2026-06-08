import { ApiPropertyOptional } from '@nestjs/swagger';
import { DrinkRarity } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class DrinksQueryDto {
  @ApiPropertyOptional({ description: 'UUID de categoría' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ enum: DrinkRarity, example: DrinkRarity.COMMON })
  @IsOptional()
  @IsEnum(DrinkRarity)
  rarity?: DrinkRarity;

  @ApiPropertyOptional({ example: 'mojito', description: 'Búsqueda por nombre (parcial, case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
