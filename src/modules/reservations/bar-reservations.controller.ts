import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { BarReservationActionDto } from './dto/reservation.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('bar-reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BAR)
@Controller('bars/reservations')
export class BarReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar reservas del local (Legend)' })
  list(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.reservations.listForBarOwner(user.sub, status);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Confirmar reserva' })
  confirm(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: BarReservationActionDto,
  ) {
    return this.reservations.confirm(user.sub, id, body.barResponse);
  }

  @Patch(':id/decline')
  @ApiOperation({ summary: 'Rechazar reserva' })
  decline(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: BarReservationActionDto,
  ) {
    return this.reservations.decline(user.sub, id, body.barResponse);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Marcar reserva como completada' })
  complete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reservations.complete(user.sub, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar reserva desde el local' })
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: BarReservationActionDto,
  ) {
    return this.reservations.cancelByBar(user.sub, id, body.barResponse);
  }
}
