import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessDeniedException } from './exceptions/bar-access-denied.exception';
import {
  evaluatePromotionsAccess,
  evaluateQrAccess,
  evaluateSubscriptionActive,
} from './bar-access.rules';
import { BarAccessContext } from './interfaces/bar-access-context.interface';
import { AccessDecision } from './interfaces/access-decision.interface';

@Injectable()
export class BarAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Carga bar + suscripción por id de local. */
  async resolveByBarId(barId: string): Promise<BarAccessContext> {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null, isActive: true },
      select: {
        id: true,
        ownerUserId: true,
        businessName: true,
        isActive: true,
        deletedAt: true,
      },
    });
    if (!bar) {
      throw new ForbiddenException('Local no encontrado o no autorizado.');
    }
    const subscription = await this.prisma.barSubscription.findUnique({ where: { barId } });
    return { bar, subscription };
  }

  /** Carga bar + suscripción por dueño (flujo QR del negocio). */
  async resolveByOwnerUserId(ownerUserId: string): Promise<BarAccessContext> {
    const bar = await this.prisma.bar.findFirst({
      where: { ownerUserId, deletedAt: null, isActive: true },
      select: {
        id: true,
        ownerUserId: true,
        businessName: true,
        isActive: true,
        deletedAt: true,
      },
    });
    if (!bar) {
      throw new ForbiddenException('Bar no autorizado');
    }
    const subscription = await this.prisma.barSubscription.findUnique({ where: { barId: bar.id } });
    return { bar, subscription };
  }

  isSubscriptionActive(ctx: BarAccessContext, now?: Date): boolean {
    return evaluateSubscriptionActive(ctx.subscription, now).allowed;
  }

  canGenerateQr(ctx: BarAccessContext, now?: Date): AccessDecision {
    return evaluateQrAccess(ctx.subscription, now);
  }

  canUsePromotions(ctx: BarAccessContext, now?: Date): AccessDecision {
    return evaluatePromotionsAccess(ctx.subscription, now);
  }

  assertCanGenerateQr(ctx: BarAccessContext, now?: Date): void {
    this.throwIfDenied(this.canGenerateQr(ctx, now));
  }

  assertCanUsePromotions(ctx: BarAccessContext, now?: Date): void {
    this.throwIfDenied(this.canUsePromotions(ctx, now));
  }

  /** Atajo: resuelve por dueño y valida QR en un solo paso. */
  async assertOwnerCanGenerateQr(ownerUserId: string): Promise<BarAccessContext> {
    const ctx = await this.resolveByOwnerUserId(ownerUserId);
    this.assertCanGenerateQr(ctx);
    return ctx;
  }

  /** Atajo: resuelve por dueño y valida promociones en un solo paso. */
  async assertOwnerCanUsePromotions(ownerUserId: string): Promise<BarAccessContext> {
    const ctx = await this.resolveByOwnerUserId(ownerUserId);
    this.assertCanUsePromotions(ctx);
    return ctx;
  }

  private throwIfDenied(decision: AccessDecision): void {
    if (decision.allowed || !decision.reason || !decision.message) return;
    throw new BarAccessDeniedException(decision.reason, decision.message);
  }
}
