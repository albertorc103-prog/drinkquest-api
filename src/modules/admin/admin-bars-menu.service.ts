import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  explorerQrDrinkLimit,
  isExplorerPlan,
  normalizeSubscriptionPlan,
} from '../subscriptions/subscription-plan.util';
import { AdminSetBarMenuItemDto } from './dto/admin-set-bar-menu.dto';

@Injectable()
export class AdminBarsMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async getBarMenu(barId: string) {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null },
      select: {
        id: true,
        businessName: true,
        subscription: { select: { plan: true } },
      },
    });
    if (!bar) throw new NotFoundException('Bar no encontrado');

    const plan = normalizeSubscriptionPlan(bar.subscription?.plan);
    const maxAllowed = isExplorerPlan(plan) ? explorerQrDrinkLimit() : null;

    const [drinks, menuItems] = await Promise.all([
      this.prisma.drink.findMany({
        where: { deletedAt: null },
        orderBy: [{ name: 'asc' }],
        include: { category: { select: { name: true } } },
      }),
      this.prisma.barMenuItem.findMany({
        where: { barId, deletedAt: null },
      }),
    ]);

    const menuByDrink = new Map(menuItems.map((item) => [item.drinkId, item]));
    const activeItems = menuItems.filter((item) => item.active);

    return {
      barId: bar.id,
      businessName: bar.businessName,
      plan,
      maxAllowed,
      assignedCount: menuItems.length,
      activeCount: activeItems.length,
      catalogTotal: drinks.length,
      items: drinks.map((drink) => {
        const menu = menuByDrink.get(drink.id);
        return {
          drinkId: drink.id,
          legacyId: drink.legacyId,
          name: drink.name,
          category: drink.category.name,
          slug: drink.slug,
          rarity: drink.rarity,
          assigned: !!menu,
          active: menu?.active ?? false,
          featured: menu?.featured ?? false,
        };
      }),
    };
  }

  async setBarMenu(barId: string, items: AdminSetBarMenuItemDto[]) {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null },
      select: {
        id: true,
        subscription: { select: { plan: true } },
      },
    });
    if (!bar) throw new NotFoundException('Bar no encontrado');

    const plan = normalizeSubscriptionPlan(bar.subscription?.plan);
    const maxAllowed = isExplorerPlan(plan) ? explorerQrDrinkLimit() : null;

    const drinkIds = items.map((item) => item.drinkId);
    const validDrinks = await this.prisma.drink.findMany({
      where: { id: { in: drinkIds }, deletedAt: null },
      select: { id: true },
    });
    const validIds = new Set(validDrinks.map((d) => d.id));
    const sanitized = items
      .filter((item) => validIds.has(item.drinkId))
      .map((item) => ({
        ...item,
        active: item.active ?? true,
      }));

    const activeCount = sanitized.filter((item) => item.active).length;
    if (maxAllowed != null && activeCount > maxAllowed) {
      throw new BadRequestException(
        `El plan Explorer permite máximo ${maxAllowed} bebidas con QR. Seleccionaste ${activeCount}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.barMenuItem.updateMany({
        where: {
          barId,
          deletedAt: null,
          ...(sanitized.length > 0 ? { drinkId: { notIn: sanitized.map((i) => i.drinkId) } } : {}),
        },
        data: { deletedAt: new Date(), active: false },
      });

      for (let index = 0; index < sanitized.length; index++) {
        const item = sanitized[index];
        await tx.barMenuItem.upsert({
          where: { barId_drinkId: { barId, drinkId: item.drinkId } },
          create: {
            barId,
            drinkId: item.drinkId,
            active: item.active,
            featured: item.featured ?? false,
            sortOrder: index,
          },
          update: {
            active: item.active,
            featured: item.featured ?? false,
            sortOrder: index,
            deletedAt: null,
          },
        });
      }
    });

    return this.getBarMenu(barId);
  }
}
