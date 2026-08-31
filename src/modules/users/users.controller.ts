import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SyncGamificationDto } from './dto/user-gamification.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: JwtPayload) {
    return this.users.getOwnProfileWithProgress(user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  update(@CurrentUser() user: JwtPayload, @Body() body: UpdateProfileDto) {
    return this.users.updateProfile(user.sub, body);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar la cuenta propia (soft delete, irreversible para el usuario)' })
  deleteAccount(@CurrentUser() user: JwtPayload) {
    return this.users.deleteOwnAccount(user.sub);
  }

  @Post('me/daily-login')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  recordDailyLogin(@CurrentUser() user: JwtPayload) {
    return this.users.recordDailyLogin(user.sub);
  }

  @Patch('me/gamification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  syncGamification(@CurrentUser() user: JwtPayload, @Body() body: SyncGamificationDto) {
    return this.users.syncGamification(user.sub, body);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  search(@CurrentUser() user: JwtPayload, @Query('q') q: string) {
    return this.users.search(q ?? '', user.sub);
  }

  /** Perfil social consultable (amigos / público). Ruta estática antes de :id. */
  @Get('social/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  socialProfile(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.users.getSocialProfile(id, user.sub);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  profile(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.users.getProfile(id, user.sub);
  }
}
