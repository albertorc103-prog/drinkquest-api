import { ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AdminSubscriptionActionDto } from './admin-subscription-action.dto';

export class AdminActivateSubscriptionDto extends AdminSubscriptionActionDto {
  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({ example: 30, description: 'Duración del periodo activo en días' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  periodDays?: number;
}
