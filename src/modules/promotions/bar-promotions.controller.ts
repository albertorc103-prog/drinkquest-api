import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PromotionService } from './promotion.service';

@ApiTags('bar-promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BAR)
@Controller('bars/promotions')
export class BarPromotionsController {
  private readonly logger = new Logger(BarPromotionsController.name);

  constructor(private readonly promotions: PromotionService) {}

  @Get()
  @ApiOperation({ summary: 'Listar promociones del local autenticado' })
  list(@CurrentUser() user: JwtPayload) {
    return this.promotions.listForOwner(user.sub);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePromotionDto) {
    this.logger.log(
      JSON.stringify({
        event: 'bar_promotions_create_request',
        ownerUserId: user.sub,
        title: dto.title,
        imageUrl: dto.imageUrl ?? null,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        placementType: dto.placementType ?? null,
        priority: dto.priority ?? null,
      }),
    );
    return this.promotions.createPromotion(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotions.updatePromotion(user.sub, id, dto);
  }

  @Patch(':id/activate')
  activate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.promotions.activatePromotion(user.sub, id);
  }

  @Patch(':id/pause')
  pause(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.promotions.pausePromotion(user.sub, id);
  }

  @Patch(':id/resubmit')
  resubmit(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.promotions.resubmitPromotion(user.sub, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.promotions.deletePromotion(user.sub, id);
  }
}
