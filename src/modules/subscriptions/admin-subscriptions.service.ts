import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  SubscriptionEventType,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from './bar-access.service';
import { BarSubscriptionService } from './bar-subscription.service';
import { AdminActivateSubscriptionDto } from './dto/admin-activate-subscription.dto';
import { BarSubscriptionAdminResponseDto } from './dto/bar-subscription-response.dto';
import { SubscriptionChangeContext } from './interfaces/subscription-change-context.interface';
import { buildAdminResponse } from './mappers/bar-subscription-response.mapper';
import {
  normalizeSubscriptionPlan,
  promotionsEnabledForPlan,
} from './subscription-plan.util';

@Injectable()
export class AdminSubscriptionsService {
  private readonly logger = new Logger(AdminSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: BarSubscriptionService,
    private readonly barAccess: BarAccessService,
  ) {}

  async activateSubscription(
    barId: string,
    adminId: string,
    dto?: AdminActivateSubscriptionDto,
  ): Promise<BarSubscriptionAdminResponseDto> {
    const current = await this.loadBarSubscription(barId);
    const { bar, sub } = current;
    const ctx = this.adminCtx(adminId, dto?.reason);

    if (sub.status === SubscriptionStatus.SUSPENDED || sub.status === SubscriptionStatus.CANCELED) {
      return this.reactivateSubscription(barId, adminId, dto);
    }

    if (sub.status === SubscriptionStatus.ACTIVE) {
      throw new BadRequestException('La suscripción ya está activa.');
    }

    const periodDays = dto?.periodDays ?? 30;
    const periodEnd = this.subscriptions.addDays(new Date(), periodDays);
    const plan = dto?.plan ? normalizeSubscriptionPlan(dto.plan) : normalizeSubscriptionPlan(sub.plan);

    const updated = await this.subscriptions.mutate(
      barId,
      {
        status: SubscriptionStatus.ACTIVE,
        plan,
        currentPeriodEnd: periodEnd,
        canceledAt: null,
        qrEnabled: true,
        promoEnabled: promotionsEnabledForPlan(plan),
      },
      ctx,
      { eventType: SubscriptionEventType.ACTIVATED, statusChange: true },
      sub,
    );
    this.logger.log(JSON.stringify({ event: 'subscription_activate', barId, adminId }));
    return this.toResponse(bar, updated);
  }

  async suspendSubscription(
    barId: string,
    adminId: string,
    reason?: string,
  ): Promise<BarSubscriptionAdminResponseDto> {
    const { bar, sub } = await this.loadBarSubscription(barId);
    if (sub.status === SubscriptionStatus.SUSPENDED) {
      throw new BadRequestException('La suscripción ya está suspendida.');
    }
    if (sub.status === SubscriptionStatus.CANCELED) {
      throw new BadRequestException('No se puede suspender una suscripción cancelada.');
    }

    const updated = await this.subscriptions.mutate(
      barId,
      {
        status: SubscriptionStatus.SUSPENDED,
        qrEnabled: false,
        promoEnabled: false,
      },
      this.adminCtx(adminId, reason),
      { eventType: SubscriptionEventType.SUSPENDED, statusChange: true },
      sub,
    );
    this.logger.log(JSON.stringify({ event: 'subscription_suspend', barId, adminId }));
    return this.toResponse(bar, updated);
  }

  async reactivateSubscription(
    barId: string,
    adminId: string,
    dto?: AdminActivateSubscriptionDto,
  ): Promise<BarSubscriptionAdminResponseDto> {
    const { bar, sub } = await this.loadBarSubscription(barId);

    if (sub.status !== SubscriptionStatus.SUSPENDED && sub.status !== SubscriptionStatus.CANCELED) {
      throw new BadRequestException(
        'Solo se puede reactivar una suscripción suspendida o cancelada.',
      );
    }

    const periodDays = dto?.periodDays ?? 30;
    const periodEnd = this.subscriptions.addDays(new Date(), periodDays);
    const plan = dto?.plan ? normalizeSubscriptionPlan(dto.plan) : normalizeSubscriptionPlan(sub.plan);

    const updated = await this.subscriptions.mutate(
      barId,
      {
        status: SubscriptionStatus.ACTIVE,
        plan,
        currentPeriodEnd: periodEnd,
        canceledAt: null,
        qrEnabled: true,
        promoEnabled: promotionsEnabledForPlan(plan),
      },
      this.adminCtx(adminId, dto?.reason),
      { eventType: SubscriptionEventType.REACTIVATED, statusChange: true },
      sub,
    );
    this.logger.log(JSON.stringify({ event: 'subscription_reactivate', barId, adminId }));
    return this.toResponse(bar, updated);
  }

  async extendTrial(
    barId: string,
    adminId: string,
    days: number,
    reason?: string,
  ): Promise<BarSubscriptionAdminResponseDto> {
    const { bar, sub } = await this.loadBarSubscription(barId);

    if (sub.status === SubscriptionStatus.CANCELED || sub.canceledAt) {
      throw new BadRequestException('No se puede extender el trial de una suscripción cancelada.');
    }
    if (sub.status === SubscriptionStatus.ACTIVE) {
      throw new BadRequestException(
        'Solo se puede extender el trial mientras el local está en periodo de prueba.',
      );
    }

    const base = sub.trialEndsAt ?? sub.currentPeriodEnd ?? new Date();
    const trialEndsAt = this.subscriptions.addDays(base, days);
    const currentPeriodEnd =
      sub.currentPeriodEnd && sub.currentPeriodEnd > base
        ? this.subscriptions.addDays(sub.currentPeriodEnd, days)
        : trialEndsAt;

    const updated = await this.subscriptions.mutate(
      barId,
      {
        status: SubscriptionStatus.TRIAL,
        trialEndsAt,
        currentPeriodEnd,
        canceledAt: null,
      },
      this.adminCtx(adminId, reason),
      {
        eventType: SubscriptionEventType.TRIAL_EXTENDED,
        statusChange: sub.status !== SubscriptionStatus.TRIAL,
        payload: { days },
      },
      sub,
    );

    return this.toResponse(bar, updated);
  }

  async enableQr(
    barId: string,
    adminId: string,
    reason?: string,
  ): Promise<BarSubscriptionAdminResponseDto> {
    const { bar, sub } = await this.loadBarSubscription(barId);
    if (sub.qrEnabled) {
      throw new BadRequestException('El QR ya está habilitado.');
    }
    const updated = await this.subscriptions.mutate(
      barId,
      { qrEnabled: true },
      this.adminCtx(adminId, reason),
      { eventType: SubscriptionEventType.QR_ENABLED },
      sub,
    );
    return this.toResponse(bar, updated);
  }

  async disableQr(
    barId: string,
    adminId: string,
    reason?: string,
  ): Promise<BarSubscriptionAdminResponseDto> {
    const { bar, sub } = await this.loadBarSubscription(barId);
    if (!sub.qrEnabled) {
      throw new BadRequestException('El QR ya está deshabilitado.');
    }
    const updated = await this.subscriptions.mutate(
      barId,
      { qrEnabled: false },
      this.adminCtx(adminId, reason),
      { eventType: SubscriptionEventType.QR_DISABLED },
      sub,
    );
    return this.toResponse(bar, updated);
  }

  async enablePromotions(
    barId: string,
    adminId: string,
    reason?: string,
  ): Promise<BarSubscriptionAdminResponseDto> {
    const { bar, sub } = await this.loadBarSubscription(barId);
    if (sub.promoEnabled) {
      throw new BadRequestException('Las promociones ya están habilitadas.');
    }
    const updated = await this.subscriptions.mutate(
      barId,
      { promoEnabled: true },
      this.adminCtx(adminId, reason),
      { eventType: SubscriptionEventType.PROMO_ENABLED },
      sub,
    );
    return this.toResponse(bar, updated);
  }

  async disablePromotions(
    barId: string,
    adminId: string,
    reason?: string,
  ): Promise<BarSubscriptionAdminResponseDto> {
    const { bar, sub } = await this.loadBarSubscription(barId);
    if (!sub.promoEnabled) {
      throw new BadRequestException('Las promociones ya están deshabilitadas.');
    }
    const updated = await this.subscriptions.mutate(
      barId,
      { promoEnabled: false },
      this.adminCtx(adminId, reason),
      { eventType: SubscriptionEventType.PROMO_DISABLED },
      sub,
    );
    return this.toResponse(bar, updated);
  }

  private adminCtx(adminId: string, reason?: string): SubscriptionChangeContext {
    return { actorUserId: adminId, actorSource: 'admin', reason };
  }

  private async loadBarSubscription(barId: string) {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null },
      select: {
        id: true,
        businessName: true,
        ownerUserId: true,
        isActive: true,
        deletedAt: true,
      },
    });
    if (!bar) {
      throw new NotFoundException('Local no encontrado o eliminado.');
    }
    if (!bar.isActive) {
      throw new BadRequestException('No se puede gestionar un local inactivo.');
    }

    const sub = await this.subscriptions.requireSubscription(barId);
    return { bar, sub };
  }

  private toResponse(
    bar: {
      id: string;
      businessName: string;
      ownerUserId: string;
      isActive: boolean;
      deletedAt: Date | null;
    },
    subscription: Awaited<ReturnType<BarSubscriptionService['mutate']>>,
  ): BarSubscriptionAdminResponseDto {
    return buildAdminResponse(bar, subscription, this.barAccess);
  }
}
