import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CheckInPlaceDto } from './dto/check-in-place.dto';
import {
  DiscoveryNearbyDto,
  ResolvePlaceQueryDto,
} from './dto/discovery-nearby.dto';
import { PlaceReviewQueryDto, UpsertPlaceReviewDto } from './dto/place-review.dto';
import { PlaceBarDrinksService } from './place-bar-drinks.service';
import { PlaceDiscoveryService } from './place-discovery.service';
import { PlaceReviewsService } from './place-reviews.service';
import { PlaceVisitsService } from './place-visits.service';

@ApiTags('places')
@Controller('places')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlaceVisitsController {
  constructor(
    private readonly placeVisits: PlaceVisitsService,
    private readonly placeReviews: PlaceReviewsService,
    private readonly placeBarDrinks: PlaceBarDrinksService,
    private readonly discovery: PlaceDiscoveryService,
  ) {}

  @Post('check-in')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Registrar visita a Bar DrinkQuest o Google Place (Quest Places)',
    description:
      'El cliente envía latitude, longitude, accuracy y opcionalmente capturedAtMs del fix GPS. ' +
      'El servidor valida presencia, calcula distancia (Haversine), elegibilidad, cooldown y XP. ' +
      'No enviar distance/xp/eligible. Las coordenadas del usuario no se persisten ni se reenvían.',
  })
  checkIn(@CurrentUser() user: JwtPayload, @Body() dto: CheckInPlaceDto) {
    // Identidad siempre desde JWT (user.sub). Nunca desde body.userId.
    return this.placeVisits.checkIn(user.sub, dto);
  }

  @Post('discovery/nearby')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Proactive Discovery: candidatos geofence cerca del usuario',
    description:
      'Devuelve un pool rankeado (DrinkQuest + ExternalPlace). ' +
      'seedPlaceIds opcionales: solo Google place_id semilla; el backend resuelve y autoriza. ' +
      'Ratings exclusivamente DrinkQuest. Coords de usuario no se persisten.',
  })
  discoveryNearby(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DiscoveryNearbyDto,
  ) {
    return this.discovery.nearby(user.sub, dto);
  }

  @Get('resolve')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Resolver placeKey para deep link / ficha Explore',
    description:
      'placeKey = google place_id | google:<id> | dq:<barUuid>. No usar nombre.',
  })
  resolvePlace(
    @CurrentUser() user: JwtPayload,
    @Query() query: ResolvePlaceQueryDto,
  ) {
    return this.discovery.resolvePlace(user.sub, query.placeKey);
  }

  @Get('me/visited')
  @ApiOperation({ summary: 'Mis lugares (colección unificada)' })
  myVisited(@CurrentUser() user: JwtPayload) {
    return this.placeVisits.listMyVisitedPlaces(user.sub);
  }

  @Get('bars/:barId/drinks')
  @ApiOperation({
    summary: 'Bebidas de la casa y menú activo de un bar DrinkQuest',
  })
  barDrinks(@Param('barId') barId: string) {
    return this.placeBarDrinks.listForBar(barId);
  }

  @Get('reviews')
  @ApiOperation({ summary: 'Opiniones y promedio de un lugar' })
  listReviews(
    @CurrentUser() user: JwtPayload,
    @Query() query: PlaceReviewQueryDto,
  ) {
    return this.placeReviews.listForPlace(user.sub, query);
  }

  @Post('reviews')
  @ApiOperation({ summary: 'Publicar o actualizar mi calificación/opinión' })
  upsertReview(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertPlaceReviewDto,
  ) {
    return this.placeReviews.upsert(user.sub, dto);
  }
}
