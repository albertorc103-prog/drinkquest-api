import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpsertPlaceReviewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  barId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @ValidateIf((_, v) => v != null && String(v).trim().length > 0)
  comment?: string;
}

export class PlaceReviewQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  barId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  googlePlaceId?: string;
}
