import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MagazineSection, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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

  private assertSection(section: MagazineSection) {
    if (section !== MagazineSection.STRONG && section !== MagazineSection.PARA_DATE) {
      throw new BadRequestException('Sección inválida');
    }
  }
}
