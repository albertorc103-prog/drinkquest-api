import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DrinkRarity,
  SpecialDrinkApprovalStatus,
  SpecialDrinkStatus,
  SubscriptionPlan,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import {
  normalizeSubscriptionPlan,
  specialDrinkLimitForPlan,
  specialDrinkQuotasForPlan,
  specialDrinksEnabledForPlan,
  type SpecialDrinkRarityQuotas,
} from '../subscriptions/subscription-plan.util';
import { CreateSpecialDrinkDto, UpdateSpecialDrinkDto } from './dto/special-drink.dto';
import { mapSpecialDrink } from './mappers/special-drink.mapper';
import { deactivateSpecialDrinkMenu } from './special-drink-materialize.util';

const RARITY_LABEL: Record<DrinkRarity, string> = {
  [DrinkRarity.COMMON]: 'común',
  [DrinkRarity.RARE]: 'rara',
  [DrinkRarity.EPIC]: 'épica',
  [DrinkRarity.LEGENDARY]: 'legendaria',
};

@Injectable()
export class SpecialDrinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
  ) {}

  async listForOwner(ownerUserId: string) {
    const { bar, plan } = await this.assertOwnerCanManageSpecialDrinks(ownerUserId);
    const rows = await this.prisma.barSpecialDrink.findMany({
      where: { barId: bar.id, deletedAt: null },
      include: { materializedDrink: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const quotas = specialDrinkQuotasForPlan(plan)!;
    const limit = specialDrinkLimitForPlan(plan)!;
    const usedByRarity = this.countByRarity(rows.map((r) => r.rarity));
    return {
      items: rows.map(mapSpecialDrink),
      limit,
      used: rows.length,
      plan,
      quotas: this.mapQuotaUsage(quotas, usedByRarity),
    };
  }

  async create(ownerUserId: string, dto: CreateSpecialDrinkDto) {
    const { bar, plan } = await this.assertOwnerCanManageSpecialDrinks(ownerUserId);
    const quotas = specialDrinkQuotasForPlan(plan);
    const limit = specialDrinkLimitForPlan(plan);
    if (!quotas || limit == null) {
      throw new ForbiddenException('Tu plan no incluye bebidas especializadas.');
    }

    const rarity = this.resolveRarityForPlan(plan, dto.rarity);
    await this.assertCanOccupyRaritySlot(bar.id, quotas, rarity);

    const used = await this.prisma.barSpecialDrink.count({
      where: { barId: bar.id, deletedAt: null },
    });
    if (used >= limit) {
      throw new BadRequestException(
        `Tu plan permite máximo ${limit} bebidas especializadas. Elimina una para crear otra.`,
      );
    }

    const created = await this.prisma.barSpecialDrink.create({
      data: {
        barId: bar.id,
        name: dto.name.trim(),
        recipe: dto.recipe.trim(),
        funFact: dto.funFact.trim(),
        imageUrl: dto.imageUrl.trim(),
        rarity,
        isLimitedEdition: true,
        status: SpecialDrinkStatus.DRAFT,
        approvalStatus: SpecialDrinkApprovalStatus.PENDING_REVIEW,
      },
    });
    return mapSpecialDrink(created);
  }

  /**
   * Edición: si ya estaba aprobada/rechazada/marcada, vuelve a revisión.
   * Legend puede cambiar rareza dentro de cupos; Intermedio fuerza COMMON.
   */
  async update(ownerUserId: string, drinkId: string, dto: UpdateSpecialDrinkDto) {
    const { plan } = await this.assertOwnerCanManageSpecialDrinks(ownerUserId);
    const drink = await this.requireOwnedDrink(ownerUserId, drinkId);
    const quotas = specialDrinkQuotasForPlan(plan);
    if (!quotas) {
      throw new ForbiddenException('Tu plan no incluye bebidas especializadas.');
    }

    if (drink.status === SpecialDrinkStatus.ARCHIVED) {
      throw new BadRequestException('No se puede editar una bebida archivada.');
    }

    const nextRarity =
      dto.rarity !== undefined
        ? this.resolveRarityForPlan(plan, dto.rarity)
        : this.resolveRarityForPlan(plan, drink.rarity);

    if (nextRarity !== drink.rarity) {
      await this.assertCanOccupyRaritySlot(drink.barId, quotas, nextRarity, drink.id);
    }

    const needsReReview =
      drink.approvalStatus === SpecialDrinkApprovalStatus.APPROVED ||
      drink.approvalStatus === SpecialDrinkApprovalStatus.REJECTED ||
      drink.approvalStatus === SpecialDrinkApprovalStatus.FLAGGED;

    if (needsReReview) {
      await deactivateSpecialDrinkMenu(this.prisma, drink.id);
    }

    const updated = await this.prisma.barSpecialDrink.update({
      where: { id: drink.id },
      data: {
        name: dto.name?.trim(),
        recipe: dto.recipe?.trim(),
        funFact: dto.funFact?.trim(),
        imageUrl: dto.imageUrl?.trim(),
        rarity: nextRarity,
        isLimitedEdition: true,
        ...(needsReReview
          ? {
              approvalStatus: SpecialDrinkApprovalStatus.PENDING_REVIEW,
              rejectionReason: null,
              moderatedByAdminId: null,
              moderatedAt: null,
              status: SpecialDrinkStatus.DRAFT,
            }
          : {}),
      },
      include: { materializedDrink: { select: { id: true } } },
    });
    return mapSpecialDrink(updated);
  }

  async resubmit(ownerUserId: string, drinkId: string) {
    await this.assertOwnerCanManageSpecialDrinks(ownerUserId);
    const drink = await this.requireOwnedDrink(ownerUserId, drinkId);
    if (
      drink.approvalStatus !== SpecialDrinkApprovalStatus.REJECTED &&
      drink.approvalStatus !== SpecialDrinkApprovalStatus.FLAGGED
    ) {
      throw new BadRequestException('Solo se pueden reenviar bebidas rechazadas o marcadas.');
    }

    const updated = await this.prisma.barSpecialDrink.update({
      where: { id: drink.id },
      data: {
        approvalStatus: SpecialDrinkApprovalStatus.PENDING_REVIEW,
        rejectionReason: null,
        moderatedByAdminId: null,
        moderatedAt: null,
        status: SpecialDrinkStatus.DRAFT,
      },
      include: { materializedDrink: { select: { id: true } } },
    });
    return mapSpecialDrink(updated);
  }

  async softDelete(ownerUserId: string, drinkId: string) {
    await this.assertOwnerCanManageSpecialDrinks(ownerUserId);
    const drink = await this.requireOwnedDrink(ownerUserId, drinkId);
    await this.prisma.$transaction(async (tx) => {
      await deactivateSpecialDrinkMenu(tx, drink.id);
      await tx.barSpecialDrink.update({
        where: { id: drink.id },
        data: {
          deletedAt: new Date(),
          status: SpecialDrinkStatus.ARCHIVED,
        },
      });
    });
    return { deleted: true };
  }

  private resolveRarityForPlan(
    plan: SubscriptionPlan,
    requested?: DrinkRarity | null,
  ): DrinkRarity {
    const rarity = requested ?? DrinkRarity.COMMON;
    if (plan === SubscriptionPlan.INTERMEDIATE && rarity !== DrinkRarity.COMMON) {
      throw new BadRequestException(
        'El plan Intermedio solo permite bebidas especializadas de rareza común.',
      );
    }
    const quotas = specialDrinkQuotasForPlan(plan);
    if (!quotas || (quotas[rarity] ?? 0) <= 0) {
      throw new BadRequestException(
        `Tu plan no permite bebidas de rareza ${RARITY_LABEL[rarity]}.`,
      );
    }
    return rarity;
  }

  private async assertCanOccupyRaritySlot(
    barId: string,
    quotas: SpecialDrinkRarityQuotas,
    rarity: DrinkRarity,
    excludeId?: string,
  ) {
    const max = quotas[rarity] ?? 0;
    if (max <= 0) {
      throw new BadRequestException(
        `Tu plan no permite bebidas de rareza ${RARITY_LABEL[rarity]}.`,
      );
    }
    const used = await this.prisma.barSpecialDrink.count({
      where: {
        barId,
        deletedAt: null,
        rarity,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (used >= max) {
      throw new BadRequestException(
        `Cupo agotado: máximo ${max} bebida(s) ${RARITY_LABEL[rarity]}. Elimina o cambia otra.`,
      );
    }
  }

  private countByRarity(rarities: DrinkRarity[]): SpecialDrinkRarityQuotas {
    const counts: SpecialDrinkRarityQuotas = {
      [DrinkRarity.COMMON]: 0,
      [DrinkRarity.RARE]: 0,
      [DrinkRarity.EPIC]: 0,
      [DrinkRarity.LEGENDARY]: 0,
    };
    for (const r of rarities) {
      counts[r] = (counts[r] ?? 0) + 1;
    }
    return counts;
  }

  private mapQuotaUsage(
    limits: SpecialDrinkRarityQuotas,
    used: SpecialDrinkRarityQuotas,
  ) {
    return {
      COMMON: { limit: limits.COMMON, used: used.COMMON },
      RARE: { limit: limits.RARE, used: used.RARE },
      EPIC: { limit: limits.EPIC, used: used.EPIC },
      LEGENDARY: { limit: limits.LEGENDARY, used: used.LEGENDARY },
    };
  }

  private async assertOwnerCanManageSpecialDrinks(ownerUserId: string) {
    const ctx = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    if (!this.barAccess.isSubscriptionActive(ctx)) {
      throw new ForbiddenException(
        'Tu suscripción no está activa. Renueva el plan para gestionar bebidas especializadas.',
      );
    }
    const plan = normalizeSubscriptionPlan(ctx.subscription?.plan);
    if (!specialDrinksEnabledForPlan(plan)) {
      throw new ForbiddenException(
        'Las bebidas especializadas son exclusivas de los planes Intermedio y Legend.',
      );
    }
    return { bar: ctx.bar, plan };
  }

  private async requireOwnedDrink(ownerUserId: string, drinkId: string) {
    const { bar } = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    const drink = await this.prisma.barSpecialDrink.findFirst({
      where: { id: drinkId, barId: bar.id, deletedAt: null },
    });
    if (!drink) throw new NotFoundException('Bebida especializada no encontrada.');
    return drink;
  }
}
