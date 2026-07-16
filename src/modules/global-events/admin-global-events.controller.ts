import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiAuthForbiddenResponses } from '../../common/decorators/api-auth-forbidden.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuthPermission } from '../auth/permissions/auth-permission.enum';
import {
  CreateGlobalEventDto,
  SetGlobalEventBarsDto,
  UpdateGlobalEventDto,
} from './dto/global-event.dto';
import { GlobalEventsService } from './global-events.service';

@ApiTags('admin-global-events')
@ApiBearerAuth()
@ApiAuthForbiddenResponses()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/global-events')
export class AdminGlobalEventsController {
  constructor(private readonly globalEvents: GlobalEventsService) {}

  @Get('eligible-bars')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Bares Legend elegibles para el pool del evento' })
  eligibleBars() {
    return this.globalEvents.listEligibleLegendBars();
  }

  @Get()
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Listar eventos globales DrinkQuest' })
  list() {
    return this.globalEvents.listForAdmin();
  }

  @Post()
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Crear evento global (pool de bares Legend)' })
  create(@CurrentUser() admin: JwtPayload, @Body() dto: CreateGlobalEventDto) {
    return this.globalEvents.create(admin.sub, dto);
  }

  @Patch(':id')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Editar evento global' })
  update(@Param('id') id: string, @Body() dto: UpdateGlobalEventDto) {
    return this.globalEvents.update(id, dto);
  }

  @Put(':id/bars')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Reemplazar pool de bares Legend' })
  setBars(@Param('id') id: string, @Body() dto: SetGlobalEventBarsDto) {
    return this.globalEvents.setBars(id, dto);
  }

  @Post(':id/activate')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Activar evento global' })
  activate(@Param('id') id: string) {
    return this.globalEvents.activate(id);
  }

  @Post(':id/end')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Finalizar evento global' })
  end(@Param('id') id: string) {
    return this.globalEvents.end(id);
  }

  @Delete(':id')
  @RequirePermissions(AuthPermission.MANAGE_BARS)
  @ApiOperation({ summary: 'Eliminar (soft) evento global' })
  remove(@Param('id') id: string) {
    return this.globalEvents.softDelete(id);
  }
}
