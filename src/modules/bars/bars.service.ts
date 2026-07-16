import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RooftopVerificationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  isExplorerPlan,
  normalizeSubscriptionPlan,
  rooftopEnabledForPlan,
} from '../subscriptions/subscription-plan.util';

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

    if ('hasOutdoorSpace' in data) {
      const subscription = await this.prisma.barSubscription.findUnique({
        where: { barId: bar.id },
        select: { plan: true },
      });
      const plan = normalizeSubscriptionPlan(subscription?.plan);
      if (!rooftopEnabledForPlan(plan)) {
        throw new ForbiddenException(
          'Declarar terraza/jardín para Rooftop es exclusivo del plan Legend.',
        );
      }
      const wantsOutdoor = this.parseBoolean(data.hasOutdoorSpace);
      updateData.hasOutdoorSpace = wantsOutdoor;
      if (wantsOutdoor) {
        if (
          bar.rooftopStatus === RooftopVerificationStatus.NONE ||
          bar.rooftopStatus === RooftopVerificationStatus.REJECTED
        ) {
          updateData.rooftopStatus = RooftopVerificationStatus.PENDING;
          updateData.rooftopRejectionReason = null;
          updateData.rooftopReviewedAt = null;
          updateData.rooftopReviewedByAdminId = null;
        }
      } else if (bar.rooftopStatus !== RooftopVerificationStatus.APPROVED) {
        updateData.rooftopStatus = RooftopVerificationStatus.NONE;
        updateData.rooftopRejectionReason = null;
      } else {
        throw new BadRequestException(
          'Tu terraza/jardín ya fue verificada. Contacta a soporte si quieres desactivarla.',
        );
      }
    }

    return this.prisma.bar.update({ where: { id: bar.id }, data: updateData });
  }

  private parseBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1') return true;
      if (v === 'false' || v === '0') return false;
    }
    if (typeof value === 'number') return value !== 0;
    return Boolean(value);
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
