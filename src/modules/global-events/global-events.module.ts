import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminGlobalEventsController } from './admin-global-events.controller';
import { GlobalEventsService } from './global-events.service';
import { UserGlobalEventsController } from './user-global-events.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminGlobalEventsController, UserGlobalEventsController],
  providers: [GlobalEventsService],
  exports: [GlobalEventsService],
})
export class GlobalEventsModule {}
