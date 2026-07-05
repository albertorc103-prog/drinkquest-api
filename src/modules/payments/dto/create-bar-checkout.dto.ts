import { IsIn, IsString } from 'class-validator';
import { SUBSCRIPTION_PLAN_INPUTS } from '../../subscriptions/subscription-plan.util';

export class CreateBarCheckoutDto {
  @IsString()
  @IsIn([...SUBSCRIPTION_PLAN_INPUTS])
  plan!: string;
}
