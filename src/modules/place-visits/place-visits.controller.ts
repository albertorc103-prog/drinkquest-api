import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CheckInPlaceDto } from './dto/check-in-place.dto';
import { PlaceReviewQueryDto, UpsertPlaceReviewDto } from './dto/place-review.dto';
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
  ) {}

  @Post('check-in')
  @ApiOperation({
    summary: 'Registrar visita a Bar DrinkQuest o Google Place (Quest Places)',
  })
  checkIn(@CurrentUser() user: JwtPayload, @Body() dto: CheckInPlaceDto) {
    return this.placeVisits.checkIn(user.sub, dto);
  }

  @Get('me/visited')
  @ApiOperation({ summary: 'Mis lugares (colección unificada)' })
  myVisited(@CurrentUser() user: JwtPayload) {
    return this.placeVisits.listMyVisitedPlaces(user.sub);
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
