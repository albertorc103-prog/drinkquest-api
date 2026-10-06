import { Module, forwardRef } from '@nestjs/common';
import { BarMissionsModule } from '../bar-missions/bar-missions.module';
import { ExternalPlaceService } from './external-place.service';
import { GooglePlacesDetailsClient } from './google-places-details.client';
import { PlaceReviewsService } from './place-reviews.service';
import { PlaceBarDrinksService } from './place-bar-drinks.service';
import { PlaceDiscoveryService } from './place-discovery.service';
import { PlaceVisitsController } from './place-visits.controller';
import { PlaceVisitsService } from './place-visits.service';

@Module({
  imports: [forwardRef(() => BarMissionsModule)],
  controllers: [PlaceVisitsController],
  providers: [
    PlaceVisitsService,
    PlaceReviewsService,
    PlaceBarDrinksService,
    PlaceDiscoveryService,
    ExternalPlaceService,
    GooglePlacesDetailsClient,
  ],
  exports: [
    PlaceVisitsService,
    PlaceReviewsService,
    PlaceDiscoveryService,
    ExternalPlaceService,
  ],
})
export class PlaceVisitsModule {}
