import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  PromotionEventType,
  PromotionApprovalStatus,
  PromotionPlacementType,
  PromotionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import { PromotionAnalyticsService } from './promotion-analytics.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionResponseDto } from './dto/promotion-response.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { mapPromotion } from './mappers/promotion.mapper';
import { assertNotAlreadyExpired, assertValidPromotionWindow } from './utils/promotion-dates.util';
import { computePromotionRankingScore } from './utils/promotion-ranking.util';

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
    const { bar } = await this.barAccess.assertOwnerCanUsePromotions(ownerUserId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    assertValidPromotionWindow(startsAt, endsAt);
    assertNotAlreadyExpired(endsAt);

    const placementType = dto.placementType ?? PromotionPlacementType.STANDARD;
    const priority = dto.priority ?? 0;

    const created = await this.prisma.barPromotion.create({
      data: {
        barId: bar.id,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        imageUrl: dto.imageUrl,
        startsAt,
        endsAt,
        status: PromotionStatus.DRAFT,
        placementType,
        priority,
        approvalStatus: PromotionApprovalStatus.PENDING_REVIEW,
        rankingScore: computePromotionRankingScore(priority, placementType),
      },
    });
    await this.createEvent(created.id, created.barId, PromotionEventType.RESUBMISSION, ownerUserId, {
      source: 'create',
    });
    this.logger.log(
      JSON.stringify({
        event: 'promotion_create',
        ownerUserId,
        promotionId: created.id,
        barId: created.barId,
      }),
    );
    return mapPromotion(created);
  }

  async updatePromotion(
    ownerUserId: string,
    promotionId: string,
    dto: UpdatePromotionDto,
  ): Promise<PromotionResponseDto> {
    const promo = await this.requireOwnedPromotion(ownerUserId, promotionId);
    if (promo.status === PromotionStatus.EXPIRED) {
      throw new BadRequestException('No se puede editar una promoción expirada.');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : promo.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : promo.endsAt;
    if (dto.startsAt || dto.endsAt) {
      assertValidPromotionWindow(startsAt, endsAt);
    }

    const placementType = dto.placementType ?? promo.placementType;
    const priority = dto.priority ?? promo.priority;

    const updated = await this.prisma.barPromotion.update({
      where: { id: promotionId },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        imageUrl: dto.imageUrl,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        placementType: dto.placementType,
        priority: dto.priority,
        rejectionReason: null,
        moderatedByAdminId: null,
        moderatedAt: null,
        approvalStatus:
          promo.approvalStatus === PromotionApprovalStatus.REJECTED ||
          promo.approvalStatus === PromotionApprovalStatus.FLAGGED
            ? PromotionApprovalStatus.PENDING_REVIEW
            : undefined,
        rankingScore: computePromotionRankingScore(priority, placementType),
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
      }),
    );
    return mapPromotion(updated);
  }

  async activatePromotion(ownerUserId: string, promotionId: string): Promise<PromotionResponseDto> {
    await this.barAccess.assertOwnerCanUsePromotions(ownerUserId);
    const promo = await this.requireOwnedPromotion(ownerUserId, promotionId);

    if (promo.status === PromotionStatus.ACTIVE) {
      throw new BadRequestException('La promoción ya está activa.');
    }
    assertNotAlreadyExpired(promo.endsAt);
    assertValidPromotionWindow(promo.startsAt, promo.endsAt);

    if (promo.approvalStatus !== PromotionApprovalStatus.APPROVED) {
      throw new BadRequestException('La promoción debe estar aprobada por administración.');
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
