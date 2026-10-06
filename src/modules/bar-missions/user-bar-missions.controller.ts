import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { BarMissionsService } from './bar-missions.service';

@ApiTags('bar-missions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER, Role.ADMIN)
@Controller('bar-missions')
export class UserBarMissionsController {
  constructor(private readonly barMissions: BarMissionsService) {}

  @Get('active')
  @ApiOperation({
    summary:
      'Temporadas activas de bares Legend, con progreso y medalla (apartado separado de misiones globales)',
  })
  active(@CurrentUser() user: JwtPayload) {
    return this.barMissions.listActiveForUser(user.sub);
  }

  @Get('seasons/:seasonId/medal/progress')
  @ApiOperation({
    summary:
      'Progreso de la medalla ACTIVE (o histórica obtenida) de una temporada — solo usuario autenticado',
  })
  medalProgress(
    @CurrentUser() user: JwtPayload,
    @Param('seasonId') seasonId: string,
  ) {
    return this.barMissions.getSeasonMedalProgressForUser(user.sub, seasonId);
  }

  @Get('me/medals')
  @ApiOperation({
    summary:
      'Medallas de locales desbloqueadas (permanecen tras finalizar la temporada)',
  })
  medals(@CurrentUser() user: JwtPayload) {
    return this.barMissions.listMedalsForUser(user.sub);
  }
}
