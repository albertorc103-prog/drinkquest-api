import { Module } from '@nestjs/common';
import { ExternalPlaceService } from './external-place.service';
import { GooglePlacesDetailsClient } from './google-places-details.client';
import { PlaceVisitsController } from './place-visits.controller';
import { PlaceVisitsService } from './place-visits.service';

@Module({
  controllers: [PlaceVisitsController],
  providers: [
    PlaceVisitsService,
    ExternalPlaceService,
    GooglePlacesDetailsClient,
  ],
  exports: [PlaceVisitsService, ExternalPlaceService],
})
export class PlaceVisitsModule {}
