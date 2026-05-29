import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  PromotionApprovalStatus,
  PromotionEventType,
  PromotionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PromotionResponseDto } from './dto/promotion-response.dto';
import { mapPromotion } from './mappers/promotion.mapper';

@Injectable()
export class AdminPromotionModerationService {
  private readonly logger = new Logger(AdminPromotionModerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listPending(limit = 100): Promise<PromotionResponseDto[]> {
    const rows = await this.prisma.barPromotion.findMany({
      where: { approvalStatus: PromotionApprovalStatus.PENDING_REVIEW },
      take: Math.min(Math.max(limit, 1), 200),
      orderBy: [{ createdAt: 'asc' }],
      include: {
        bar: { select: { id: true, businessName: true, slug: true, logoUrl: true, city: true } },
      },
    });
    return rows.map((row) => mapPromotion(row));
  }

  async approve(promotionId: string, adminId: string): Promise<PromotionResponseDto> {
    const promo = await this.requirePromotion(promotionId);
    if (promo.approvalStatus === PromotionApprovalStatus.APPROVED) {
      throw new BadRequestException('La promoción ya fue aprobada.');
    }
    if (promo.status === PromotionStatus.EXPIRED || promo.endsAt <= new Date()) {
      throw new BadRequestException('No se puede aprobar una promoción expirada.');
    }

    const updated = await this.prisma.barPromotion.update({
      where: { id: promo.id },
      data: {
        approvalStatus: PromotionApprovalStatus.APPROVED,
        rejectionReason: null,
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
      },
      include: {
        bar: { select: { id: true, businessName: true, slug: true, logoUrl: true, city: true } },
      },
    });
    await this.createEvent(promo.id, promo.barId, PromotionEventType.APPROVAL, adminId);
    this.logger.log(
      JSON.stringify({
        event: 'promotion_approve',
        promotionId: promo.id,
        barId: promo.barId,
        adminId,
      }),
    );
    return mapPromotion(updated);
  }

  async reject(promotionId: string, adminId: string, reason: string): Promise<PromotionResponseDto> {
    const promo = await this.requirePromotion(promotionId);
    const updated = await this.prisma.barPromotion.update({
      where: { id: promo.id },
      data: {
        approvalStatus: PromotionApprovalStatus.REJECTED,
        rejectionReason: reason.trim(),
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
        status: promo.status === PromotionStatus.ACTIVE ? PromotionStatus.PAUSED : promo.status,
      },
      include: {
        bar: { select: { id: true, businessName: true, slug: true, logoUrl: true, city: true } },
      },
    });
    await this.createEvent(promo.id, promo.barId, PromotionEventType.REJECTION, adminId, reason.trim());
    this.logger.log(
      JSON.stringify({
        event: 'promotion_reject',
        promotionId: promo.id,
        barId: promo.barId,
        adminId,
      }),
    );
    return mapPromotion(updated);
  }

  async flag(promotionId: string, adminId: string, reason: string): Promise<PromotionResponseDto> {
    const promo = await this.requirePromotion(promotionId);
    const updated = await this.prisma.barPromotion.update({
      where: { id: promo.id },
      data: {
        approvalStatus: PromotionApprovalStatus.FLAGGED,
        rejectionReason: reason.trim(),
        moderatedByAdminId: adminId,
        moderatedAt: new Date(),
        status: promo.status === PromotionStatus.ACTIVE ? PromotionStatus.PAUSED : promo.status,
      },
      include: {
        bar: { select: { id: true, businessName: true, slug: true, logoUrl: true, city: true } },
      },
    });
    await this.createEvent(promo.id, promo.barId, PromotionEventType.FLAGGING, adminId, reason.trim());
    this.logger.log(
      JSON.stringify({
        event: 'promotion_flag',
        promotionId: promo.id,
        barId: promo.barId,
        adminId,
      }),
    );
    return mapPromotion(updated);
  }

  private async requirePromotion(promotionId: string) {
    const promo = await this.prisma.barPromotion.findUnique({ where: { id: promotionId } });
    if (!promo) throw new NotFoundException('Promoción no encontrada.');
    return promo;
  }

  private async createEvent(
    promotionId: string,
    barId: string,
    eventType: PromotionEventType,
    actorUserId: string,
    reason?: string,
  ) {
    await this.prisma.barPromotionEvent.create({
      data: {
        promotionId,
        barId,
        eventType,
        actorUserId,
        reason,
      },
    });
  }
}

