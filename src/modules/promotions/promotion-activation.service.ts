import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  PromotionAnalyticsEventType,
  PromotionApprovalStatus,
  PromotionStatus,
} from '@prisma/client';
import { levelFromTotalXp } from '../../common/utils/level-from-xp.util';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** XP al activar una promoción Happy Hour por QR (única vez por usuario/promo). */
export const PROMOTION_QR_XP_REWARD = 25;
/** Ventana en que la promo queda “activa” para el usuario tras escanear el QR. */
export const PROMOTION_ACTIVATION_TTL_MS = 5 * 60 * 60 * 1000;
/** Máximo de promociones activas a la vez, cada una de un bar distinto. */
export const MAX_ACTIVE_PROMOTIONS_FROM_DISTINCT_BARS = 3;

export interface PromotionActivationResultDto {
  promotionId: string;
  title: string;
  barId: string;
  businessName: string;
  imageUrl: string | null;
  xpEarned: number;
  totalXp: number;
  activatedAt: string;
  expiresAt: string;
  alreadyActive: boolean;
}

export interface ActiveUserPromotionDto {
  promotionId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  barId: string;
  businessName: string;
  barLogoUrl: string | null;
  xpEarned: number;
  activatedAt: string;
  expiresAt: string;
}

@Injectable()
export class PromotionActivationService {
  private readonly logger = new Logger(PromotionActivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async activateByQr(userId: string, promotionId: string): Promise<PromotionActivationResultDto> {
    const now = new Date();
    const promo = await this.prisma.barPromotion.findFirst({
      where: {
        id: promotionId,
        status: PromotionStatus.ACTIVE,
        approvalStatus: PromotionApprovalStatus.APPROVED,
        startsAt: { lte: now },
        endsAt: { gt: now },
        bar: { deletedAt: null, isActive: true },
      },
      include: {
        bar: { select: { id: true, businessName: true, logoUrl: true } },
      },
    });
    if (!promo) {
      throw new NotFoundException('Promoción no disponible para activar.');
    }

    const existing = await this.prisma.userPromotionActivation.findUnique({
      where: { userId_promotionId: { userId, promotionId: promo.id } },
    });
    if (existing && existing.expiresAt > now) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { totalXp: true },
      });
      return {
        promotionId: promo.id,
        title: promo.title,
        barId: promo.barId,
        businessName: promo.bar.businessName,
        imageUrl: promo.imageUrl,
        xpEarned: 0,
        totalXp: user?.totalXp ?? 0,
        activatedAt: existing.activatedAt.toISOString(),
        expiresAt: existing.expiresAt.toISOString(),
        alreadyActive: true,
      };
    }

    const activationExpiresAt = new Date(
      Math.min(now.getTime() + PROMOTION_ACTIVATION_TTL_MS, promo.endsAt.getTime()),
    );
    if (activationExpiresAt <= now) {
      throw new BadRequestException('Esta promoción ya no está vigente.');
    }

    await this.assertCanClaimActivationSlot(userId, promo.barId, now);

    // Misma promo ya caducada: renovar ventana de 5 h (sin XP extra).
    if (existing) {
      const updated = await this.prisma.userPromotionActivation.update({
        where: { id: existing.id },
        data: {
          activatedAt: now,
          expiresAt: activationExpiresAt,
        },
      });
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { totalXp: true },
      });
      return {
        promotionId: promo.id,
        title: promo.title,
        barId: promo.barId,
        businessName: promo.bar.businessName,
        imageUrl: promo.imageUrl,
        xpEarned: 0,
        totalXp: user?.totalXp ?? 0,
        activatedAt: updated.activatedAt.toISOString(),
        expiresAt: updated.expiresAt.toISOString(),
        alreadyActive: false,
      };
    }

    const xp = PROMOTION_QR_XP_REWARD;
    const result = await this.prisma.$transaction(async (tx) => {
      const activation = await tx.userPromotionActivation.create({
        data: {
          userId,
          promotionId: promo.id,
          barId: promo.barId,
          xpEarned: xp,
          expiresAt: activationExpiresAt,
        },
      });
      await tx.promotionAnalyticsEvent.create({
        data: {
          promotionId: promo.id,
          userId,
          eventType: PromotionAnalyticsEventType.QR_SCAN,
          metadata: { source: 'activate_qr', xpEarned: xp } as Prisma.InputJsonValue,
        },
      });
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { totalXp: true },
      });
      const totalXp = (current?.totalXp ?? 0) + xp;
      const user = await tx.user.update({
        where: { id: userId },
        data: { totalXp, level: levelFromTotalXp(totalXp) },
      });
      return { activation, totalXp: user.totalXp };
    });

    await this.notifications.create(
      userId,
      NotificationType.SYSTEM,
      '¡Promoción activada!',
      `${promo.title} en ${promo.bar.businessName} (+${xp} XP) · válida 5 h`,
      {
        promotionId: promo.id,
        barId: promo.barId,
        xpEarned: xp,
      } as Prisma.InputJsonValue,
    );

    this.logger.log(
      JSON.stringify({
        event: 'promotion_qr_activate',
        userId,
        promotionId: promo.id,
        barId: promo.barId,
        xpEarned: xp,
        expiresAt: activationExpiresAt.toISOString(),
      }),
    );

    return {
      promotionId: promo.id,
      title: promo.title,
      barId: promo.barId,
      businessName: promo.bar.businessName,
      imageUrl: promo.imageUrl,
      xpEarned: xp,
      totalXp: result.totalXp,
      activatedAt: result.activation.activatedAt.toISOString(),
      expiresAt: result.activation.expiresAt.toISOString(),
      alreadyActive: false,
    };
  }

  /**
   * Solo 3 activas a la vez y de bares distintos.
   * Al renovar/crear, el bar de la promo no debe tener ya otra activa, y el cupo total ≤ 3.
   */
  private async assertCanClaimActivationSlot(
    userId: string,
    barId: string,
    now: Date,
  ): Promise<void> {
    const active = await this.findCurrentlyActiveRows(userId, now);
    const otherBars = active.filter((row) => row.barId !== barId);
    const sameBar = active.find((row) => row.barId === barId);
    if (sameBar) {
      throw new BadRequestException(
        'Ya tienes una promoción activa de este local. Espera a que expire (5 h) o elige otro bar.',
      );
    }
    if (otherBars.length >= MAX_ACTIVE_PROMOTIONS_FROM_DISTINCT_BARS) {
      throw new BadRequestException(
        `Solo puedes tener ${MAX_ACTIVE_PROMOTIONS_FROM_DISTINCT_BARS} promociones activas de locales distintos. Espera a que expire alguna.`,
      );
    }
  }

  private async findCurrentlyActiveRows(userId: string, now: Date) {
    const activatedAfter = new Date(now.getTime() - PROMOTION_ACTIVATION_TTL_MS);
    return this.prisma.userPromotionActivation.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
        activatedAt: { gt: activatedAfter },
        promotion: {
          status: PromotionStatus.ACTIVE,
          approvalStatus: PromotionApprovalStatus.APPROVED,
          endsAt: { gt: now },
        },
      },
      select: { id: true, barId: true, promotionId: true },
    });
  }

  async listActiveForUser(userId: string): Promise<ActiveUserPromotionDto[]> {
    const now = new Date();
    const activatedAfter = new Date(now.getTime() - PROMOTION_ACTIVATION_TTL_MS);
    const rows = await this.prisma.userPromotionActivation.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
        // Activas antiguas (sin TTL 5 h) no deben quedar eternas en el perfil.
        activatedAt: { gt: activatedAfter },
        promotion: {
          status: PromotionStatus.ACTIVE,
          approvalStatus: PromotionApprovalStatus.APPROVED,
          endsAt: { gt: now },
        },
      },
      include: {
        promotion: {
          include: {
            bar: { select: { id: true, businessName: true, logoUrl: true } },
          },
        },
      },
      orderBy: { activatedAt: 'desc' },
    });

    return rows.map((row) => {
      const cappedExpires = new Date(
        Math.min(row.expiresAt.getTime(), row.activatedAt.getTime() + PROMOTION_ACTIVATION_TTL_MS),
      );
      return {
        promotionId: row.promotionId,
        title: row.promotion.title,
        description: row.promotion.description,
        imageUrl: row.promotion.imageUrl,
        barId: row.barId,
        businessName: row.promotion.bar.businessName,
        barLogoUrl: row.promotion.bar.logoUrl,
        xpEarned: row.xpEarned,
        activatedAt: row.activatedAt.toISOString(),
        expiresAt: cappedExpires.toISOString(),
      };
    });
  }

  async countActivationsForPromotionIds(
    promotionIds: string[],
  ): Promise<Record<string, number>> {
    if (promotionIds.length === 0) return {};
    const grouped = await this.prisma.userPromotionActivation.groupBy({
      by: ['promotionId'],
      _count: { _all: true },
      where: { promotionId: { in: promotionIds } },
    });
    const result: Record<string, number> = {};
    for (const id of promotionIds) result[id] = 0;
    for (const row of grouped) {
      result[row.promotionId] = row._count._all;
    }
    return result;
  }
}
