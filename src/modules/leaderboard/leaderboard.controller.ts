import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('leaderboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('scope') scope?: string,
    @Query('limit') limit?: string,
  ) {
    const resolved =
      scope === 'friends' || scope === 'FRIENDS' ? 'friends' : 'global';
    return this.leaderboard.list(
      user.sub,
      resolved,
      Math.min(parseInt(limit ?? '50', 10) || 50, 100),
    );
  }
}
