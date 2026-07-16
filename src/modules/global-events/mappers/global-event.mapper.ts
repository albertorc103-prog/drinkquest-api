import { GlobalEventGoalType, GlobalEventStatus } from '@prisma/client';

type BarSlice = {
  id: string;
  businessName: string;
  slug: string;
  logoUrl: string | null;
  city: string | null;
};

export type GlobalEventRow = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  goalType: GlobalEventGoalType;
  targetCount: number;
  startsAt: Date;
  endsAt: Date;
  status: GlobalEventStatus;
  medalTitle: string;
  medalDescription: string;
  createdAt: Date;
  updatedAt: Date;
  bars?: { bar: BarSlice }[];
  progress?: { progress: number; completedAt: Date | null }[] | { progress: number; completedAt: Date | null } | null;
  medals?: { unlockedAt: Date }[];
};

export function mapGlobalEvent(
  row: GlobalEventRow,
  opts?: { userProgress?: number; completedAt?: Date | null; hasMedal?: boolean },
) {
  const bars = (row.bars ?? []).map((b) => ({
    id: b.bar.id,
    businessName: b.bar.businessName,
    slug: b.bar.slug,
    logoUrl: b.bar.logoUrl,
    city: b.bar.city,
  }));
  const progressRow = Array.isArray(row.progress) ? row.progress[0] : row.progress;
  const progress = opts?.userProgress ?? progressRow?.progress ?? 0;
  const completedAt =
    opts?.completedAt !== undefined
      ? opts.completedAt
      : progressRow?.completedAt ?? null;
  const hasMedal =
    opts?.hasMedal ?? (row.medals != null && row.medals.length > 0);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    goalType: row.goalType,
    targetCount: row.targetCount,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    medalTitle: row.medalTitle,
    medalDescription: row.medalDescription,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    bars,
    barCount: bars.length,
    progress,
    completed: !!completedAt || progress >= row.targetCount,
    completedAt: completedAt?.toISOString() ?? null,
    hasMedal,
  };
}
