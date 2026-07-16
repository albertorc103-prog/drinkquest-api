import {
  DrinkRarity,
  SpecialDrinkApprovalStatus,
  SpecialDrinkStatus,
} from '@prisma/client';

export type SpecialDrinkRow = {
  id: string;
  barId: string;
  name: string;
  recipe: string;
  funFact: string;
  imageUrl: string;
  rarity: DrinkRarity;
  isLimitedEdition: boolean;
  status: SpecialDrinkStatus;
  approvalStatus: SpecialDrinkApprovalStatus;
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
  };
  materializedDrink?: { id: string } | null;
};

export function mapSpecialDrink(row: SpecialDrinkRow) {
  return {
    id: row.id,
    barId: row.barId,
    name: row.name,
    recipe: row.recipe,
    funFact: row.funFact,
    imageUrl: row.imageUrl,
    rarity: row.rarity,
    isLimitedEdition: row.isLimitedEdition,
    status: row.status,
    approvalStatus: row.approvalStatus,
    rejectionReason: row.rejectionReason,
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    materializedDrinkId: row.materializedDrink?.id ?? null,
    qrReady:
      row.approvalStatus === SpecialDrinkApprovalStatus.APPROVED &&
      row.status === SpecialDrinkStatus.ACTIVE &&
      !!row.materializedDrink?.id,
    bar: row.bar
      ? {
          id: row.bar.id,
          businessName: row.bar.businessName,
          slug: row.bar.slug,
          logoUrl: row.bar.logoUrl,
        }
      : undefined,
  };
}
