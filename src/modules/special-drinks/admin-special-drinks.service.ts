import { Injectable, NotFoundException } from '@nestjs/common';
import { SpecialDrinkApprovalStatus, SpecialDrinkStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { mapSpecialDrink } from './mappers/special-drink.mapper';

@Injectable()
export class AdminSpecialDrinksService {
  constructor(private readonly prisma: PrismaService) {}

  async listPending(limit = 100) {
    const rows = await this.prisma.barSpecialDrink.findMany({
      where: {
        deletedAt: null,
        approvalStatus: SpecialDrinkApprovalStatus.PENDING_REVIEW,
      },
      include: {
        bar: {
          select: { id: true, businessName: true, slug: true, logoUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return { items: rows.map(mapSpecialDrink), total: rows.length };
  }

  async approve(drinkId: string, adminUserId: string) {
    const drink = await this.requireDrink(drinkId);
    const updated = await this.prisma.barSpecialDrink.update({
      where: { id: drink.id },
      data: {
        approvalStatus: SpecialDrinkApprovalStatus.APPROVED,
        status: SpecialDrinkStatus.ACTIVE,
        rejectionReason: null,
        moderatedByAdminId: adminUserId,
        moderatedAt: new Date(),
      },
      include: {
        bar: {
          select: { id: true, businessName: true, slug: true, logoUrl: true },
        },
      },
    });
    return mapSpecialDrink(updated);
  }

  async reject(drinkId: string, adminUserId: string, reason: string) {
    const drink = await this.requireDrink(drinkId);
    const updated = await this.prisma.barSpecialDrink.update({
      where: { id: drink.id },
      data: {
        approvalStatus: SpecialDrinkApprovalStatus.REJECTED,
        status: SpecialDrinkStatus.DRAFT,
        rejectionReason: reason.trim(),
        moderatedByAdminId: adminUserId,
        moderatedAt: new Date(),
      },
      include: {
        bar: {
          select: { id: true, businessName: true, slug: true, logoUrl: true },
        },
      },
    });
    return mapSpecialDrink(updated);
  }

  async flag(drinkId: string, adminUserId: string, reason: string) {
    const drink = await this.requireDrink(drinkId);
    const updated = await this.prisma.barSpecialDrink.update({
      where: { id: drink.id },
      data: {
        approvalStatus: SpecialDrinkApprovalStatus.FLAGGED,
        status:
          drink.status === SpecialDrinkStatus.ACTIVE
            ? SpecialDrinkStatus.DRAFT
            : drink.status,
        rejectionReason: reason.trim(),
        moderatedByAdminId: adminUserId,
        moderatedAt: new Date(),
      },
      include: {
        bar: {
          select: { id: true, businessName: true, slug: true, logoUrl: true },
        },
      },
    });
    return mapSpecialDrink(updated);
  }

  private async requireDrink(drinkId: string) {
    const drink = await this.prisma.barSpecialDrink.findFirst({
      where: { id: drinkId, deletedAt: null },
    });
    if (!drink) throw new NotFoundException('Bebida especializada no encontrada.');
    return drink;
  }
}
