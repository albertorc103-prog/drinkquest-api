import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BarMissionTemplate } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateBarMissionItemDto {
  @ApiProperty({ enum: BarMissionTemplate })
  @IsEnum(BarMissionTemplate)
  template!: BarMissionTemplate;
}

export class CreateBarMissionSeasonDto {
  @ApiProperty({ example: 'Temporada de verano' })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  title!: string;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: '2026-08-31T23:59:59.000Z' })
  @IsDateString()
  endsAt!: string;

  @ApiProperty({ example: 'Medalla Casa Azul' })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  medalTitle!: string;

  @ApiProperty({ example: 'Completaste la temporada de misiones del local.' })
  @IsString()
  @MinLength(10)
  @MaxLength(240)
  medalDescription!: string;

  @ApiProperty({
    type: [CreateBarMissionItemDto],
    description: 'Exactamente 3 plantillas distintas',
  })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CreateBarMissionItemDto)
  missions!: CreateBarMissionItemDto[];

  @ApiPropertyOptional({
    description: 'Si true, publica la temporada al crearla (solo una ACTIVE por bar).',
  })
  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}

export class UpdateBarMissionSeasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  medalTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(240)
  medalDescription?: string;

  @ApiPropertyOptional({ type: [CreateBarMissionItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CreateBarMissionItemDto)
  missions?: CreateBarMissionItemDto[];
}
