import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PromotionEventTheme, Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  PromotionFeedService,
  PromotionFeedSort,
  PromotionFeedThemeFilter,
} from './promotion-feed.service';

@ApiTags('promotions')
@Controller('promotions')
export class PromotionFeedController {
  constructor(private readonly feed: PromotionFeedService) {}

  @Get('feed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Feed de promociones / eventos Happy Hour (filtro theme: ALL | THEMED | CHRISTMAS | …)',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'sort', required: false, enum: ['ranking', 'ending_soon', 'newest'] })
  @ApiQuery({
    name: 'theme',
    required: false,
    description: 'ALL | THEMED | STANDARD | CHRISTMAS | NEW_YEAR | HALLOWEEN | NOCHE_MEXICANA | ANNIVERSARY',
  })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: PromotionFeedSort,
    @Query('theme') theme?: string,
  ) {
    return this.feed.listForUsers(
      parseInt(page ?? '1', 10),
      parseInt(limit ?? '20', 10),
      sort ?? 'ranking',
      this.parseTheme(theme),
    );
  }

  private parseTheme(raw?: string): PromotionFeedThemeFilter {
    const value = (raw ?? 'ALL').toUpperCase();
    if (value === 'ALL' || value === 'THEMED') return value;
    if (Object.values(PromotionEventTheme).includes(value as PromotionEventTheme)) {
      return value as PromotionEventTheme;
    }
    return 'ALL';
  }
}
