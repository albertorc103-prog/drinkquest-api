import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
