import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UserGamificationDto {
  @ApiProperty()
  coins!: number;

  @ApiProperty()
  loginStreakDays!: number;

  @ApiProperty()
  lastLoginEpochDay!: number;

  @ApiProperty()
  streakBonusTierClaimed!: number;

  @ApiProperty()
  dailyChestClaimedDay!: number;

  @ApiPropertyOptional()
  totalXp?: number;

  @ApiPropertyOptional()
  level?: number;
}

export class SyncGamificationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  coins?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  loginStreakDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  lastLoginEpochDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  streakBonusTierClaimed?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  dailyChestClaimedDay?: number;
}
