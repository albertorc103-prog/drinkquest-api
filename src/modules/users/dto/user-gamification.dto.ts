import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';

export class QuestProgressEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  progress?: number;

  @ApiPropertyOptional({ description: 'Epoch millis de primera completación' })
  @IsOptional()
  @IsInt()
  @Min(0)
  completedAt?: number | null;

  @ApiPropertyOptional({ description: 'XP a otorgar solo en la primera completación' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  xpReward?: number;

  @ApiPropertyOptional({
    description:
      'Identificador de periodo (epoch day para diarias / inicio de semana). Si avanza, permite reset.',
  })
  @IsOptional()
  @IsInt()
  periodEpochDay?: number | null;
}

export class AchievementProgressEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  progress?: number;

  @ApiPropertyOptional({ description: 'Epoch millis del primer unlock' })
  @IsOptional()
  @IsInt()
  @Min(0)
  unlockedAt?: number | null;

  @ApiPropertyOptional({ description: 'XP a otorgar solo en el primer unlock' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  xpReward?: number;
}

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

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/QuestProgressEntryDto' },
  })
  questProgress?: Record<string, QuestProgressEntryDto>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/AchievementProgressEntryDto' },
  })
  achievementProgress?: Record<string, AchievementProgressEntryDto>;
}

export class SyncGamificationDto {
  /** Ignorado (FASE 4.1): coins solo vía ledger servidor. */
  @ApiPropertyOptional({ deprecated: true, description: 'Ignorado — no autoridad cliente' })
  @IsOptional()
  @IsInt()
  @Min(0)
  coins?: number;

  /** Ignorado: racha solo vía recordDailyLogin. */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  loginStreakDays?: number;

  /** Ignorado: racha solo vía recordDailyLogin. */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  lastLoginEpochDay?: number;

  /** Ignorado: tiers solo vía recordDailyLogin + ledger. */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  streakBonusTierClaimed?: number;

  /** Si equals epoch day UTC servidor y avanza → +50 coins (ledger DAILY_CHEST). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  dailyChestClaimedDay?: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/QuestProgressEntryDto' },
  })
  @IsOptional()
  @IsObject()
  questProgress?: Record<string, QuestProgressEntryDto>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/AchievementProgressEntryDto' },
  })
  @IsOptional()
  @IsObject()
  achievementProgress?: Record<string, AchievementProgressEntryDto>;
}
