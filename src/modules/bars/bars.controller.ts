import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../../database/prisma.service';
import { BarStripeCheckoutService } from '../payments/bar-stripe-checkout.service';
import { CreateBarCheckoutDto } from '../payments/dto/create-bar-checkout.dto';
import { BarAccessStateService } from '../subscriptions/bar-access-state.service';
import { isExplorerPlan, normalizeSubscriptionPlan } from '../subscriptions/subscription-plan.util';
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
    private readonly stripeCheckout: BarStripeCheckoutService,
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

  @Post('subscription/checkout')
  @ApiOperation({ summary: 'Crea sesión Stripe Checkout para contratar o cambiar plan' })
  createSubscriptionCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateBarCheckoutDto,
  ) {
    return this.stripeCheckout.createCheckoutSession(user.sub, body.plan);
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
    const subscription = await this.prisma.barSubscription.findUnique({
      where: { barId: bar.id },
      select: { plan: true },
    });
    const plan = normalizeSubscriptionPlan(subscription?.plan);
    if (isExplorerPlan(plan)) {
      const assigned = await this.prisma.barMenuItem.count({
        where: { barId: bar.id, deletedAt: null, active: true },
      });
      if (assigned === 0) {
        return {
          seeded: false,
          reason: 'EXPLORER_REQUIRES_ADMIN_MENU',
          message: 'El administrador debe asignar las bebidas del catálogo para tu plan Explorer.',
        };
      }
      return { seeded: false, reason: 'EXPLORER_ADMIN_ASSIGNED', assignedCount: assigned };
    }
    const drinks = await this.prisma.drink.findMany({
      where: {
        deletedAt: null,
        legacyId: { gte: 1, lte: 100 },
        sourceSpecialDrinkId: null,
      },
      orderBy: { legacyId: 'asc' },
      take: 100,
      select: { id: true },
    });
    await this.bars.seedDefaultMenu(
      bar.id,
      drinks.map((d) => d.id),
    );
    return { seeded: true, count: drinks.length };
  }
}
