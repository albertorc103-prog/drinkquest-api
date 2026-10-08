import { Global, Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { RealtimeHub } from './realtime-hub.service';

@Global()
@Module({
  providers: [RealtimeHub, PresenceService],
  exports: [RealtimeHub, PresenceService],
})
export class RealtimeModule {}
