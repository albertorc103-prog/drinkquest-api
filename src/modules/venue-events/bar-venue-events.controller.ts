import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  ActivateVenueEventDto,
  CreateVenueEventDto,
  UpdateVenueEventDto,
} from './dto/venue-event.dto';
import { VenueEventsService } from './venue-events.service';

@ApiTags('bar-venue-events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BAR)
@Controller('bars/venue-events')
export class BarVenueEventsController {
  constructor(private readonly events: VenueEventsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar eventos del lugar (Legend)' })
  list(@CurrentUser() user: JwtPayload) {
    return this.events.listForOwner(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Crear borrador de evento del lugar' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateVenueEventDto) {
    return this.events.create(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar evento del lugar' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateVenueEventDto,
  ) {
    return this.events.update(user.sub, id, dto);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Publicar evento (requiere aceptar políticas)' })
  activate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ActivateVenueEventDto,
  ) {
    return this.events.activate(user.sub, id, dto);
  }

  @Patch(':id/pause')
  @ApiOperation({ summary: 'Pausar evento activo (vuelve a borrador)' })
  pause(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.events.pause(user.sub, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar (soft delete) evento del lugar' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.events.softDelete(user.sub, id);
  }
}
