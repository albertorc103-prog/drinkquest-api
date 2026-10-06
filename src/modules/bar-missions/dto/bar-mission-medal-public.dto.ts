import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BarMissionMedalConditionMode, BarMissionMedalConditionType } from '@prisma/client';

/** Medalla ACTIVE pública de un bar (sin metadata admin). */
export class PublicBarMedalConditionDto {
  @ApiProperty({ enum: BarMissionMedalConditionType })
  type!: BarMissionMedalConditionType;

  @ApiPropertyOptional()
  target!: number | null;

  @ApiPropertyOptional()
  referenceId!: string | null;

  @ApiPropertyOptional({ description: 'Solo MISSION_COMPLETED' })
  mission?: { id: string; title: string; description: string } | null;
}

export class PublicBarMedalDto {
  @ApiProperty()
  available!: boolean;

  @ApiPropertyOptional()
  barId?: string;

  @ApiPropertyOptional()
  seasonId?: string;

  @ApiPropertyOptional()
  medalVersionId?: string;

  @ApiPropertyOptional()
  title?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  xpReward?: number;

  @ApiPropertyOptional({ enum: BarMissionMedalConditionMode })
  conditionMode?: BarMissionMedalConditionMode;

  @ApiPropertyOptional({ type: [PublicBarMedalConditionDto] })
  conditions?: PublicBarMedalConditionDto[];

  @ApiPropertyOptional()
  designConfig?: unknown;

  @ApiPropertyOptional()
  templateId?: string | null;
}

export class UserBarMedalListItemDto {
  @ApiProperty()
  userBarMedalId!: string;

  @ApiPropertyOptional()
  medalVersionId!: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  barId!: string;

  @ApiProperty()
  barName!: string;

  @ApiPropertyOptional()
  barLogoUrl!: string | null;

  @ApiPropertyOptional()
  templateId!: string | null;

  @ApiPropertyOptional()
  designConfig!: unknown;

  @ApiProperty()
  xpReward!: number;

  @ApiProperty()
  unlockedAt!: string;

  @ApiPropertyOptional()
  legacy?: boolean;
}

export class BarMedalStatsDto {
  @ApiProperty()
  seasonId!: string;

  @ApiPropertyOptional()
  medalVersionId!: string | null;

  @ApiPropertyOptional()
  medalTitle!: string | null;

  @ApiProperty({ description: 'Season metric: unlocks de cualquier versión' })
  totalUnlocked!: number;

  @ApiProperty()
  unlocksLast7Days!: number;

  @ApiProperty()
  unlocksLast30Days!: number;

  @ApiProperty({ description: 'Usuarios que iniciaron ≥1 condición (current ACTIVE)' })
  startedUsers!: number;

  @ApiProperty({ description: 'startedUsers − unlocked (current)' })
  inProgressUsers!: number;

  @ApiProperty({ description: 'totalUnlocked / startedUsers * 100; 0 si started=0' })
  completionRate!: number;

  @ApiProperty()
  unlockTrend!: Array<{ date: string; count: number }>;

  @ApiProperty()
  conditionBreakdown!: Array<{
    type: BarMissionMedalConditionType;
    target: number | null;
    referenceId: string | null;
    missionTitle?: string | null;
    usersCompleted: number;
  }>;

  @ApiPropertyOptional({
    description: 'Omitido en FASE 7: requeriría ProgressService por usuario (N+1).',
  })
  averageProgress?: null;
}
