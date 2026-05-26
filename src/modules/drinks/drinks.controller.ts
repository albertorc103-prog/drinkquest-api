import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DrinksQueryDto } from './dto/drinks-query.dto';
import { DrinksService } from './drinks.service';

@ApiTags('drinks')
@Controller('drinks')
export class DrinksController {
  constructor(private readonly drinks: DrinksService) {}

  @Get()
  list(@Query() query: DrinksQueryDto) {
    return this.drinks.list({
      categoryId: query.categoryId,
      rarity: query.rarity,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Get('categories')
  categories() {
    return this.drinks.categories();
  }

  @Get('me/favorites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  favorites(@CurrentUser() user: JwtPayload) {
    return this.drinks.favorites(user.sub);
  }

  @Post('me/favorites/:drinkId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  toggleFavorite(@CurrentUser() user: JwtPayload, @Param('drinkId') drinkId: string) {
    return this.drinks.toggleFavorite(user.sub, drinkId);
  }

  @Get('me/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  history(@CurrentUser() user: JwtPayload, @Query('page') page?: string) {
    return this.drinks.history(user.sub, parseInt(page ?? '1', 10));
  }

  @Get('me/unlocks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  unlocks(@CurrentUser() user: JwtPayload) {
    return this.drinks.unlocks(user.sub);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.drinks.getById(id);
  }
}
