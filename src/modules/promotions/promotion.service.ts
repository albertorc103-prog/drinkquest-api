import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PromotionEventType,
  PromotionApprovalStatus,
  PromotionEventTheme,
  PromotionPlacementType,
  PromotionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import {
  activePromotionLimitForPlan,
  legendPromoPriorityBoost,
  normalizeSubscriptionPlan,
  promoPriorityEnabledForPlan,
  thematicEventsEnabledForPlan,
} from '../subscriptions/subscription-plan.util';
import { PromotionAnalyticsService } from './promotion-analytics.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionResponseDto } from './dto/promotion-response.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { mapPromotion } from './mappers/promotion.mapper';
import { assertNotAlreadyExpired, assertValidPromotionWindow } from './utils/promotion-dates.util';
import {
  computePromotionRankingScore,
  isThematicEventTheme,
} from './utils/promotion-ranking.util';

@Injectable()
export class PromotionService {
  private readonly logger = new Logger(PromotionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
    private readonly analytics: PromotionAnalyticsService,
  ) {}

  async listForOwner(ownerUserId: string): Promise<PromotionResponseDto[]> {
    const { bar } = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    const rows = await this.prisma.barPromotion.findMany({
      where: { barId: bar.id },
      orderBy: [{ status: 'asc' }, { startsAt: 'desc' }],
    });
    const summary = await this.analytics.getSummaryForPromotionIds(rows.map((r) => r.id));
    return rows.map((r) => mapPromotion(r, summary[r.id]));
  }

  async createPromotion(ownerUserId: string, dto: CreatePromotionDto): Promise<PromotionResponseDto> {
    const { bar, subscription } = await this.barAccess.assertOwnerCanUsePromotions(ownerUserId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    assertValidPromotionWindow(startsAt, endsAt);
    assertNotAlreadyExpired(endsAt);

    const plan = normalizeSubscriptionPlan(subscription?.plan);
    const eventTheme = dto.eventTheme ?? PromotionEventTheme.STANDARD;
    this.assertCanUseEventTheme(plan, eventTheme);

    const { placementType, priority } = this.resolvePlacementAndPriority(
      plan,
      dto.placementType,
      dto.priority,
      /* isCreate */ true,
    );

    const insertData = {
      barId: bar.id,
      title: dto.title.trim(),
      description: dto.description?.trim(),
      imageUrl: dto.imageUrl,
      startsAt,
      endsAt,
      status: PromotionStatus.DRAFT,
      placementType,
      eventTheme,
      priority,
      approvalStatus: PromotionApprovalStatus.PENDING_REVIEW,
      rankingScore: computePromotionRankingScore(priority, placementType, eventTheme),
    };

    this.logger.log(
      JSON.stringify({
        event: 'promotion_create_db_insert',
        ownerUserId,
        barId: bar.id,
        data: {
          ...insertData,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
      }),
    );

    const created = await this.prisma.barPromotion.create({ data: insertData });

    await this.createEvent(created.id, created.barId, PromotionEventType.RESUBMISSION, ownerUserId, {
      source: 'create',
    });

    this.logger.log(
      JSON.stringify({
        event: 'promotion_create_saved',
        ownerUserId,
        promotionId: created.id,
        barId: created.barId,
        status: created.status,
        approvalStatus: created.approvalStatus,
        eventTheme: created.eventTheme,
        imageUrl: created.imageUrl,
        startsAt: created.startsAt.toISOString(),
        endsAt: created.endsAt.toISOString(),
      }),
    );

    return mapPromotion(created);
  }

  async updatePromotion(
    ownerUserId: string,
    promotionId: string,
    dto: UpdatePromotionDto,
  ): Promise<PromotionResponseDto> {
    const { subscription } = await this.barAccess.assertOwnerCanUsePromotions(ownerUserId);
    const promo = await this.requireOwnedPromotion(ownerUserId, promotionId);
    if (promo.status === PromotionStatus.EXPIRED) {
      throw new BadRequestException('No se puede editar una promoción expirada.');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : promo.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : promo.endsAt;
    if (dto.startsAt || dto.endsAt) {
      assertValidPromotionWindow(startsAt, endsAt);
    }

    const plan = normalizeSubscriptionPlan(subscription?.plan);
    const eventTheme = dto.eventTheme ?? promo.eventTheme;
    this.assertCanUseEventTheme(plan, eventTheme);

    const { placementType, priority } = this.resolvePlacementAndPriority(
      plan,
      dto.placementType ?? promo.placementType,
      dto.priority ?? promo.priority,
      /* isCreate */ false,
    );

    const updated = await this.prisma.barPromotion.update({
      where: { id: promotionId },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        imageUrl: dto.imageUrl,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        placementType,
        eventTheme: dto.eventTheme,
        priority,
        rejectionReason: null,
        moderatedByAdminId: null,
        moderatedAt: null,
        approvalStatus:
          promo.approvalStatus === PromotionApprovalStatus.REJECTED ||
          promo.approvalStatus === PromotionApprovalStatus.FLAGGED
            ? PromotionApprovalStatus.PENDING_REVIEW
            : undefined,
        rankingScore: computePromotionRankingScore(priority, placementType, eventTheme),
      },
    });
    if (
      promo.approvalStatus === PromotionApprovalStatus.REJECTED ||
      promo.approvalStatus === PromotionApprovalStatus.FLAGGED
    ) {
      await this.createEvent(updated.id, updated.barId, PromotionEventType.RESUBMISSION, ownerUserId, {
        source: 'update',
      });
    }
    this.logger.log(
      JSON.stringify({
        event: 'promotion_update',
        ownerUserId,
        promotionId: updated.id,
        barId: updated.barId,
        eventTheme: updated.eventTheme,
      }),
    );
    return mapPromotion(updated);
  }

  private assertCanUseEventTheme(
    plan: ReturnType<typeof normalizeSubscriptionPlan>,
    eventTheme: PromotionEventTheme,
  ) {
    if (isThematicEventTheme(eventTheme) && !thematicEventsEnabledForPlan(plan)) {
      throw new ForbiddenException(
        'Los eventos temáticos (Navidad, Año Nuevo, Halloween, Noche mexicana, aniversario) son exclusivos del plan Legend.',
      );
    }
  }

  /**
   * Legend: FEATURED + boost de prioridad por defecto.
   * Otros planes: solo STANDARD (FEATURED/BOOSTED rechazados).
   */
  private resolvePlacementAndPriority(
    plan: ReturnType<typeof normalizeSubscriptionPlan>,
    requestedPlacement: PromotionPlacementType | undefined | null,
    requestedPriority: number | undefined | null,
    isCreate: boolean,
  ): { placementType: PromotionPlacementType; priority: number } {
    const canFeature = promoPriorityEnabledForPlan(plan);
    let placementType =
      requestedPlacement ??
      (isCreate && canFeature
        ? PromotionPlacementType.FEATURED
        : PromotionPlacementType.STANDARD);

    if (
      !canFeature &&
      (placementType === PromotionPlacementType.FEATURED ||
        placementType === PromotionPlacementType.BOOSTED)
    ) {
      throw new ForbiddenException(
        'Las promociones destacadas (FEATURED/BOOSTED) son exclusivas del plan Legend.',
      );
    }

    if (canFeature && isCreate && requestedPlacement == null) {
      placementType = PromotionPlacementType.FEATURED;
    }

    let priority = requestedPriority ?? 0;
    if (canFeature && isCreate && (requestedPriority == null || requestedPriority === 0)) {
      priority = legendPromoPriorityBoost();
    }

    return { placementType, priority };
  }

  async activatePromotion(ownerUserId: string, promotionId: string): Promise<PromotionResponseDto> {
    const { bar, subscription } = await this.barAccess.assertOwnerCanUsePromotions(ownerUserId);
    const promo = await this.requireOwnedPromotion(ownerUserId, promotionId);

    if (promo.status === PromotionStatus.ACTIVE) {
      throw new BadRequestException('La promoción ya está activa.');
    }
    assertNotAlreadyExpired(promo.endsAt);
    assertValidPromotionWindow(promo.startsAt, promo.endsAt);

    if (promo.approvalStatus !== PromotionApprovalStatus.APPROVED) {
      throw new BadRequestException('La promoción debe estar aprobada por administración.');
    }

    const activeLimit = activePromotionLimitForPlan(
      normalizeSubscriptionPlan(subscription?.plan),
    );
    if (activeLimit != null) {
      const activeCount = await this.prisma.barPromotion.count({
        where: { barId: bar.id, status: PromotionStatus.ACTIVE },
      });
      if (activeCount >= activeLimit) {
        throw new BadRequestException(
          `Tu plan permite máximo ${activeLimit} promociones activas al mismo tiempo. Pausa una para poder activar otra.`,
        );
      }
    }

    const updated = await this.prisma.barPromotion.update({
      where: { id: promotionId },
      data: {
        status: PromotionStatus.ACTIVE,
      },
    });
    await this.createEvent(updated.id, updated.barId, PromotionEventType.ACTIVATION, ownerUserId);
    return mapPromotion(updated);
  }

  async pausePromotion(ownerUserId: string, promotionId: string): Promise<PromotionResponseDto> {
    await this.barAccess.assertOwnerCanUsePromotions(ownerUserId);
    const promo = await this.requireOwnedPromotion(ownerUserId, promotionId);

    if (promo.status !== PromotionStatus.ACTIVE) {
      throw new BadRequestException('Solo se pueden pausar promociones activas.');
    }

    const updated = await this.prisma.barPromotion.update({
      where: { id: promotionId },
      data: { status: PromotionStatus.PAUSED },
    });
    await this.createEvent(updated.id, updated.barId, PromotionEventType.PAUSE, ownerUserId);
    return mapPromotion(updated);
  }

  async resubmitPromotion(ownerUserId: string, promotionId: string): Promise<PromotionResponseDto> {
    await this.barAccess.assertOwnerCanUsePromotions(ownerUserId);
    const promo = await this.requireOwnedPromotion(ownerUserId, promotionId);
    if (
      promo.approvalStatus !== PromotionApprovalStatus.REJECTED &&
      promo.approvalStatus !== PromotionApprovalStatus.FLAGGED
    ) {
      throw new BadRequestException('Solo se pueden reenviar promociones rechazadas o marcadas.');
    }
    assertNotAlreadyExpired(promo.endsAt);

    const updated = await this.prisma.barPromotion.update({
      where: { id: promo.id },
      data: {
        approvalStatus: PromotionApprovalStatus.PENDING_REVIEW,
        rejectionReason: null,
        moderatedByAdminId: null,
        moderatedAt: null,
        status: promo.status === PromotionStatus.EXPIRED ? PromotionStatus.DRAFT : promo.status,
      },
    });
    await this.createEvent(updated.id, updated.barId, PromotionEventType.RESUBMISSION, ownerUserId, {
      source: 'manual',
    });
    return mapPromotion(updated);
  }

  async deletePromotion(ownerUserId: string, promotionId: string): Promise<{ deleted: true }> {
    await this.requireOwnedPromotion(ownerUserId, promotionId);
    await this.prisma.barPromotion.delete({ where: { id: promotionId } });
    return { deleted: true };
  }

  private async requireOwnedPromotion(ownerUserId: string, promotionId: string) {
    const { bar } = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    const promo = await this.prisma.barPromotion.findFirst({
      where: { id: promotionId, barId: bar.id },
    });
    if (!promo) {
      throw new NotFoundException('Promoción no encontrada.');
    }
    return promo;
  }

  private async createEvent(
    promotionId: string,
    barId: string,
    eventType: PromotionEventType,
    actorUserId?: string,
    payload?: Prisma.InputJsonValue,
  ) {
    await this.prisma.barPromotionEvent.create({
      data: {
        promotionId,
        barId,
        eventType,
        actorUserId,
        payload,
      },
    });
  }
}
