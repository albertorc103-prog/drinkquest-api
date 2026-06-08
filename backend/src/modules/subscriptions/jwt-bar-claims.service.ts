import { Injectable } from '@nestjs/common';
import { Role, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarJwtClaims } from '../auth/interfaces/jwt-payload.interface';

/** Claims SaaS livianos para JWT de cuentas BAR (cache UX; no quotas ni analytics). */
@Injectable()
export class JwtBarClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  async buildForUser(userId: string, role: Role): Promise<BarJwtClaims> {
    if (role !== Role.BAR) return {};

    const bar = await this.prisma.bar.findFirst({
      where: { ownerUserId: userId, deletedAt: null },
      select: {
        id: true,
        subscription: {
          select: {
            status: true,
            plan: true,
            qrEnabled: true,
            promoEnabled: true,
          },
        },
      },
    });
    if (!bar) return {};

    const sub = bar.subscription;
    if (!sub) {
      return { barId: bar.id };
    }

    return {
      barId: bar.id,
      subscriptionStatus: sub.status,
      subscriptionPlan: sub.plan,
      qrEnabled: sub.qrEnabled,
      promoEnabled: sub.promoEnabled,
    };
  }
}
