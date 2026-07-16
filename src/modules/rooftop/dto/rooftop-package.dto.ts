import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRooftopPackageDto {
  @ApiProperty({ example: 'Atardecer Roma Norte' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'URL pública de imagen del paquete' })
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/.+/i, { message: 'imageUrl debe ser una URL http(s) válida' })
  imageUrl!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includesFood?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includesDrinks?: boolean;

  @ApiPropertyOptional({ example: '$899 por persona' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  priceLabel?: string;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;
}

export class UpdateRooftopPackageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/.+/i, { message: 'imageUrl debe ser una URL http(s) válida' })
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includesFood?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includesDrinks?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  priceLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
