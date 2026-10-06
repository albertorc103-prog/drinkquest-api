import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { BarMissionMedalService } from './bar-mission-medal.service';
import { BarMissionMedalStatsService } from './bar-mission-medal-stats.service';
import { UpdateBarMedalDto, UpsertBarMedalDto } from './dto/bar-mission-medal.dto';

@ApiTags('bar-mission-medals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BAR)
@Controller('bars/mission-seasons/:seasonId/medal')
export class BarMissionMedalController {
  constructor(
    private readonly medals: BarMissionMedalService,
    private readonly statsService: BarMissionMedalStatsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Medalla actual de la temporada (currentMedalVersionId; no implica ACTIVE)',
  })
  get(@CurrentUser() user: JwtPayload, @Param('seasonId') seasonId: string) {
    return this.medals.getCurrent(user.sub, seasonId);
  }

  @Get('versions')
  @ApiOperation({ summary: 'Historial de versiones de medalla de la temporada' })
  versions(@CurrentUser() user: JwtPayload, @Param('seasonId') seasonId: string) {
    return this.medals.listVersions(user.sub, seasonId);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Estadísticas agregadas de la medalla de la temporada (BAR_CUSTOM_MEDAL)',
  })
  stats(@CurrentUser() user: JwtPayload, @Param('seasonId') seasonId: string) {
    return this.statsService.getSeasonStats(user.sub, seasonId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear borrador v1 de medalla (requiere BAR_CUSTOM_MEDAL)' })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('seasonId') seasonId: string,
    @Body() dto: UpsertBarMedalDto,
  ) {
    return this.medals.createDraft(user.sub, seasonId, dto);
  }

  @Post('new-version')
  @ApiOperation({ summary: 'Crear nueva versión DRAFT clonando la ACTIVE/última' })
  newVersion(@CurrentUser() user: JwtPayload, @Param('seasonId') seasonId: string) {
    return this.medals.createNextVersion(user.sub, seasonId);
  }

  @Patch(':versionId')
  @ApiOperation({ summary: 'Editar borrador DRAFT o CHANGES_REQUESTED' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('seasonId') seasonId: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateBarMedalDto,
  ) {
    return this.medals.updateDraft(user.sub, seasonId, versionId, dto);
  }

  @Post(':versionId/submit')
  @ApiOperation({ summary: 'Enviar versión a revisión administrativa' })
  submit(
    @CurrentUser() user: JwtPayload,
    @Param('seasonId') seasonId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.medals.submit(user.sub, seasonId, versionId);
  }
}
