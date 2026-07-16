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
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import {
  normalizeSubscriptionPlan,
  specialDrinkLimitForPlan,
  specialDrinksEnabledForPlan,
} from '../subscriptions/subscription-plan.util';
import { CreateSpecialDrinkDto, UpdateSpecialDrinkDto } from './dto/special-drink.dto';
import { mapSpecialDrink } from './mappers/special-drink.mapper';
import { deactivateSpecialDrinkMenu } from './special-drink-materialize.util';

@Injectable()
export class SpecialDrinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
  ) {}

  async listForOwner(ownerUserId: string) {
    const { bar } = await this.assertOwnerCanManageSpecialDrinks(ownerUserId);
    const rows = await this.prisma.barSpecialDrink.findMany({
      where: { barId: bar.id, deletedAt: null },
      include: { materializedDrink: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const limit = specialDrinkLimitForPlan(
      normalizeSubscriptionPlan(
        (await this.prisma.barSubscription.findUnique({ where: { barId: bar.id } }))?.plan,
      ),
    );
    return {
      items: rows.map(mapSpecialDrink),
      limit,
      used: rows.length,
    };
  }

  async create(ownerUserId: string, dto: CreateSpecialDrinkDto) {
    const { bar, plan } = await this.assertOwnerCanManageSpecialDrinks(ownerUserId);
    const limit = specialDrinkLimitForPlan(plan);
    if (limit == null) {
      throw new ForbiddenException('Tu plan no incluye bebidas especializadas.');
    }

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
        rarity: DrinkRarity.COMMON,
        isLimitedEdition: true,
        status: SpecialDrinkStatus.DRAFT,
        approvalStatus: SpecialDrinkApprovalStatus.PENDING_REVIEW,
      },
    });
    return mapSpecialDrink(created);
  }

  /**
   * Edición limitada: si ya estaba aprobada/rechazada/marcada, vuelve a revisión.
   * Rareza siempre COMMON; no se puede cambiar.
   */
  async update(ownerUserId: string, drinkId: string, dto: UpdateSpecialDrinkDto) {
    await this.assertOwnerCanManageSpecialDrinks(ownerUserId);
    const drink = await this.requireOwnedDrink(ownerUserId, drinkId);

    if (drink.status === SpecialDrinkStatus.ARCHIVED) {
      throw new BadRequestException('No se puede editar una bebida archivada.');
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
        rarity: DrinkRarity.COMMON,
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
        'Las bebidas especializadas están exclusivas de los planes Intermedio y Legend.',
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
