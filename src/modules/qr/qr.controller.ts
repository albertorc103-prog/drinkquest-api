import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateQrDto } from './dto/create-qr.dto';
import { RedeemQrDto } from './dto/redeem-qr.dto';
import { BarsService } from '../bars/bars.service';
import { QrService } from './qr.service';

@ApiTags('qr')
@Controller('qr')
export class QrController {
  constructor(
    private readonly qr: QrService,
    private readonly bars: BarsService,
  ) {}

  @Post('sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BAR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bar: generar QR dinámico' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateQrDto) {
    return this.qr.createSession(user.sub, {
      drinkId: dto.drinkId,
      legacyDrinkId: dto.legacyDrinkId,
      specialDrinkId: dto.specialDrinkId,
    });
  }

  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario: canjear QR' })
  redeem(@CurrentUser() user: JwtPayload, @Body() dto: RedeemQrDto) {
    return this.qr.redeem(user.sub, dto);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BAR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bar: historial de escaneos' })
  async history(@CurrentUser() user: JwtPayload) {
    const bar = await this.bars.getByOwner(user.sub);
    if (!bar) return [];
    return this.qr.history(bar.id);
  }

  @Get('analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BAR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bar: estadísticas' })
  async analytics(@CurrentUser() user: JwtPayload) {
    const bar = await this.bars.getByOwner(user.sub);
    if (!bar) return { unlocksToday: 0, mostPopularDrink: '—', uniqueUsers: 0, totalScans: 0 };
    return this.qr.analytics(bar.id);
  }
}
