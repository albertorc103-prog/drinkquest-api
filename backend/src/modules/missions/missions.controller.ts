import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { MissionsService } from './missions.service';

@ApiTags('missions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.missions.listForUser(user.sub);
  }

  @Get('achievements')
  achievements(@CurrentUser() user: JwtPayload) {
    return this.missions.achievements(user.sub);
  }

  @Post(':id/claim')
  claim(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.missions.claim(user.sub, id);
  }
}
