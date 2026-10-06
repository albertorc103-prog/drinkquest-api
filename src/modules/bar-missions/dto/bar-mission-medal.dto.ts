import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BarMissionMedalConditionMode, BarMissionMedalConditionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BarMedalConditionInputDto {
  @ApiProperty({ enum: BarMissionMedalConditionType })
  @IsEnum(BarMissionMedalConditionType)
  type!: BarMissionMedalConditionType;

  @ApiPropertyOptional({ description: 'Meta numérica (VISITS / DRINKS_UNLOCKED).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  targetValue?: number;

  @ApiPropertyOptional({ description: 'BarMission.id para MISSION_COMPLETED.' })
  @IsOptional()
  @IsUUID()
  referenceId?: string;
}

export class UpsertBarMedalDto {
  @ApiProperty({ maxLength: 40 })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  title!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  description!: string;

  @ApiPropertyOptional({ enum: BarMissionMedalConditionMode, default: BarMissionMedalConditionMode.ALL })
  @IsOptional()
  @IsEnum(BarMissionMedalConditionMode)
  conditionMode?: BarMissionMedalConditionMode;

  @ApiProperty({ type: [BarMedalConditionInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BarMedalConditionInputDto)
  conditions!: BarMedalConditionInputDto[];

  /** designConfig schema v1 (formas/estilo/identidad). Validado en servicio. */
  @ApiProperty({
    description: 'Configuración visual schemaVersion=1',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  designConfig!: Record<string, unknown>;
}

export class UpdateBarMedalDto {
  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  title?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  description?: string;

  @ApiPropertyOptional({ enum: BarMissionMedalConditionMode })
  @IsOptional()
  @IsEnum(BarMissionMedalConditionMode)
  conditionMode?: BarMissionMedalConditionMode;

  @ApiPropertyOptional({ type: [BarMedalConditionInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BarMedalConditionInputDto)
  conditions?: BarMedalConditionInputDto[];

  @ApiPropertyOptional({
    description: 'Configuración visual schemaVersion=1',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  designConfig?: Record<string, unknown>;
}

export class AdminBarMedalReviewDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AdminBarMedalRewardDto {
  @ApiProperty({ minimum: 0, maximum: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  xpReward!: number;
}
