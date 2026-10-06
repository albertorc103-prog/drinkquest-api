import { Injectable, NotFoundException } from '@nestjs/common';
import {
  SpecialDrinkApprovalStatus,
  SpecialDrinkStatus,
} from '@prisma/client';
import { isOfficialCatalogDrink } from '../../common/catalog/canonical-catalog.util';
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
          materializedDrink: { select: { id: true, imageUrl: true, imageKey: true } },
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
              imageKey: true,
              description: true,
              legacyId: true,
              sourceSpecialDrinkId: true,
              deletedAt: true,
            },
          },
        },
      }),
    ]);

    const houseSpecials = specials.map((row) => {
      const mapped = mapSpecialDrink(row);
      return {
        ...mapped,
        // Preferir URL de la especial; si falta, la del drink materializado.
        imageUrl:
          mapped.imageUrl ||
          row.materializedDrink?.imageUrl ||
          null,
        catalogDrinkId: row.materializedDrink?.id ?? null,
      };
    });

    const houseDrinkIds = new Set(
      houseSpecials
        .map((s) => s.catalogDrinkId)
        .filter((id): id is string => Boolean(id)),
    );

    // Carta estándar: solo las 100 oficiales (nombre + legacyId). Excluye set antiguo.
    const menuDrinks = menuItems
      .filter((m) => m.drink && isOfficialCatalogDrink(m.drink))
      .filter((m) => !houseDrinkIds.has(m.drink!.id))
      .map((m) => ({
        drinkId: m.drink!.id,
        name: m.drink!.name,
        rarity: m.drink!.rarity,
        imageUrl: m.drink!.imageUrl,
        imageKey: m.drink!.imageKey,
        description: m.drink!.description,
        featured: m.featured,
        isHouseSpecial: false,
      }));

    return {
      barId: bar.id,
      barName: bar.businessName,
      drinkQuestPartner: true,
      houseSpecials,
      menuDrinks,
    };
  }
}
