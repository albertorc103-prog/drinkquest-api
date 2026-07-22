import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MagazineSection, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import {
  normalizeSubscriptionPlan,
  strongMagazinePromoEnabledForPlan,
  strongMagazinePromoLimit,
} from '../subscriptions/subscription-plan.util';
import {
  CreateBarStrongMagazineDto,
  STRONG_PROMO_CATEGORIES,
  UpdateBarStrongMagazineDto,
} from './dto/bar-strong-magazine.dto';

export type CreateMagazineEditorialInput = {
  section: MagazineSection;
  title: string;
  teaser: string;
  category?: string;
  imageUrl?: string;
  statusBadge?: string;
  etaLabel?: string;
  barId?: string | null;
  drinkId?: string | null;
  venueNote?: string | null;
  sortOrder?: number;
  published?: boolean;
};

@Injectable()
export class MagazineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
  ) {}

  private include = {
    bar: {
      select: {
        id: true,
        businessName: true,
        city: true,
        logoUrl: true,
      },
    },
    drink: {
      select: {
        id: true,
        name: true,
        imageUrl: true,
        slug: true,
      },
    },
  } as const;

  async feed(section: MagazineSection, page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const where: Prisma.MagazineEditorialWhereInput = {
      section,
      published: true,
      deletedAt: null,
    };
    const [items, total] = await Promise.all([
      this.prisma.magazineEditorial.findMany({
        where,
        include: this.include,
        orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.magazineEditorial.count({ where }),
    ]);
    return { items, total, page, limit, section };
  }

  async listAdmin(section?: MagazineSection) {
    return this.prisma.magazineEditorial.findMany({
      where: {
        deletedAt: null,
        ...(section ? { section } : {}),
      },
      include: this.include,
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(input: CreateMagazineEditorialInput) {
    this.assertSection(input.section);
    const title = input.title?.trim();
    const teaser = input.teaser?.trim();
    if (!title || title.length < 2) throw new BadRequestException('Título requerido');
    if (!teaser || teaser.length < 4) throw new BadRequestException('Teaser requerido');
    return this.prisma.magazineEditorial.create({
      data: {
        section: input.section,
        title,
        teaser,
        category: input.category?.trim() || 'EDITORIAL',
        imageUrl: input.imageUrl?.trim() || null,
        statusBadge: input.statusBadge?.trim() || 'EN BARRA',
        etaLabel: input.etaLabel?.trim() || 'ESTA SEMANA',
        barId: input.barId || null,
        drinkId: input.drinkId || null,
        venueNote: input.venueNote?.trim() || null,
        sortOrder: input.sortOrder ?? 100,
        published: input.published ?? true,
        publishedAt: input.published === false ? null : new Date(),
      },
      include: this.include,
    });
  }

  async update(id: string, input: Partial<CreateMagazineEditorialInput>) {
    const existing = await this.prisma.magazineEditorial.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Editorial no encontrado');
    if (input.section) this.assertSection(input.section);
    return this.prisma.magazineEditorial.update({
      where: { id },
      data: {
        ...(input.section ? { section: input.section } : {}),
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.teaser !== undefined ? { teaser: input.teaser.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category.trim() || 'EDITORIAL' } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl?.trim() || null } : {}),
        ...(input.statusBadge !== undefined
          ? { statusBadge: input.statusBadge.trim() || 'EN BARRA' }
          : {}),
        ...(input.etaLabel !== undefined ? { etaLabel: input.etaLabel.trim() || 'ESTA SEMANA' } : {}),
        ...(input.barId !== undefined ? { barId: input.barId || null } : {}),
        ...(input.drinkId !== undefined ? { drinkId: input.drinkId || null } : {}),
        ...(input.venueNote !== undefined ? { venueNote: input.venueNote?.trim() || null } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.published !== undefined
          ? {
              published: input.published,
              publishedAt: input.published ? existing.publishedAt ?? new Date() : null,
            }
          : {}),
      },
      include: this.include,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.magazineEditorial.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Editorial no encontrado');
    await this.prisma.magazineEditorial.update({
      where: { id },
      data: { deletedAt: new Date(), published: false },
    });
    return { ok: true };
  }

  async listStrongForBarOwner(ownerUserId: string) {
    const { bar } = await this.requireLegendBar(ownerUserId);
    return this.prisma.magazineEditorial.findMany({
      where: {
        section: MagazineSection.STRONG,
        barId: bar.id,
        deletedAt: null,
      },
      include: this.include,
      orderBy: [{ published: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createStrongForBar(ownerUserId: string, dto: CreateBarStrongMagazineDto) {
    const { bar } = await this.requireLegendBar(ownerUserId);
    await this.assertStrongQuota(bar.id);
    if (dto.drinkId) await this.assertDrinkExists(dto.drinkId);

    const category = this.normalizeStrongCategory(dto.category);
    const published = dto.published !== false;

    return this.prisma.magazineEditorial.create({
      data: {
        section: MagazineSection.STRONG,
        title: dto.title.trim(),
        teaser: dto.teaser.trim(),
        category,
        imageUrl: dto.imageUrl?.trim() || null,
        statusBadge: 'PROMO LEGEND',
        etaLabel: 'EN BARRA',
        barId: bar.id,
        drinkId: dto.drinkId || null,
        venueNote: dto.venueNote?.trim() || null,
        sortOrder: 150,
        published,
        publishedAt: published ? new Date() : null,
      },
      include: this.include,
    });
  }

  async updateStrongForBar(
    ownerUserId: string,
    id: string,
    dto: UpdateBarStrongMagazineDto,
  ) {
    const { bar } = await this.requireLegendBar(ownerUserId);
    const existing = await this.requireOwnedStrong(bar.id, id);

    if (dto.published === true && !existing.published) {
      await this.assertStrongQuota(bar.id, existing.id);
    }
    if (dto.drinkId) await this.assertDrinkExists(dto.drinkId);

    const published = dto.published;
    return this.prisma.magazineEditorial.update({
      where: { id: existing.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.teaser !== undefined ? { teaser: dto.teaser.trim() } : {}),
        ...(dto.category !== undefined
          ? { category: this.normalizeStrongCategory(dto.category) }
          : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl?.trim() || null } : {}),
        ...(dto.drinkId !== undefined ? { drinkId: dto.drinkId || null } : {}),
        ...(dto.venueNote !== undefined ? { venueNote: dto.venueNote?.trim() || null } : {}),
        ...(published !== undefined
          ? {
              published,
              publishedAt: published ? existing.publishedAt ?? new Date() : null,
              statusBadge: published ? 'PROMO LEGEND' : 'BORRADOR',
            }
          : {}),
      },
      include: this.include,
    });
  }

  async removeStrongForBar(ownerUserId: string, id: string) {
    const { bar } = await this.requireLegendBar(ownerUserId);
    const existing = await this.requireOwnedStrong(bar.id, id);
    await this.prisma.magazineEditorial.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), published: false },
    });
    return { ok: true };
  }

  private async requireLegendBar(ownerUserId: string) {
    const resolved = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    const plan = normalizeSubscriptionPlan(resolved.subscription?.plan);
    if (!strongMagazinePromoEnabledForPlan(plan)) {
      throw new ForbiddenException(
        'Publicar en la sección Fuerte es exclusivo del plan Legend.',
      );
    }
    return resolved;
  }

  private async requireOwnedStrong(barId: string, id: string) {
    const existing = await this.prisma.magazineEditorial.findFirst({
      where: {
        id,
        barId,
        section: MagazineSection.STRONG,
        deletedAt: null,
      },
    });
    if (!existing) throw new NotFoundException('Promo Fuerte no encontrada.');
    return existing;
  }

  private async assertStrongQuota(barId: string, excludeId?: string) {
    const publishedCount = await this.prisma.magazineEditorial.count({
      where: {
        barId,
        section: MagazineSection.STRONG,
        published: true,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    const limit = strongMagazinePromoLimit();
    if (publishedCount >= limit) {
      throw new BadRequestException(
        `Límite de ${limit} promos publicadas en Fuerte. Retira una para publicar otra.`,
      );
    }
  }

  private async assertDrinkExists(drinkId: string) {
    const drink = await this.prisma.drink.findFirst({
      where: { id: drinkId, deletedAt: null },
      select: { id: true },
    });
    if (!drink) throw new BadRequestException('Bebida no encontrada en el catálogo.');
  }

  private normalizeStrongCategory(raw?: string): string {
    const v = String(raw ?? 'SHOT').trim().toUpperCase();
    if ((STRONG_PROMO_CATEGORIES as readonly string[]).includes(v)) return v;
    return 'SHOT';
  }

  private assertSection(section: MagazineSection) {
    if (section !== MagazineSection.STRONG && section !== MagazineSection.PARA_DATE) {
      throw new BadRequestException('Sección inválida');
    }
  }
}
