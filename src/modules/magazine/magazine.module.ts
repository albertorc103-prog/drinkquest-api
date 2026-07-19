import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MagazineController } from './magazine.controller';
import { MagazineService } from './magazine.service';

@Module({
  imports: [AuthModule],
  controllers: [MagazineController],
  providers: [MagazineService],
  exports: [MagazineService],
})
export class MagazineModule {}
