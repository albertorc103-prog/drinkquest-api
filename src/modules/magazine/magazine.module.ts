import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BarMagazineController } from './bar-magazine.controller';
import { MagazineController } from './magazine.controller';
import { MagazineService } from './magazine.service';

@Module({
  imports: [AuthModule, SubscriptionsModule],
  controllers: [MagazineController, BarMagazineController],
  providers: [MagazineService],
  exports: [MagazineService],
})
export class MagazineModule {}
