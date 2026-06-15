import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AdminSetBarMenuItemDto } from './dto/admin-set-bar-menu.dto';

@Injectable()
export class AdminBarsMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async getBarMenu(barId: string) {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null },
      select: { id: true, businessName: true },
    });
    if (!bar) throw new NotFoundException('Bar no encontrado');

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
    const assigned = menuItems.length;
    const active = menuItems.filter((item) => item.active).length;

    return {
      barId: bar.id,
      businessName: bar.businessName,
      assignedCount: assigned,
      activeCount: active,
      items: drinks.map((drink) => {
        const menu = menuByDrink.get(drink.id);
        return {
          drinkId: drink.id,
          legacyId: drink.legacyId,
          name: drink.name,
          category: drink.category.name,
          slug: drink.slug,
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
      select: { id: true },
    });
    if (!bar) throw new NotFoundException('Bar no encontrado');

    const drinkIds = items.map((item) => item.drinkId);
    const validDrinks = await this.prisma.drink.findMany({
      where: { id: { in: drinkIds }, deletedAt: null },
      select: { id: true },
    });
    const validIds = new Set(validDrinks.map((d) => d.id));
    const sanitized = items.filter((item) => validIds.has(item.drinkId));

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
            active: item.active ?? true,
            featured: item.featured ?? false,
            sortOrder: index,
          },
          update: {
            active: item.active ?? true,
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
