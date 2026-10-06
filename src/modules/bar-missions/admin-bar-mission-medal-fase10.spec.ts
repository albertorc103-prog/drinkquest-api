import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMissionMedalConditionType,
  BarMissionMedalVersionStatus,
} from '@prisma/client';
import { AdminBarMissionMedalService } from './admin-bar-mission-medal.service';
import { BarMissionMedalService } from './bar-mission-medal.service';

describe('AdminBarMissionMedalService FASE 10 enrichments', () => {
  const season = {
    id: 'season-a',
    title: 'Temp',
    status: 'ACTIVE',
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    bar: {
      id: 'bar-a',
      businessName: 'The Alchemist',
      slug: 'alchemist',
      logoUrl: null,
      subscription: { plan: 'LEGEND', status: 'ACTIVE' },
    },
  };

  let versions: any[];
  let prisma: any;
  let medals: BarMissionMedalService;
  let admin: AdminBarMissionMedalService;

  beforeEach(() => {
    versions = [
      {
        id: 'v1',
        seasonId: 'season-a',
        version: 1,
        title: 'Antigua',
        description: 'd',
        status: BarMissionMedalVersionStatus.ACTIVE,
        conditionMode: 'ALL',
        xpReward: 10,
        templateId: null,
        designConfig: null,
        reviewNote: null,
        moderatedByAdminId: null,
        moderatedAt: null,
        submittedByUserId: null,
        submittedAt: new Date(),
        approvedAt: new Date(),
        activatedAt: new Date(),
        disabledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        conditions: [
          {
            id: 'c0',
            type: BarMissionMedalConditionType.VISITS,
            targetValue: 1,
            referenceId: null,
            position: 0,
          },
        ],
        season,
      },
      {
        id: 'v2',
        seasonId: 'season-a',
        version: 2,
        title: 'Guardían',
        description: 'desc',
        status: BarMissionMedalVersionStatus.PENDING_REVIEW,
        conditionMode: 'ALL',
        xpReward: 0,
        templateId: null,
        designConfig: null,
        reviewNote: null,
        moderatedByAdminId: null,
        moderatedAt: null,
        submittedByUserId: 'u1',
        submittedAt: new Date(),
        approvedAt: null,
        activatedAt: null,
        disabledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        conditions: [
          {
            id: 'c1',
            type: BarMissionMedalConditionType.MISSION_COMPLETED,
            targetValue: null,
            referenceId: 'mission-a',
            position: 0,
          },
          {
            id: 'c2',
            type: BarMissionMedalConditionType.EVENT_PARTICIPATION,
            targetValue: 1,
            referenceId: null,
            position: 1,
          },
        ],
        season,
      },
    ];

    prisma = {
      $transaction: jest.fn(async (ops: Promise<any>[]) => Promise.all(ops)),
      barMissionMedalVersion: {
        count: jest.fn(async ({ where }: any) =>
          versions.filter((v) => {
            if (where.status && v.status !== where.status) return false;
            return true;
          }).length,
        ),
        findMany: jest.fn(async ({ where }: any) =>
          versions.filter((v) => {
            if (where.status && v.status !== where.status) return false;
            return true;
          }),
        ),
        findUnique: jest.fn(async ({ where }: any) => {
          const row = versions.find((v) => v.id === where.id);
          return row ? { ...row } : null;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          return (
            versions.find((v) => {
              if (where.seasonId && v.seasonId !== where.seasonId) return false;
              if (where.status && v.status !== where.status) return false;
              if (where.NOT?.id && v.id === where.NOT.id) return false;
              return true;
            }) ?? null
          );
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = versions.find((v) => v.id === where.id);
          Object.assign(row, data);
          return { ...row, conditions: row.conditions };
        }),
      },
      barMission: {
        findMany: jest.fn(async () => [{ id: 'mission-a', title: 'Ruta del Alquimista' }]),
      },
    };

    medals = new BarMissionMedalService(prisma as any, {} as any);
    admin = new AdminBarMissionMedalService(prisma as any, medals);
  });

  it('list default PENDING_REVIEW; ALL omite filtro', async () => {
    const pending = await admin.list({});
    expect(pending.items.every((i) => i.status === BarMissionMedalVersionStatus.PENDING_REVIEW)).toBe(
      true,
    );
    const all = await admin.list({ status: 'ALL' });
    expect(all.total).toBe(2);
  });

  it('getDetail enriquece missionTitle, unsupported y activeVersion', async () => {
    const detail = await admin.getDetail('v2');
    expect(detail.conditions[0].missionTitle).toBe('Ruta del Alquimista');
    expect(detail.conditions[1].unsupported).toBe(true);
    expect(detail.hasUnsupportedCondition).toBe(true);
    expect(detail.activeVersion).toMatchObject({ version: 1, title: 'Antigua' });
    expect(detail.bar.businessName).toBe('The Alchemist');
    expect(detail.bar.subscriptionPlan).toBe('LEGEND');
  });

  it('approve bloquea UNSUPPORTED_CONDITION', async () => {
    await expect(admin.approve('v2', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(admin.approve('v2', 'admin-1')).rejects.toMatchObject({
      message: 'UNSUPPORTED_CONDITION',
    });
  });

  it('getDetail not found', async () => {
    await expect(admin.getDetail('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
