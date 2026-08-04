import { Module } from '@nestjs/common';
import { MissionsModule } from '../missions/missions.module';
import { DrinksController } from './drinks.controller';
import { DrinksService } from './drinks.service';

@Module({
  imports: [MissionsModule],
  controllers: [DrinksController],
  providers: [DrinksService],
  exports: [DrinksService],
})
export class DrinksModule {}
