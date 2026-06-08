import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from './bar-access.service';
import { BarAccessStateResponseDto } from './dto/bar-access-state-response.dto';
import { toIso } from './mappers/bar-subscription-response.mapper';

@Injectable()
export class BarAccessStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
  ) {}

  async getStateForOwner(ownerUserId: string): Promise<BarAccessStateResponseDto> {
    const bar = await this.prisma.bar.findFirst({
      where: { ownerUserId, deletedAt: null },
      select: {
        id: true,
        businessName: true,
        ownerUserId: true,
        isActive: true,
        deletedAt: true,
      },
    });
    if (!bar) {
      throw new NotFoundException('Local no encontrado.');
    }

    const subscription = await this.prisma.barSubscription.findUnique({
      where: { barId: bar.id },
    });
    if (!subscription) {
      throw new NotFoundException('No existe suscripción para este local.');
    }

    const ctx = { bar, subscription };
    const subDecision = this.barAccess.canGenerateQr(ctx);
    const promoDecision = this.barAccess.canUsePromotions(ctx);

    return {
      barId: bar.id,
      status: subscription.status,
      plan: subscription.plan,
      qrEnabled: subscription.qrEnabled,
      promoEnabled: subscription.promoEnabled,
      trialEndsAt: toIso(subscription.trialEndsAt),
      currentPeriodEnd: toIso(subscription.currentPeriodEnd),
      access: {
        subscriptionActive: this.barAccess.isSubscriptionActive(ctx),
        canGenerateQr: subDecision.allowed,
        canUsePromotions: promoDecision.allowed,
        denialReason: subDecision.reason ?? promoDecision.reason,
        denialMessage: subDecision.message ?? promoDecision.message,
      },
    };
  }
}
