import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessStateService } from '../subscriptions/bar-access-state.service';
import { BarsService } from './bars.service';

@ApiTags('bars')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BAR)
@Controller('bars')
export class BarsController {
  constructor(
    private readonly bars: BarsService,
    private readonly prisma: PrismaService,
    private readonly accessStateService: BarAccessStateService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.bars.getByOwner(user.sub);
  }

  @Get('me/access')
  @ApiOperation({
    summary: 'Estado SaaS autoritativo del local (suscripción + flags de acceso)',
  })
  accessState(@CurrentUser() user: JwtPayload) {
    return this.accessStateService.getStateForOwner(user.sub);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.bars.dashboard(user.sub);
  }

  @Patch('me')
  update(@CurrentUser() user: JwtPayload, @Body() body: Record<string, string>) {
    return this.bars.updateProfile(user.sub, body);
  }

  @Post('menu')
  setMenu(@CurrentUser() user: JwtPayload, @Body() body: { drinkId: string; active: boolean; featured?: boolean }) {
    return this.bars.setMenuItem(user.sub, body.drinkId, body.active, body.featured);
  }

  @Post('menu/seed-default')
  async seedMenu(@CurrentUser() user: JwtPayload) {
    const bar = await this.bars.getByOwner(user.sub);
    if (!bar) return { seeded: false };
    const drinks = await this.prisma.drink.findMany({
      where: { deletedAt: null },
      orderBy: { legacyId: 'asc' },
      take: 36,
      select: { id: true },
    });
    await this.bars.seedDefaultMenu(
      bar.id,
      drinks.map((d) => d.id),
    );
    return { seeded: true, count: drinks.length };
  }
}
