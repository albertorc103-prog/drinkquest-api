import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BarMapController } from './bar-map.controller';
import { BarMapService } from './bar-map.service';
import { BarsController } from './bars.controller';
import { BarsService } from './bars.service';

@Module({
  imports: [SubscriptionsModule, PaymentsModule],
  controllers: [BarsController, BarMapController],
  providers: [BarsService, BarMapService],
  exports: [BarsService],
})
export class BarsModule {}
