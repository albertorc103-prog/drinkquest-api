import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SpecialDrinksFeedService } from './special-drinks-feed.service';

@ApiTags('special-drinks')
@Controller('special-drinks')
export class SpecialDrinksFeedController {
  constructor(private readonly feed: SpecialDrinksFeedService) {}

  @Get('feed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Feed de cócteles de autor (bebidas especializadas aprobadas) para usuarios',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.feed.listForUsers(
      parseInt(page ?? '1', 10),
      parseInt(limit ?? '20', 10),
    );
  }
}
