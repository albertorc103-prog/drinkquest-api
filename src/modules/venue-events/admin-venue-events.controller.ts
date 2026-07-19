import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiAuthForbiddenResponses } from '../../common/decorators/api-auth-forbidden.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuthPermission } from '../auth/permissions/auth-permission.enum';
import { AdminRemoveVenueEventDto } from './dto/venue-event.dto';
import { AdminVenueEventsService } from './admin-venue-events.service';

@ApiTags('admin-venue-events')
@ApiBearerAuth()
@ApiAuthForbiddenResponses()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/venue-events')
export class AdminVenueEventsController {
  constructor(private readonly adminEvents: AdminVenueEventsService) {}

  @Get()
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Listar eventos del lugar para moderación' })
  list(
    @Query('limit') limit?: string,
    @Query('includeRemoved') includeRemoved?: string,
  ) {
    return this.adminEvents.list(
      parseInt(limit ?? '100', 10),
      includeRemoved === '1' || includeRemoved === 'true',
    );
  }

  @Patch(':id/remove')
  @RequirePermissions(AuthPermission.MODERATE_CONTENT)
  @ApiOperation({ summary: 'Retirar evento por incumplimiento de políticas' })
  remove(
    @CurrentUser() admin: JwtPayload,
    @Param('id') id: string,
    @Body() body: AdminRemoveVenueEventDto,
  ) {
    return this.adminEvents.remove(id, admin.sub, body.reason);
  }
}
