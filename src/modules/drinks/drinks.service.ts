import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DrinkRarity, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MissionsService } from '../missions/missions.service';
import { CreateDrinkHistoryDto } from './dto/create-drink-history.dto';

/** Alineado con XpEngine.XP_REPEAT_REGISTER en la app Android. */
const XP_REPEAT_REGISTER = 8;

@Injectable()
export class DrinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly missions: MissionsService,
  ) {}

  async list(params: {
    categoryId?: string;
    rarity?: DrinkRarity;
    search?: string;
    page?: number;
    limit?: number;
  }) {
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

  /**
   * Registro manual de bebida (app → POST drinks/me/history).
   * Shape: { entry, xpEarned, totalXp, isFirstTimeForDrink }
   */
  async logHistory(userId: string, dto: CreateDrinkHistoryDto) {
    const drink = await this.prisma.drink.findFirst({
      where: { id: dto.drinkId, deletedAt: null },
    });
    if (!drink) throw new NotFoundException('Bebida no encontrada');

    if (dto.barId) {
      const bar = await this.prisma.bar.findFirst({
        where: { id: dto.barId, deletedAt: null },
        select: { id: true },
      });
      if (!bar) throw new BadRequestException('Bar no encontrado');
    }

    let loggedAt = new Date();
    if (dto.loggedAt) {
      const parsed = new Date(dto.loggedAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('loggedAt inválido');
      }
      loggedAt = parsed;
    }

    const existingUnlock = await this.prisma.userDrinkUnlock.findUnique({
      where: { userId_drinkId: { userId, drinkId: drink.id } },
    });
    const isFirstTimeForDrink = !existingUnlock;

    const xpEarned = isFirstTimeForDrink
      ? Math.max(0, drink.xpReward)
      : XP_REPEAT_REGISTER;

    const { entry, totalXp } = await this.prisma.$transaction(async (tx) => {
      if (isFirstTimeForDrink) {
        await tx.userDrinkUnlock.create({
          data: {
            userId,
            drinkId: drink.id,
            barId: dto.barId ?? null,
            xpEarned,
          },
        });
      }

      const entry = await tx.drinkHistoryEntry.create({
        data: {
          userId,
          drinkId: drink.id,
          barId: dto.barId ?? null,
          rating: dto.rating ?? null,
          notes: dto.notes?.trim() || null,
          loggedAt,
        },
        include: { drink: true },
      });

      const user = await tx.user.update({
        where: { id: userId },
        data: { totalXp: { increment: xpEarned } },
        select: { totalXp: true },
      });

      return { entry, totalXp: user.totalXp };
    });

    if (isFirstTimeForDrink) {
      await this.missions.onQrUnlock(userId);
    }

    return {
      entry,
      xpEarned,
      totalXp,
      isFirstTimeForDrink,
    };
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
        venueImageUrl: isSpecial ? (venueBannerUrl ?? venueLogoUrl) : null,
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
