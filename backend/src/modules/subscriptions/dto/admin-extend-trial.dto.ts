import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { AdminSubscriptionActionDto } from './admin-subscription-action.dto';

export class AdminExtendTrialDto extends AdminSubscriptionActionDto {
  @ApiProperty({ example: 7, description: 'Días adicionales de trial' })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}
