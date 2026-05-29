import { Global, Module } from '@nestjs/common';
import { RealtimeHub } from './realtime-hub.service';

@Global()
@Module({
  providers: [RealtimeHub],
  exports: [RealtimeHub],
})
export class RealtimeModule {}
