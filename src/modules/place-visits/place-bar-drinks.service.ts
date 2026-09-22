import { Injectable, NotFoundException } from '@nestjs/common';
import {
  SpecialDrinkApprovalStatus,
  SpecialDrinkStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { evaluateSubscriptionActive } from '../subscriptions/bar-access.rules';
import { mapSpecialDrink } from '../special-drinks/mappers/special-drink.mapper';

@Injectable()
export class PlaceBarDrinksService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBar(barId: string) {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null, isActive: true },
      select: {
        id: true,
        businessName: true,
        subscription: {
          select: {
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            canceledAt: true,
            qrEnabled: true,
            promoEnabled: true,
          },
        },
      },
    });
    if (!bar) throw new NotFoundException('Establecimiento no encontrado.');

    const partner = evaluateSubscriptionActive(bar.subscription).allowed;
    if (!partner) {
      return {
        barId: bar.id,
        barName: bar.businessName,
        drinkQuestPartner: false,
        houseSpecials: [],
        menuDrinks: [],
      };
    }

    const [specials, menuItems] = await Promise.all([
      this.prisma.barSpecialDrink.findMany({
        where: {
          barId: bar.id,
          deletedAt: null,
          approvalStatus: SpecialDrinkApprovalStatus.APPROVED,
          status: SpecialDrinkStatus.ACTIVE,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          materializedDrink: { select: { id: true } },
        },
      }),
      this.prisma.barMenuItem.findMany({
        where: {
          barId: bar.id,
          deletedAt: null,
          active: true,
        },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        take: 40,
        include: {
          drink: {
            select: {
              id: true,
              name: true,
              rarity: true,
              imageUrl: true,
              description: true,
              sourceSpecialDrinkId: true,
              deletedAt: true,
            },
          },
        },
      }),
    ]);

    const menuDrinks = menuItems
      .filter((m) => m.drink && m.drink.deletedAt == null)
      .map((m) => ({
        drinkId: m.drink!.id,
        name: m.drink!.name,
        rarity: m.drink!.rarity,
        imageUrl: m.drink!.imageUrl,
        description: m.drink!.description,
        featured: m.featured,
        isHouseSpecial: m.drink!.sourceSpecialDrinkId != null,
      }));

    return {
      barId: bar.id,
      barName: bar.businessName,
      drinkQuestPartner: true,
      houseSpecials: specials.map((row) => ({
        ...mapSpecialDrink(row),
        catalogDrinkId: row.materializedDrink?.id ?? null,
      })),
      menuDrinks,
    };
  }
}
