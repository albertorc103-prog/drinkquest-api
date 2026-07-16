import { Injectable, NotFoundException } from '@nestjs/common';
import { DrinkRarity, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DrinksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { categoryId?: string; rarity?: DrinkRarity; search?: string; page?: number; limit?: number }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const where: Prisma.DrinkWhereInput = {
      deletedAt: null,
      legacyId: { gte: 1, lte: 100 },
      ...(params.categoryId && { categoryId: params.categoryId }),
      ...(params.rarity && { rarity: params.rarity }),
      ...(params.search && {
        name: { contains: params.search, mode: 'insensitive' },
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.drink.findMany({
        where,
        include: { category: true },
        orderBy: { legacyId: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.drink.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getById(id: string) {
    const drink = await this.prisma.drink.findFirst({
      where: { id, deletedAt: null },
      include: { category: true },
    });
    if (!drink) throw new NotFoundException('Bebida no encontrada');
    return drink;
  }

  async favorites(userId: string) {
    return this.prisma.userFavoriteDrink.findMany({
      where: { userId },
      include: { drink: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleFavorite(userId: string, drinkId: string) {
    const existing = await this.prisma.userFavoriteDrink.findUnique({
      where: { userId_drinkId: { userId, drinkId } },
    });
    if (existing) {
      await this.prisma.userFavoriteDrink.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.userFavoriteDrink.create({ data: { userId, drinkId } });
    return { favorited: true };
  }

  async history(userId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.drinkHistoryEntry.findMany({
        where: { userId },
        include: { drink: true },
        orderBy: { loggedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.drinkHistoryEntry.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }

  async unlocks(userId: string) {
    const rows = await this.prisma.userDrinkUnlock.findMany({
      where: { userId },
      include: { drink: true },
      orderBy: { unlockedAt: 'desc' },
    });

    const barIds = [
      ...new Set(rows.map((r) => r.barId).filter((id): id is string => !!id)),
    ];
    const bars =
      barIds.length === 0
        ? []
        : await this.prisma.bar.findMany({
            where: { id: { in: barIds } },
            select: { id: true, businessName: true, logoUrl: true, bannerUrl: true },
          });
    const barById = new Map(bars.map((b) => [b.id, b]));

    return rows.map((row) => {
      const isSpecial = !!row.drink.sourceSpecialDrinkId;
      const bar = row.barId ? barById.get(row.barId) : undefined;
      const venueLogoUrl = isSpecial ? (bar?.logoUrl ?? null) : null;
      const venueBannerUrl = isSpecial ? (bar?.bannerUrl ?? null) : null;
      return {
        ...row,
        isSpecial,
        isLimitedEdition: isSpecial,
        specialDrinkId: row.drink.sourceSpecialDrinkId,
        venueLabel: isSpecial ? (bar?.businessName ?? null) : null,
        venueLogoUrl,
        venueBannerUrl,
        venueImageUrl: isSpecial
          ? (venueBannerUrl ?? venueLogoUrl)
          : null,
        funFact: isSpecial ? row.drink.description : null,
        recipe: isSpecial ? row.drink.ingredients : null,
      };
    });
  }

  async categories() {
    return this.prisma.drinkCategory.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
