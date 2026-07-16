import { Injectable, NotFoundException } from '@nestjs/common';
import { SpecialDrinkApprovalStatus, SpecialDrinkStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { mapSpecialDrink } from './mappers/special-drink.mapper';
import {
  deactivateSpecialDrinkMenu,
  materializeSpecialDrink,
} from './special-drink-materialize.util';

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
        materializedDrink: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return { items: rows.map(mapSpecialDrink), total: rows.length };
  }

  async approve(drinkId: string, adminUserId: string) {
    const special = await this.requireDrink(drinkId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.barSpecialDrink.update({
        where: { id: special.id },
        data: {
          approvalStatus: SpecialDrinkApprovalStatus.APPROVED,
          status: SpecialDrinkStatus.ACTIVE,
          rejectionReason: null,
          moderatedByAdminId: adminUserId,
          moderatedAt: new Date(),
        },
      });

      await materializeSpecialDrink(tx, {
        id: row.id,
        barId: row.barId,
        name: row.name,
        recipe: row.recipe,
        funFact: row.funFact,
        imageUrl: row.imageUrl,
      });

      return tx.barSpecialDrink.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          bar: {
            select: { id: true, businessName: true, slug: true, logoUrl: true },
          },
          materializedDrink: { select: { id: true } },
        },
      });
    });

    return mapSpecialDrink(updated);
  }

  async reject(drinkId: string, adminUserId: string, reason: string) {
    const special = await this.requireDrink(drinkId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await deactivateSpecialDrinkMenu(tx, special.id);
      return tx.barSpecialDrink.update({
        where: { id: special.id },
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
          materializedDrink: { select: { id: true } },
        },
      });
    });
    return mapSpecialDrink(updated);
  }

  async flag(drinkId: string, adminUserId: string, reason: string) {
    const special = await this.requireDrink(drinkId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await deactivateSpecialDrinkMenu(tx, special.id);
      return tx.barSpecialDrink.update({
        where: { id: special.id },
        data: {
          approvalStatus: SpecialDrinkApprovalStatus.FLAGGED,
          status:
            special.status === SpecialDrinkStatus.ACTIVE
              ? SpecialDrinkStatus.DRAFT
              : special.status,
          rejectionReason: reason.trim(),
          moderatedByAdminId: adminUserId,
          moderatedAt: new Date(),
        },
        include: {
          bar: {
            select: { id: true, businessName: true, slug: true, logoUrl: true },
          },
          materializedDrink: { select: { id: true } },
        },
      });
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
