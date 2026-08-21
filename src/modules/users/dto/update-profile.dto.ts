import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileVisibility } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  bio?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'URL del avatar; null para quitarlo' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  avatarUrl?: string | null;

  @ApiPropertyOptional({ enum: ProfileVisibility })
  @IsOptional()
  @IsEnum(ProfileVisibility)
  profileVisibility?: ProfileVisibility;
}
