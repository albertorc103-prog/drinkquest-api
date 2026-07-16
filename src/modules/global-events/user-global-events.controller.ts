import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { GlobalEventsService } from './global-events.service';

@ApiTags('global-events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class UserGlobalEventsController {
  constructor(private readonly globalEvents: GlobalEventsService) {}

  @Get('global-events/active')
  @Roles(Role.USER)
  @ApiOperation({ summary: 'Eventos globales activos con progreso del usuario' })
  active(@CurrentUser() user: JwtPayload) {
    return this.globalEvents.listActiveForUser(user.sub);
  }

  @Get('global-events/medals')
  @Roles(Role.USER)
  @ApiOperation({ summary: 'Medallas de eventos globales del usuario' })
  medals(@CurrentUser() user: JwtPayload) {
    return this.globalEvents.listMedalsForUser(user.sub);
  }

  @Get('bars/global-events')
  @Roles(Role.BAR)
  @ApiOperation({ summary: 'Eventos globales en los que participa este bar Legend' })
  forBar(@CurrentUser() user: JwtPayload) {
    return this.globalEvents.listForBarOwner(user.sub);
  }
}
