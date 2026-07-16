import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateReservationDto } from './dto/reservation.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
@Controller('reservations')
export class UserReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('bars')
  @ApiOperation({ summary: 'Bares Legend que aceptan reservas de mesa' })
  bookableBars() {
    return this.reservations.listBookableBars();
  }

  @Get('me')
  @ApiOperation({ summary: 'Mis reservas de mesa' })
  mine(@CurrentUser() user: JwtPayload) {
    return this.reservations.listForUser(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Crear reserva (nombre, personas, fecha; sin depósito)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateReservationDto) {
    return this.reservations.create(user.sub, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar mi reserva' })
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reservations.cancelByUser(user.sub, id);
  }
}
