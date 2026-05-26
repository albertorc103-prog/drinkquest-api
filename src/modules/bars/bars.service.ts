import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { slugify } from '../../common/utils/crypto.util';

@Injectable()
export class BarsService {
  constructor(private readonly prisma: PrismaService) {}

  async getByOwner(ownerUserId: string) {
    return this.prisma.bar.findFirst({
      where: { ownerUserId, deletedAt: null },
      include: { menuItems: { where: { deletedAt: null }, include: { drink: true } } },
    });
  }

  async updateProfile(ownerUserId: string, data: Partial<{ businessName: string; description: string; address: string; city: string; phone: string }>) {
    const bar = await this.getByOwner(ownerUserId);
    if (!bar) throw new NotFoundException('Bar no encontrado');
    return this.prisma.bar.update({ where: { id: bar.id }, data });
  }

  async setMenuItem(ownerUserId: string, drinkId: string, active: boolean, featured = false) {
    const bar = await this.getByOwner(ownerUserId);
    if (!bar) throw new ForbiddenException('Sin permisos de bar');
    return this.prisma.barMenuItem.upsert({
      where: { barId_drinkId: { barId: bar.id, drinkId } },
      create: { barId: bar.id, drinkId, active, featured },
      update: { active, featured },
    });
  }

  async seedDefaultMenu(barId: string, drinkIds: string[]) {
    await this.prisma.barMenuItem.createMany({
      data: drinkIds.map((drinkId, i) => ({
        barId,
        drinkId,
        active: i < 24,
        featured: i === 0,
        sortOrder: i,
      })),
      skipDuplicates: true,
    });
  }

  async dashboard(ownerUserId: string) {
    const bar = await this.getByOwner(ownerUserId);
    if (!bar) throw new NotFoundException('Bar no encontrado');
    const activeDrinks = bar.menuItems.filter((m) => m.active).length;
    return { bar, activeDrinks };
  }
}
