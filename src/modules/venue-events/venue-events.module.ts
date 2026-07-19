import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminVenueEventsController } from './admin-venue-events.controller';
import { AdminVenueEventsService } from './admin-venue-events.service';
import { BarVenueEventsController } from './bar-venue-events.controller';
import { VenueEventsFeedController } from './venue-events-feed.controller';
import { VenueEventsFeedService } from './venue-events-feed.service';
import { VenueEventsService } from './venue-events.service';

@Module({
  imports: [SubscriptionsModule],
  controllers: [
    BarVenueEventsController,
    VenueEventsFeedController,
    AdminVenueEventsController,
  ],
  providers: [VenueEventsService, VenueEventsFeedService, AdminVenueEventsService],
  exports: [VenueEventsService, AdminVenueEventsService],
})
export class VenueEventsModule {}
