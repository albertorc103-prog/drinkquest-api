import { Module } from '@nestjs/common';
import { BarsController } from './bars.controller';
import { BarsService } from './bars.service';

@Module({ controllers: [BarsController], providers: [BarsService], exports: [BarsService] })
export class BarsModule {}
