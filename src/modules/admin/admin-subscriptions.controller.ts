import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AdminSubscriptionsService } from '../subscriptions/admin-subscriptions.service';
import { AdminActivateSubscriptionDto } from '../subscriptions/dto/admin-activate-subscription.dto';
import { AdminExtendTrialDto } from '../subscriptions/dto/admin-extend-trial.dto';
import { AdminSubscriptionActionDto } from '../subscriptions/dto/admin-subscription-action.dto';

@ApiTags('admin-subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('admin/bars')
export class AdminSubscriptionsController {
  constructor(private readonly adminSubscriptions: AdminSubscriptionsService) {}

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activa o reactiva la suscripción del local' })
  activate(
    @CurrentUser() admin: JwtPayload,
    @Param('id') barId: string,
    @Body() dto: AdminActivateSubscriptionDto,
  ) {
    return this.adminSubscriptions.activateSubscription(barId, admin.sub, dto);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspende la suscripción del local' })
  suspend(
    @CurrentUser() admin: JwtPayload,
    @Param('id') barId: string,
    @Body() dto: AdminSubscriptionActionDto,
  ) {
    return this.adminSubscriptions.suspendSubscription(barId, admin.sub, dto.reason);
  }

  @Patch(':id/trial/extend')
  @ApiOperation({ summary: 'Extiende el periodo de prueba' })
  extendTrial(
    @CurrentUser() admin: JwtPayload,
    @Param('id') barId: string,
    @Body() dto: AdminExtendTrialDto,
  ) {
    return this.adminSubscriptions.extendTrial(barId, admin.sub, dto.days, dto.reason);
  }

  @Patch(':id/qr/enable')
  enableQr(
    @CurrentUser() admin: JwtPayload,
    @Param('id') barId: string,
    @Body() dto: AdminSubscriptionActionDto,
  ) {
    return this.adminSubscriptions.enableQr(barId, admin.sub, dto.reason);
  }

  @Patch(':id/qr/disable')
  disableQr(
    @CurrentUser() admin: JwtPayload,
    @Param('id') barId: string,
    @Body() dto: AdminSubscriptionActionDto,
  ) {
    return this.adminSubscriptions.disableQr(barId, admin.sub, dto.reason);
  }

  @Patch(':id/promotions/enable')
  enablePromotions(
    @CurrentUser() admin: JwtPayload,
    @Param('id') barId: string,
    @Body() dto: AdminSubscriptionActionDto,
  ) {
    return this.adminSubscriptions.enablePromotions(barId, admin.sub, dto.reason);
  }

  @Patch(':id/promotions/disable')
  disablePromotions(
    @CurrentUser() admin: JwtPayload,
    @Param('id') barId: string,
    @Body() dto: AdminSubscriptionActionDto,
  ) {
    return this.adminSubscriptions.disablePromotions(barId, admin.sub, dto.reason);
  }
}
