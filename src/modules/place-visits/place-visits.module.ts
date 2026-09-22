import { Module } from '@nestjs/common';
import { ExternalPlaceService } from './external-place.service';
import { GooglePlacesDetailsClient } from './google-places-details.client';
import { PlaceReviewsService } from './place-reviews.service';
import { PlaceBarDrinksService } from './place-bar-drinks.service';
import { PlaceVisitsController } from './place-visits.controller';
import { PlaceVisitsService } from './place-visits.service';

@Module({
  controllers: [PlaceVisitsController],
  providers: [
    PlaceVisitsService,
    PlaceReviewsService,
    PlaceBarDrinksService,
    ExternalPlaceService,
    GooglePlacesDetailsClient,
  ],
  exports: [PlaceVisitsService, PlaceReviewsService, ExternalPlaceService],
})
export class PlaceVisitsModule {}
