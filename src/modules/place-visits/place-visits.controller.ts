import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CheckInPlaceDto } from './dto/check-in-place.dto';
import { PlaceVisitsService } from './place-visits.service';

@ApiTags('places')
@Controller('places')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlaceVisitsController {
  constructor(private readonly placeVisits: PlaceVisitsService) {}

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
}
