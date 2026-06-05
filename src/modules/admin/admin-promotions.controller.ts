import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiAuthForbiddenResponses } from '../../common/decorators/api-auth-forbidden.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuthPermission } from '../auth/permissions/auth-permission.enum';
import { AdminModerationActionDto } from '../promotions/dto/admin-moderation-action.dto';
import { AdminRejectPromotionDto } from '../promotions/dto/admin-reject-promotion.dto';
import { AdminPromotionModerationService } from '../promotions/admin-promotion-moderation.service';

@ApiTags('admin-promotions')
@ApiBearerAuth()
@ApiAuthForbiddenResponses()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/promotions')
export class AdminPromotionsController {
  constructor(private readonly moderation: AdminPromotionModerationService) {}

  @Get('pending')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Promociones pendientes (requiere moderate_content)' })
  pending(@Query('limit') limit?: string) {
    return this.moderation.listPending(parseInt(limit ?? '100', 10));
  }

  @Get('feed-debug')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({
    summary: 'Diagnóstico feed: últimas promociones y si pasan filtro ACTIVE+APPROVED+fechas+suscripción',
  })
  feedDebug(@Query('limit') limit?: string) {
    return this.moderation.listRecentForFeedDebug(parseInt(limit ?? '15', 10));
  }

  @Get(':id/feed-debug')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Diagnóstico feed para una promoción por id' })
  feedDebugOne(@Param('id') id: string) {
    return this.moderation.inspectFeedEligibility(id);
  }

  @Patch(':id/approve')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Aprobar promoción (requiere moderate_content)' })
  approve(@CurrentUser() admin: JwtPayload, @Param('id') id: string) {
    return this.moderation.approve(id, admin.sub);
  }

  @Patch(':id/reject')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Rechazar promoción (requiere moderate_content)' })
  reject(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() body: AdminRejectPromotionDto,
  ) {
    return this.moderation.reject(id, admin.sub, body.reason);
  }

  @Patch(':id/flag')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Marcar promoción (requiere moderate_content)' })
  flag(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() body: AdminModerationActionDto,
  ) {
    return this.moderation.flag(id, admin.sub, body.reason?.trim() || 'Marcada para revisión');
  }
}
