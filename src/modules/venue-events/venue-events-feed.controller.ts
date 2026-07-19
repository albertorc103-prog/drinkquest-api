import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VenueEventsFeedService } from './venue-events-feed.service';

@ApiTags('venue-events')
@Controller('venue-events')
export class VenueEventsFeedController {
  constructor(private readonly feed: VenueEventsFeedService) {}

  @Get('feed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Feed de eventos del lugar activos y visibles' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'barId', required: false })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('barId') barId?: string,
  ) {
    return this.feed.listForUsers(
      parseInt(page ?? '1', 10),
      parseInt(limit ?? '20', 10),
      barId?.trim() || undefined,
    );
  }

  @Get('by-bar/:barId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eventos activos de un bar (ficha del lugar)' })
  byBar(@Param('barId') barId: string, @Query('limit') limit?: string) {
    return this.feed.listForBar(barId, parseInt(limit ?? '10', 10));
  }
}
