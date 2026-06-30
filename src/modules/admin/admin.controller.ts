import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportStatus, Role } from '@prisma/client';
import { ApiAuthForbiddenResponses } from '../../common/decorators/api-auth-forbidden.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuthPermission } from '../auth/permissions/auth-permission.enum';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@ApiAuthForbiddenResponses()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('analytics')
  @RequirePermissions(AuthPermission.VIEW_ANALYTICS)
  @ApiOperation({ summary: 'Métricas globales (requiere view_analytics)' })
  analytics() {
    return this.admin.analytics();
  }

  @Get('users')
  @RequirePermissions(AuthPermission.MANAGE_USERS)
  @ApiOperation({ summary: 'Listar usuarios (requiere manage_users)' })
  users(@Query('page') page?: string) {
    return this.admin.listUsers(parseInt(page ?? '1', 10));
  }

  @Get('bars')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Listar locales (requiere manage_bars)' })
  bars() {
    return this.admin.listBars();
  }

  @Get('bars/:id')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Detalle de un local con suscripción y branding' })
  bar(@Param('id') id: string) {
    return this.admin.getBar(id);
  }

  @Get('reports')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Listar reportes (requiere moderate_content)' })
  reports(@Query('status') status?: ReportStatus) {
    return this.admin.listReports(status);
  }

  @Patch('reports/:id')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Resolver reporte (requiere moderate_content)' })
  resolve(@Param('id') id: string, @Body() body: { status: ReportStatus; adminNotes?: string }) {
    return this.admin.resolveReport(id, body.status, body.adminNotes);
  }

  @Patch('users/:id/role')
  @RequirePermissions(AuthPermission.MANAGE_USERS)
  @ApiOperation({ summary: 'Cambiar rol de usuario (requiere manage_users)' })
  setRole(@Param('id') id: string, @Body() body: { role: Role }) {
    return this.admin.setUserRole(id, body.role);
  }
}
