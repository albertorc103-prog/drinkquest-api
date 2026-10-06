import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { BarMissionMedalPublicService } from './bar-mission-medal-public.service';

@ApiTags('bar-medals-public')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER, Role.ADMIN)
@Controller('bars')
export class PublicBarMedalController {
  constructor(private readonly publicMedals: BarMissionMedalPublicService) {}

  @Get(':barId/medal')
  @ApiOperation({
    summary: 'Medalla ACTIVE pública del bar (sin metadata admin / review)',
  })
  getMedal(@Param('barId') barId: string) {
    return this.publicMedals.getPublicBarMedal(barId);
  }

  @Get(':barId/medal/progress')
  @ApiOperation({
    summary: 'Progreso del usuario autenticado hacia la medalla del bar',
  })
  progress(@CurrentUser() user: JwtPayload, @Param('barId') barId: string) {
    return this.publicMedals.getProgressByBarId(user.sub, barId);
  }
}

@ApiTags('user-bar-medals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER, Role.ADMIN)
@Controller('users/me/bar-medals')
export class UserBarMedalsController {
  constructor(private readonly publicMedals: BarMissionMedalPublicService) {}

  @Get()
  @ApiOperation({ summary: 'Medallas de locales obtenidas (paginado, unlockedAt DESC)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.publicMedals.listMyBarMedals(
      user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':userBarMedalId')
  @ApiOperation({ summary: 'Detalle histórico de una medalla obtenida (solo owner)' })
  detail(
    @CurrentUser() user: JwtPayload,
    @Param('userBarMedalId') userBarMedalId: string,
  ) {
    return this.publicMedals.getMyBarMedalDetail(user.sub, userBarMedalId);
  }
}
