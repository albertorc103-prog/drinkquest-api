import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateSpecialDrinkDto {
  @ApiProperty({ example: 'Negroni de la casa' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'Gin, Campari, vermut rojo, naranja.' })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  recipe!: string;

  @ApiProperty({ example: 'Se sirve solo los viernes desde 2019.' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  funFact!: string;

  @ApiProperty({ description: 'URL pública de POST /uploads/direct (folder drinks)' })
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/.+/i, { message: 'imageUrl debe ser una URL http(s) válida' })
  imageUrl!: string;
}

export class UpdateSpecialDrinkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  recipe?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  funFact?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/.+/i, { message: 'imageUrl debe ser una URL http(s) válida' })
  imageUrl?: string;
}
