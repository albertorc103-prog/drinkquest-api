import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BarsController } from './bars.controller';
import { BarsService } from './bars.service';

@Module({
  imports: [SubscriptionsModule],
  controllers: [BarsController],
  providers: [BarsService],
  exports: [BarsService],
})
export class BarsModule {}
