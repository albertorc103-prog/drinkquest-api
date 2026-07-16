import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiAuthForbiddenResponses } from '../../common/decorators/api-auth-forbidden.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuthPermission } from '../auth/permissions/auth-permission.enum';
import { AdminRejectSpecialDrinkDto } from './dto/admin-reject-special-drink.dto';
import { AdminSpecialDrinksService } from './admin-special-drinks.service';

@ApiTags('admin-special-drinks')
@ApiBearerAuth()
@ApiAuthForbiddenResponses()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/special-drinks')
export class AdminSpecialDrinksController {
  constructor(private readonly moderation: AdminSpecialDrinksService) {}

  @Get('pending')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Bebidas especializadas pendientes de revisión' })
  pending(@Query('limit') limit?: string) {
    return this.moderation.listPending(parseInt(limit ?? '100', 10));
  }

  @Patch(':id/approve')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Aprobar bebida especializada' })
  approve(@CurrentUser() admin: JwtPayload, @Param('id') id: string) {
    return this.moderation.approve(id, admin.sub);
  }

  @Patch(':id/reject')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Rechazar bebida especializada' })
  reject(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() body: AdminRejectSpecialDrinkDto,
  ) {
    return this.moderation.reject(id, admin.sub, body.reason);
  }

  @Patch(':id/flag')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Marcar bebida especializada para revisión' })
  flag(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() body: AdminRejectSpecialDrinkDto,
  ) {
    return this.moderation.flag(id, admin.sub, body.reason);
  }
}
