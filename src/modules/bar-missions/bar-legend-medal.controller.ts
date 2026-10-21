import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { BarMissionMedalService } from './bar-mission-medal.service';

@ApiTags('bar-mission-medals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BAR)
@Controller('bars/legend-medal')
export class BarLegendMedalController {
  constructor(private readonly medals: BarMissionMedalService) {}

  @Get('official')
  @ApiOperation({ summary: 'Expediente de medalla Legend oficial del establecimiento' })
  officialDossier(@CurrentUser() user: JwtPayload) {
    return this.medals.getOfficialLegendMedalDossier(user.sub);
  }
}
