import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  CreateBarMissionSeasonDto,
  UpdateBarMissionSeasonDto,
} from './dto/bar-mission-season.dto';
import { BarMissionsService } from './bar-missions.service';

@ApiTags('bar-missions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BAR)
@Controller('bars/mission-seasons')
export class BarMissionSeasonsController {
  constructor(private readonly barMissions: BarMissionsService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Plantillas sanas disponibles para misiones del local' })
  templates() {
    return this.barMissions.listTemplates();
  }

  @Get()
  @ApiOperation({ summary: 'Listar temporadas de misiones del local (Legend)' })
  list(@CurrentUser() user: JwtPayload) {
    return this.barMissions.listSeasonsForOwner(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Crear temporada con exactamente 3 misiones' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBarMissionSeasonDto) {
    return this.barMissions.createSeason(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar temporada en borrador' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateBarMissionSeasonDto,
  ) {
    return this.barMissions.updateSeason(user.sub, id, dto);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activar temporada (finaliza la ACTIVE previa)' })
  activate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.barMissions.activateSeason(user.sub, id);
  }

  @Post(':id/end')
  @ApiOperation({ summary: 'Finalizar temporada' })
  end(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.barMissions.endSeason(user.sub, id);
  }
}
