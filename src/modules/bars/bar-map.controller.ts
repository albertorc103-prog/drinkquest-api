import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BarMapService } from './bar-map.service';

@ApiTags('places')
@Controller('places')
export class BarMapController {
  constructor(private readonly barMap: BarMapService) {}

  @Get('featured')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bares con suscripción activa y coordenadas, destacados en el mapa del consumidor',
  })
  @ApiQuery({ name: 'lat', required: false })
  @ApiQuery({ name: 'lng', required: false })
  @ApiQuery({ name: 'radiusKm', required: false })
  featured(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    return this.barMap.featuredBars({
      latitude: toNumber(lat),
      longitude: toNumber(lng),
      radiusKm: toNumber(radiusKm),
    });
  }
}

function toNumber(value?: string): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
