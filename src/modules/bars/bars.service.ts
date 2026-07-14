import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { slugify } from '../../common/utils/crypto.util';
import { isExplorerPlan, normalizeSubscriptionPlan } from '../subscriptions/subscription-plan.util';

@Injectable()
export class BarsService {
  constructor(private readonly prisma: PrismaService) {}

  async getByOwner(ownerUserId: string) {
    return this.prisma.bar.findFirst({
      where: { ownerUserId, deletedAt: null },
      include: { menuItems: { where: { deletedAt: null }, include: { drink: true } } },
    });
  }

  async updateProfile(ownerUserId: string, data: Record<string, unknown>) {
    const bar = await this.getByOwner(ownerUserId);
    if (!bar) throw new NotFoundException('Bar no encontrado');

    const updateData: Record<string, unknown> = {};
    const textFields = [
      'businessName',
      'description',
      'address',
      'city',
      'country',
      'phone',
      'logoUrl',
      'bannerUrl',
    ] as const;
    for (const field of textFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }

    if ('latitude' in data) updateData.latitude = this.parseCoordinate(data.latitude, -90, 90);
    if ('longitude' in data) updateData.longitude = this.parseCoordinate(data.longitude, -180, 180);

    return this.prisma.bar.update({ where: { id: bar.id }, data: updateData });
  }

  /** Convierte una coordenada (número o string) a Float válido; `null` si es inválida o fuera de rango. */
  private parseCoordinate(value: unknown, min: number, max: number): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
    return parsed;
  }

  async setMenuItem(ownerUserId: string, drinkId: string, active: boolean, featured = false) {
    const bar = await this.getByOwner(ownerUserId);
    if (!bar) throw new ForbiddenException('Sin permisos de bar');

    const subscription = await this.prisma.barSubscription.findUnique({
      where: { barId: bar.id },
      select: { plan: true },
    });
    if (isExplorerPlan(normalizeSubscriptionPlan(subscription?.plan))) {
      throw new ForbiddenException(
        'En el plan Explorer, el administrador gestiona las bebidas del menú. Contacta con soporte para modificarlas.',
      );
    }

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
