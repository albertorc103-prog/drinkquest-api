import { BadRequestException } from '@nestjs/common';
import { BarMissionSeasonStatus, BarMissionTemplate, SubscriptionPlan } from '@prisma/client';
import { BarMissionsService } from './bar-missions.service';

describe('BarMissionsService season create — medalTitle legacy optional (FASE 9)', () => {
  const bar = { id: 'bar-a' };
  let seasons: any[];
  let prisma: any;
  let barAccess: any;
  let service: BarMissionsService;

  beforeEach(() => {
    seasons = [];
    prisma = {
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
      barMissionSeason: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async ({ data }: any) => {
          const row = {
            id: `season-${seasons.length + 1}`,
            barId: data.barId,
            title: data.title,
            startsAt: data.startsAt,
            endsAt: data.endsAt,
            status: data.status,
            medalTitle: data.medalTitle,
            medalDescription: data.medalDescription,
            createdAt: new Date(),
            updatedAt: new Date(),
            missions: (data.missions?.create ?? []).map((m: any, i: number) => ({
              id: `mission-${i}`,
              ...m,
            })),
          };
          seasons.push(row);
          return row;
        }),
      },
    };
    barAccess = {
      resolveByOwnerUserId: jest.fn(async () => ({
        bar,
        subscription: { plan: SubscriptionPlan.LEGEND, status: 'ACTIVE' },
      })),
      isSubscriptionActive: jest.fn(() => true),
    };
    service = new BarMissionsService(
      prisma,
      barAccess,
      {} as any,
      {} as any,
    );
  });

  const baseDto = {
    title: 'Temporada verano',
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-08-31T23:59:59.000Z',
    missions: [
      { template: BarMissionTemplate.SCAN_ONCE },
      { template: BarMissionTemplate.SCAN_TWO_DAYS },
      { template: BarMissionTemplate.SCAN_TWO_DRINKS },
    ],
    activate: false,
  };

  it('TEST 30: nueva season puede crearse sin medalTitle legacy', async () => {
    const created = await service.createSeason('owner-a', baseDto as any);
    expect(created.medalTitle).toBe('');
    expect(created.medalDescription).toBe('');
    expect(created.title).toBe('Temporada verano');
    expect(created.status).toBe(BarMissionSeasonStatus.DRAFT);
    expect(created.missions).toHaveLength(3);
  });

  it('TEST 31: season con medalTitle legacy sigue creando correctamente', async () => {
    const created = await service.createSeason('owner-a', {
      ...baseDto,
      medalTitle: 'Medalla Casa Azul',
      medalDescription: 'Completaste la temporada de misiones del local.',
    } as any);
    expect(created.medalTitle).toBe('Medalla Casa Azul');
    expect(created.medalDescription).toContain('Completaste');
  });

  it('TEST 32: medalTitle parcial inválido sigue fallando', async () => {
    await expect(
      service.createSeason('owner-a', {
        ...baseDto,
        medalTitle: 'ab',
        medalDescription: '',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
