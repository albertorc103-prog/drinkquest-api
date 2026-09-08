import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PromotionAnalyticsEventType, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TrackPromotionEventDto } from './dto/track-promotion-event.dto';
import { PromotionActivationService } from './promotion-activation.service';
import { PromotionAnalyticsService } from './promotion-analytics.service';

@ApiTags('promotions-analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
@Controller('promotions')
export class PromotionAnalyticsController {
  constructor(
    private readonly analytics: PromotionAnalyticsService,
    private readonly activations: PromotionActivationService,
  ) {}

  @Get('me/active')
  @ApiOperation({ summary: 'Promociones activas del usuario (escaneadas y vigentes)' })
  listActive(@CurrentUser() user: JwtPayload) {
    return this.activations.listActiveForUser(user.sub);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activar promoción escaneando su QR (otorga XP una vez)' })
  activate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.activations.activateByQr(user.sub, id);
  }

  @Post(':id/impression')
  impression(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: TrackPromotionEventDto,
  ) {
    return this.analytics.trackEvent(id, PromotionAnalyticsEventType.IMPRESSION, user.sub, body.metadata);
  }

  @Post(':id/open')
  open(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: TrackPromotionEventDto,
  ) {
    return this.analytics.trackEvent(id, PromotionAnalyticsEventType.OPEN, user.sub, body.metadata);
  }

  @Post(':id/qr-scan')
  qrScan(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: TrackPromotionEventDto,
  ) {
    // Compat: el escaneo de QR ahora activa la promo (XP + contador único).
    return this.activations.activateByQr(user.sub, id);
  }
}
