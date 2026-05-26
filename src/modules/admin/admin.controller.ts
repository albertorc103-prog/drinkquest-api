import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportStatus, Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('analytics')
  analytics() {
    return this.admin.analytics();
  }

  @Get('users')
  users(@Query('page') page?: string) {
    return this.admin.listUsers(parseInt(page ?? '1', 10));
  }

  @Get('bars')
  bars() {
    return this.admin.listBars();
  }

  @Get('reports')
  reports(@Query('status') status?: ReportStatus) {
    return this.admin.listReports(status);
  }

  @Patch('reports/:id')
  resolve(@Param('id') id: string, @Body() body: { status: ReportStatus; adminNotes?: string }) {
    return this.admin.resolveReport(id, body.status, body.adminNotes);
  }

  @Patch('users/:id/role')
  setRole(@Param('id') id: string, @Body() body: { role: Role }) {
    return this.admin.setUserRole(id, body.role);
  }
}
