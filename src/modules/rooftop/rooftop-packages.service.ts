import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  RooftopPackageApprovalStatus,
  RooftopPackageStatus,
  RooftopVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BarAccessService } from '../subscriptions/bar-access.service';
import {
  normalizeSubscriptionPlan,
  rooftopEnabledForPlan,
} from '../subscriptions/subscription-plan.util';
import { CreateRooftopPackageDto, UpdateRooftopPackageDto } from './dto/rooftop-package.dto';
import { mapRooftopPackage } from './mappers/rooftop-package.mapper';

@Injectable()
export class RooftopPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barAccess: BarAccessService,
  ) {}

  async listForOwner(ownerUserId: string) {
    const { bar } = await this.assertOwnerCanManageRooftop(ownerUserId);
    const rooftop = await this.loadRooftopFlags(bar.id);
    const rows = await this.prisma.barRooftopPackage.findMany({
      where: { barId: bar.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map(mapRooftopPackage),
      rooftopStatus: rooftop.rooftopStatus,
      hasOutdoorSpace: rooftop.hasOutdoorSpace,
      canPublishPackages: rooftop.rooftopStatus === RooftopVerificationStatus.APPROVED,
    };
  }

  async create(ownerUserId: string, dto: CreateRooftopPackageDto) {
    const { bar } = await this.assertOwnerCanManageRooftop(ownerUserId);
    const rooftop = await this.loadRooftopFlags(bar.id);
    this.assertRooftopApproved(rooftop.rooftopStatus);
    this.assertDateRange(dto.startsAt, dto.endsAt);

    const created = await this.prisma.barRooftopPackage.create({
      data: {
        barId: bar.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        imageUrl: dto.imageUrl.trim(),
        includesFood: dto.includesFood ?? true,
        includesDrinks: dto.includesDrinks ?? true,
        priceLabel: dto.priceLabel?.trim() || null,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        status: RooftopPackageStatus.DRAFT,
        approvalStatus: RooftopPackageApprovalStatus.PENDING_REVIEW,
      },
    });
    return mapRooftopPackage(created);
  }

  async update(ownerUserId: string, packageId: string, dto: UpdateRooftopPackageDto) {
    await this.assertOwnerCanManageRooftop(ownerUserId);
    const pkg = await this.requireOwnedPackage(ownerUserId, packageId);
    if (pkg.status === RooftopPackageStatus.ARCHIVED) {
      throw new BadRequestException('No se puede editar un paquete archivado.');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : pkg.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : pkg.endsAt;
    this.assertDateRange(startsAt.toISOString(), endsAt.toISOString());

    const needsReReview =
      pkg.approvalStatus === RooftopPackageApprovalStatus.APPROVED ||
      pkg.approvalStatus === RooftopPackageApprovalStatus.REJECTED ||
      pkg.approvalStatus === RooftopPackageApprovalStatus.FLAGGED;

    const updated = await this.prisma.barRooftopPackage.update({
      where: { id: pkg.id },
      data: {
        title: dto.title?.trim(),
        description: dto.description !== undefined ? dto.description.trim() || null : undefined,
        imageUrl: dto.imageUrl?.trim(),
        includesFood: dto.includesFood,
        includesDrinks: dto.includesDrinks,
        priceLabel:
          dto.priceLabel !== undefined ? dto.priceLabel.trim() || null : undefined,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        ...(needsReReview
          ? {
              approvalStatus: RooftopPackageApprovalStatus.PENDING_REVIEW,
              rejectionReason: null,
              moderatedByAdminId: null,
              moderatedAt: null,
              status: RooftopPackageStatus.DRAFT,
            }
          : {}),
      },
    });
    return mapRooftopPackage(updated);
  }

  async resubmit(ownerUserId: string, packageId: string) {
    await this.assertOwnerCanManageRooftop(ownerUserId);
    const pkg = await this.requireOwnedPackage(ownerUserId, packageId);
    if (
      pkg.approvalStatus !== RooftopPackageApprovalStatus.REJECTED &&
      pkg.approvalStatus !== RooftopPackageApprovalStatus.FLAGGED
    ) {
      throw new BadRequestException('Solo se pueden reenviar paquetes rechazados o marcados.');
    }
    const updated = await this.prisma.barRooftopPackage.update({
      where: { id: pkg.id },
      data: {
        approvalStatus: RooftopPackageApprovalStatus.PENDING_REVIEW,
        rejectionReason: null,
        moderatedByAdminId: null,
        moderatedAt: null,
        status: RooftopPackageStatus.DRAFT,
      },
    });
    return mapRooftopPackage(updated);
  }

  async softDelete(ownerUserId: string, packageId: string) {
    await this.assertOwnerCanManageRooftop(ownerUserId);
    const pkg = await this.requireOwnedPackage(ownerUserId, packageId);
    await this.prisma.barRooftopPackage.update({
      where: { id: pkg.id },
      data: {
        deletedAt: new Date(),
        status: RooftopPackageStatus.ARCHIVED,
      },
    });
    return { deleted: true };
  }

  private assertDateRange(startsAt: string, endsAt: string) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new BadRequestException('Fechas inválidas.');
    }
    if (end <= start) {
      throw new BadRequestException('La fecha de fin debe ser posterior al inicio.');
    }
  }

  private assertRooftopApproved(status: RooftopVerificationStatus) {
    if (status !== RooftopVerificationStatus.APPROVED) {
      throw new ForbiddenException(
        'Primero declara terraza/jardín y espera la verificación del administrador.',
      );
    }
  }

  private async loadRooftopFlags(barId: string) {
    const bar = await this.prisma.bar.findFirstOrThrow({
      where: { id: barId, deletedAt: null },
      select: { rooftopStatus: true, hasOutdoorSpace: true },
    });
    return bar;
  }

  private async assertOwnerCanManageRooftop(ownerUserId: string) {
    const ctx = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    if (!this.barAccess.isSubscriptionActive(ctx)) {
      throw new ForbiddenException(
        'Tu suscripción no está activa. Renueva el plan para gestionar Rooftop.',
      );
    }
    const plan = normalizeSubscriptionPlan(ctx.subscription?.plan);
    if (!rooftopEnabledForPlan(plan)) {
      throw new ForbiddenException('Rooftop es exclusivo del plan Legend.');
    }
    return { bar: ctx.bar, plan };
  }

  private async requireOwnedPackage(ownerUserId: string, packageId: string) {
    const { bar } = await this.barAccess.resolveByOwnerUserId(ownerUserId);
    const pkg = await this.prisma.barRooftopPackage.findFirst({
      where: { id: packageId, barId: bar.id, deletedAt: null },
    });
    if (!pkg) throw new NotFoundException('Paquete Rooftop no encontrado.');
    return pkg;
  }
}
