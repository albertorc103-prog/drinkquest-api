import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiAuthForbiddenResponses } from '../../common/decorators/api-auth-forbidden.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuthPermission } from '../auth/permissions/auth-permission.enum';
import { AdminRejectRooftopDto, AdminRejectRooftopPackageDto } from './dto/admin-rooftop.dto';
import { AdminRooftopService } from './admin-rooftop.service';

@ApiTags('admin-rooftop')
@ApiBearerAuth()
@ApiAuthForbiddenResponses()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/rooftop')
export class AdminRooftopController {
  constructor(private readonly adminRooftop: AdminRooftopService) {}

  @Get('verifications/pending')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Bares Legend pendientes de verificación de terraza/jardín' })
  pendingVerifications(@Query('limit') limit?: string) {
    return this.adminRooftop.listPendingVerifications(parseInt(limit ?? '100', 10));
  }

  @Patch('bars/:barId/approve')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Aprobar terraza/jardín del local' })
  approveBar(@CurrentUser() admin: JwtPayload, @Param('barId') barId: string) {
    return this.adminRooftop.approveVerification(barId, admin.sub);
  }

  @Patch('bars/:barId/reject')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Rechazar verificación de terraza/jardín' })
  rejectBar(
    @CurrentUser() admin: JwtPayload,
    @Param('barId') barId: string,
    @Body() body: AdminRejectRooftopDto,
  ) {
    return this.adminRooftop.rejectVerification(barId, admin.sub, body.reason);
  }

  @Get('packages/pending')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Paquetes Rooftop pendientes de revisión' })
  pendingPackages(@Query('limit') limit?: string) {
    return this.adminRooftop.listPendingPackages(parseInt(limit ?? '100', 10));
  }

  @Patch('packages/:id/approve')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Aprobar paquete Rooftop' })
  approvePackage(@CurrentUser() admin: JwtPayload, @Param('id') id: string) {
    return this.adminRooftop.approvePackage(id, admin.sub);
  }

  @Patch('packages/:id/reject')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Rechazar paquete Rooftop' })
  rejectPackage(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() body: AdminRejectRooftopPackageDto,
  ) {
    return this.adminRooftop.rejectPackage(id, admin.sub, body.reason);
  }

  @Patch('packages/:id/flag')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Marcar paquete Rooftop' })
  flagPackage(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() body: AdminRejectRooftopPackageDto,
  ) {
    return this.adminRooftop.flagPackage(id, admin.sub, body.reason);
  }
}
