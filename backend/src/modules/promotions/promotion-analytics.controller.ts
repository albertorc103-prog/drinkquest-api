import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PromotionAnalyticsEventType, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TrackPromotionEventDto } from './dto/track-promotion-event.dto';
import { PromotionAnalyticsService } from './promotion-analytics.service';

@ApiTags('promotions-analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
@Controller('promotions')
export class PromotionAnalyticsController {
  constructor(private readonly analytics: PromotionAnalyticsService) {}

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
    return this.analytics.trackEvent(id, PromotionAnalyticsEventType.QR_SCAN, user.sub, body.metadata);
  }
}

