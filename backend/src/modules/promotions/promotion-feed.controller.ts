import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PromotionFeedService, PromotionFeedSort } from './promotion-feed.service';

@ApiTags('promotions')
@Controller('promotions')
export class PromotionFeedController {
  constructor(private readonly feed: PromotionFeedService) {}

  @Get('feed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Feed de promociones para usuarios (solo bares con acceso SaaS válido)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'sort', required: false, enum: ['ranking', 'ending_soon', 'newest'] })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: PromotionFeedSort,
  ) {
    return this.feed.listForUsers(
      parseInt(page ?? '1', 10),
      parseInt(limit ?? '20', 10),
      sort ?? 'ranking',
    );
  }
}
