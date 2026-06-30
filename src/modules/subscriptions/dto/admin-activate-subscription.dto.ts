import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SubscriptionPlan } from '@prisma/client';
import { AdminSubscriptionActionDto } from './admin-subscription-action.dto';
import { normalizeSubscriptionPlan } from '../subscription-plan.util';

export class AdminActivateSubscriptionDto extends AdminSubscriptionActionDto {
  @ApiPropertyOptional({
    enum: ['EXPLORER', 'INTERMEDIATE', 'LEGEND', 'BASIC', 'PRO'],
    description: 'Plan SaaS: Explorer ($499), Intermedio ($1000), Legend ($1500)',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value == null ? undefined : normalizeSubscriptionPlan(String(value))))
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({ example: 30, description: 'Duración del periodo activo en días' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  periodDays?: number;
}
