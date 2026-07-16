import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationType,
  RooftopPackageApprovalStatus,
  RooftopPackageStatus,
  RooftopVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { mapRooftopPackage } from './mappers/rooftop-package.mapper';

@Injectable()
export class AdminRooftopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listPendingVerifications(limit = 100) {
    const bars = await this.prisma.bar.findMany({
      where: {
        deletedAt: null,
        rooftopStatus: RooftopVerificationStatus.PENDING,
        hasOutdoorSpace: true,
      },
      include: {
        owner: { select: { email: true, displayName: true } },
        subscription: { select: { plan: true, status: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return {
      items: bars.map((bar) => ({
        id: bar.id,
        businessName: bar.businessName,
        slug: bar.slug,
        city: bar.city,
        address: bar.address,
        logoUrl: bar.logoUrl,
        bannerUrl: bar.bannerUrl,
        description: bar.description,
        hasOutdoorSpace: bar.hasOutdoorSpace,
        rooftopStatus: bar.rooftopStatus,
        rooftopRejectionReason: bar.rooftopRejectionReason,
        plan: bar.subscription?.plan ?? null,
        subscriptionStatus: bar.subscription?.status ?? null,
        ownerEmail: bar.owner?.email ?? null,
        ownerName: bar.owner?.displayName ?? null,
      })),
      total: bars.length,
    };
  }

  async approveVerification(barId: string, adminUserId: string) {
    const bar = await this.requirePendingBar(barId);
    const updated = await this.prisma.bar.update({
      where: { id: bar.id },
      data: {
        rooftopStatus: RooftopVerificationStatus.APPROVED,
        rooftopRejectionReason: null,
        rooftopReviewedAt: new Date(),
        rooftopReviewedByAdminId: adminUserId,
        hasOutdoorSpace: true,
      },
    });
    await this.notifications.notifyBarOwner(
      updated.id,
      NotificationType.ROOFTOP_VERIFIED,
      'Terraza/jardín verificada',
      'Ya puedes publicar paquetes Rooftop (comida + bebidas).',
      { barId: updated.id, category: 'rooftop' },
    );
    return {
      id: updated.id,
      rooftopStatus: updated.rooftopStatus,
      hasOutdoorSpace: updated.hasOutdoorSpace,
    };
  }

  async rejectVerification(barId: string, adminUserId: string, reason?: string) {
    const bar = await this.requirePendingBar(barId);
    const trimmed = (reason ?? 'No se pudo verificar terraza o jardín.').trim();
    if (trimmed.length < 5) {
      throw new BadRequestException('Indica un motivo de al menos 5 caracteres.');
    }
    const updated = await this.prisma.bar.update({
      where: { id: bar.id },
      data: {
        rooftopStatus: RooftopVerificationStatus.REJECTED,
        rooftopRejectionReason: trimmed,
        rooftopReviewedAt: new Date(),
        rooftopReviewedByAdminId: adminUserId,
      },
    });
    await this.notifications.notifyBarOwner(
      updated.id,
      NotificationType.ROOFTOP_REJECTED,
      'Verificación Rooftop rechazada',
      trimmed,
      { barId: updated.id, reason: trimmed },
    );
    return {
      id: updated.id,
      rooftopStatus: updated.rooftopStatus,
      rooftopRejectionReason: updated.rooftopRejectionReason,
    };
  }

  async listPendingPackages(limit = 100) {
    const rows = await this.prisma.barRooftopPackage.findMany({
      where: {
        deletedAt: null,
        approvalStatus: RooftopPackageApprovalStatus.PENDING_REVIEW,
      },
      include: {
        bar: {
          select: { id: true, businessName: true, slug: true, logoUrl: true, city: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return { items: rows.map(mapRooftopPackage), total: rows.length };
  }

  async approvePackage(packageId: string, adminUserId: string) {
    const pkg = await this.requirePackage(packageId);
    const updated = await this.prisma.barRooftopPackage.update({
      where: { id: pkg.id },
      data: {
        approvalStatus: RooftopPackageApprovalStatus.APPROVED,
        status: RooftopPackageStatus.ACTIVE,
        rejectionReason: null,
        moderatedByAdminId: adminUserId,
        moderatedAt: new Date(),
      },
      include: {
        bar: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
          },
        },
      },
    });

    await this.notifications.notifyBarOwner(
      updated.barId,
      NotificationType.ROOFTOP_PACKAGE_APPROVED,
      'Paquete Rooftop aprobado',
      `"${updated.title}" ya aparece en Rooftop.`,
      { packageId: updated.id, barId: updated.barId },
    );
    await this.notifications.notifyAllUsers(
      NotificationType.ROOFTOP_PACKAGE_PUBLISHED,
      'Nuevo paquete Rooftop',
      `${updated.bar.businessName} publicó "${updated.title}".`,
      {
        packageId: updated.id,
        barId: updated.barId,
        category: 'rooftop',
      },
    );

    return mapRooftopPackage(updated);
  }

  async rejectPackage(packageId: string, adminUserId: string, reason: string) {
    const pkg = await this.requirePackage(packageId);
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      throw new BadRequestException('Indica un motivo de al menos 5 caracteres.');
    }
    const updated = await this.prisma.barRooftopPackage.update({
      where: { id: pkg.id },
      data: {
        approvalStatus: RooftopPackageApprovalStatus.REJECTED,
        status: RooftopPackageStatus.DRAFT,
        rejectionReason: trimmed,
        moderatedByAdminId: adminUserId,
        moderatedAt: new Date(),
      },
      include: {
        bar: {
          select: { id: true, businessName: true, slug: true, logoUrl: true, city: true },
        },
      },
    });
    await this.notifications.notifyBarOwner(
      updated.barId,
      NotificationType.ROOFTOP_PACKAGE_REJECTED,
      'Paquete Rooftop rechazado',
      `"${updated.title}": ${trimmed}`,
      { packageId: updated.id, barId: updated.barId, reason: trimmed },
    );
    return mapRooftopPackage(updated);
  }

  async flagPackage(packageId: string, adminUserId: string, reason: string) {
    const pkg = await this.requirePackage(packageId);
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      throw new BadRequestException('Indica un motivo de al menos 5 caracteres.');
    }
    const updated = await this.prisma.barRooftopPackage.update({
      where: { id: pkg.id },
      data: {
        approvalStatus: RooftopPackageApprovalStatus.FLAGGED,
        status:
          pkg.status === RooftopPackageStatus.ACTIVE
            ? RooftopPackageStatus.DRAFT
            : pkg.status,
        rejectionReason: trimmed,
        moderatedByAdminId: adminUserId,
        moderatedAt: new Date(),
      },
      include: {
        bar: {
          select: { id: true, businessName: true, slug: true, logoUrl: true, city: true },
        },
      },
    });
    await this.notifications.notifyBarOwner(
      updated.barId,
      NotificationType.ROOFTOP_PACKAGE_FLAGGED,
      'Paquete Rooftop marcado',
      `"${updated.title}" requiere revisión: ${trimmed}`,
      { packageId: updated.id, barId: updated.barId, reason: trimmed },
    );
    return mapRooftopPackage(updated);
  }

  private async requirePendingBar(barId: string) {
    const bar = await this.prisma.bar.findFirst({
      where: { id: barId, deletedAt: null },
    });
    if (!bar) throw new NotFoundException('Local no encontrado.');
    if (bar.rooftopStatus !== RooftopVerificationStatus.PENDING) {
      throw new BadRequestException('Este local no tiene verificación Rooftop pendiente.');
    }
    return bar;
  }

  private async requirePackage(packageId: string) {
    const pkg = await this.prisma.barRooftopPackage.findFirst({
      where: { id: packageId, deletedAt: null },
    });
    if (!pkg) throw new NotFoundException('Paquete Rooftop no encontrado.');
    return pkg;
  }
}
