import {
  RooftopPackageApprovalStatus,
  RooftopPackageStatus,
} from '@prisma/client';

export type RooftopPackageRow = {
  id: string;
  barId: string;
  title: string;
  description: string | null;
  imageUrl: string;
  includesFood: boolean;
  includesDrinks: boolean;
  priceLabel: string | null;
  startsAt: Date;
  endsAt: Date;
  status: RooftopPackageStatus;
  approvalStatus: RooftopPackageApprovalStatus;
  rejectionReason: string | null;
  moderatedByAdminId: string | null;
  moderatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  bar?: {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
    city?: string | null;
  };
};

export function mapRooftopPackage(row: RooftopPackageRow) {
  return {
    id: row.id,
    barId: row.barId,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    includesFood: row.includesFood,
    includesDrinks: row.includesDrinks,
    priceLabel: row.priceLabel,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    approvalStatus: row.approvalStatus,
    rejectionReason: row.rejectionReason,
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    feedReady:
      row.approvalStatus === RooftopPackageApprovalStatus.APPROVED &&
      row.status === RooftopPackageStatus.ACTIVE,
    bar: row.bar
      ? {
          id: row.bar.id,
          businessName: row.bar.businessName,
          slug: row.bar.slug,
          logoUrl: row.bar.logoUrl,
          city: row.bar.city ?? null,
        }
      : undefined,
  };
}
