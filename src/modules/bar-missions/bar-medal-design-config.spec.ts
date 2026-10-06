import { BadRequestException } from '@nestjs/common';
import {
  BarMissionMedalConditionMode,
  BarMissionMedalConditionType,
  BarMissionMedalVersionStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { AdminBarMissionMedalService } from './admin-bar-mission-medal.service';
import {
  LEGACY_BAR_MEDAL_DESIGN,
  resolveDesignConfigForClient,
  validateDesignConfigInput,
} from './bar-medal-design-config';
import { BarMissionMedalService } from './bar-mission-medal.service';

const baseDesign = {
  schemaVersion: 1 as const,
  shape: 'HEXAGON',
  style: 'MYSTIC',
  material: 'OBSIDIAN',
  palette: 'ELECTRIC_BLUE',
  identityMode: 'DRINKQUEST_EMBLEM',
  identityPlacement: 'PRIMARY',
  emblem: 'COCKTAIL_GLASS',
  ornaments: ['STARS', 'ALCHEMY'],
};

describe('Bar medal designConfig V1', () => {
  it('1. designConfig válido', () => {
    const cfg = validateDesignConfigInput(baseDesign);
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.shape).toBe('HEXAGON');
    expect(cfg.ornaments).toEqual(['STARS', 'ALCHEMY']);
  });

  it('2. shape inválida', () => {
    expect(() => validateDesignConfigInput({ ...baseDesign, shape: 'STAR' })).toThrow(
      BadRequestException,
    );
  });

  it('3. style inválido', () => {
    expect(() => validateDesignConfigInput({ ...baseDesign, style: 'RETRO' })).toThrow(
      BadRequestException,
    );
  });

  it('4. material inválido', () => {
    expect(() => validateDesignConfigInput({ ...baseDesign, material: 'WOOD' })).toThrow(
      BadRequestException,
    );
  });

  it('5. palette inválida', () => {
    expect(() => validateDesignConfigInput({ ...baseDesign, palette: 'RAINBOW' })).toThrow(
      BadRequestException,
    );
  });

  it('6. >2 ornaments', () => {
    expect(() =>
      validateDesignConfigInput({
        ...baseDesign,
        ornaments: ['STARS', 'ALCHEMY', 'SPARKS'],
      }),
    ).toThrow(BadRequestException);
  });

  it('9. MONOGRAM sin texto rechazado', () => {
    expect(() =>
      validateDesignConfigInput({
        ...baseDesign,
        identityMode: 'MONOGRAM',
        monogram: '',
        emblem: null,
      }),
    ).toThrow(BadRequestException);
  });

  it('10. monogram >3 rechazado', () => {
    expect(() =>
      validateDesignConfigInput({
        ...baseDesign,
        identityMode: 'MONOGRAM',
        monogram: 'TOOLONG',
      }),
    ).toThrow(BadRequestException);
  });

  it('11. emblem inválido', () => {
    expect(() =>
      validateDesignConfigInput({ ...baseDesign, emblem: 'UNICORN' }),
    ).toThrow(BadRequestException);
  });

  it('17. legacy sin config tiene fallback seguro', () => {
    const r = resolveDesignConfigForClient(null);
    expect(r.isLegacyFallback).toBe(true);
    expect(r.designConfigValid).toBe(false);
    expect(r.designConfig).toEqual(LEGACY_BAR_MEDAL_DESIGN);
  });
});

describe('BarMissionMedalService designConfig integración', () => {
  const barA = { id: 'bar-a', logoUrl: 'https://cdn.example/feed/owner/logo-a.png' };
  const seasonA = {
    id: 'season-a',
    barId: 'bar-a',
    deletedAt: null,
    title: 'Temp',
    medalTitle: 'Medalla',
    medalDescription: 'Desc',
    currentMedalVersionId: null as string | null,
  };
  const missionA = {
    id: 'mission-a',
    seasonId: 'season-a',
    season: { id: 'season-a', barId: 'bar-a' },
  };

  let versions: any[];
  let conditions: any[];
  let prisma: any;
  let barAccess: any;
  let service: BarMissionMedalService;
  let admin: AdminBarMissionMedalService;

  const validDto = {
    title: 'Guardian',
    description: 'Has demostrado conocer el local.',
    conditionMode: BarMissionMedalConditionMode.ALL,
    conditions: [{ type: BarMissionMedalConditionType.VISITS, targetValue: 3 }],
    designConfig: { ...baseDesign },
  };

  beforeEach(() => {
    versions = [];
    conditions = [];
    seasonA.currentMedalVersionId = null;

    prisma = {
      bar: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.id === barA.id) return { logoUrl: barA.logoUrl };
          return null;
        }),
      },
      barMissionSeason: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.id === seasonA.id && where.barId === barA.id) return { ...seasonA };
          return null;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          if (where.id === seasonA.id) Object.assign(seasonA, data);
          return seasonA;
        }),
      },
      barMission: {
        findMany: jest.fn(async ({ where }: any) => {
          const ids: string[] = where.id?.in ?? [];
          return [missionA].filter((m) => ids.includes(m.id));
        }),
      },
      barMissionMedalVersion: {
        count: jest.fn(async ({ where }: any) =>
          versions.filter((v) => v.seasonId === where.seasonId).length,
        ),
        findFirst: jest.fn(async ({ where, orderBy }: any) => {
          let rows = versions.filter((v) => {
            if (where.seasonId && v.seasonId !== where.seasonId) return false;
            if (where.id && v.id !== where.id) return false;
            if (where.status) {
              if (typeof where.status === 'string' && v.status !== where.status) return false;
              if (where.status.in && !where.status.in.includes(v.status)) return false;
            }
            return true;
          });
          if (orderBy?.version === 'desc') rows = rows.sort((a, b) => b.version - a.version);
          const row = rows[0];
          if (!row) return null;
          return {
            ...row,
            conditions: conditions.filter((c) => c.medalVersionId === row.id),
          };
        }),
        findUnique: jest.fn(async ({ where }: any) => {
          const row = versions.find((v) => v.id === where.id);
          if (!row) return null;
          return {
            ...row,
            conditions: conditions.filter((c) => c.medalVersionId === row.id),
          };
        }),
        findMany: jest.fn(async ({ where }: any) =>
          versions
            .filter((v) => !where?.seasonId || v.seasonId === where.seasonId)
            .map((v) => ({
              ...v,
              conditions: conditions.filter((c) => c.medalVersionId === v.id),
            })),
        ),
        aggregate: jest.fn(async ({ where }: any) => {
          const rows = versions.filter((v) => v.seasonId === where.seasonId);
          return { _max: { version: rows.reduce((m, v) => Math.max(m, v.version), 0) || null } };
        }),
        create: jest.fn(async ({ data }: any) => {
          const id = `ver-${versions.length + 1}`;
          const row = {
            id,
            seasonId: data.seasonId,
            version: data.version,
            title: data.title,
            description: data.description,
            status: data.status,
            conditionMode: data.conditionMode,
            xpReward: data.xpReward ?? 0,
            templateId: data.templateId ?? null,
            designConfig: data.designConfig ?? null,
            reviewNote: null,
            moderatedByAdminId: null,
            moderatedAt: null,
            submittedByUserId: null,
            submittedAt: null,
            approvedAt: null,
            activatedAt: null,
            disabledAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          versions.push(row);
          const createdConds = (data.conditions?.create ?? []).map((c: any, i: number) => {
            const cond = {
              id: `cond-${conditions.length + 1}`,
              medalVersionId: id,
              type: c.type,
              targetValue: c.targetValue ?? null,
              referenceId: c.referenceId ?? null,
              position: c.position ?? i,
            };
            conditions.push(cond);
            return cond;
          });
          return { ...row, conditions: createdConds };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = versions.find((v) => v.id === where.id);
          Object.assign(row, data);
          return {
            ...row,
            conditions: conditions.filter((c) => c.medalVersionId === row.id),
          };
        }),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      barMissionMedalCondition: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        createMany: jest.fn(async () => ({ count: 0 })),
      },
      uploadAsset: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.id === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') {
            return {
              id: where.id,
              ownerUserId: 'owner-a',
              publicUrl: 'https://cdn.example/feed/owner/logo-a.png',
            };
          }
          if (where.id === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') {
            return {
              id: where.id,
              ownerUserId: 'owner-other',
              publicUrl: 'https://cdn.example/feed/other/logo.png',
            };
          }
          return null;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          if (
            where.ownerUserId === 'owner-a' &&
            where.publicUrl === 'https://cdn.example/feed/owner/logo-a.png'
          ) {
            return {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              ownerUserId: 'owner-a',
              publicUrl: where.publicUrl,
            };
          }
          return null;
        }),
      },
      $transaction: jest.fn(async (arg: any) => {
        if (typeof arg === 'function') return arg(prisma);
        return Promise.all(arg);
      }),
    };

    barAccess = {
      resolveByOwnerUserId: jest.fn(async (userId: string) => ({
        bar: barA,
        subscription: {
          plan: SubscriptionPlan.LEGEND,
          status: SubscriptionStatus.ACTIVE,
        },
      })),
      isSubscriptionActive: () => true,
    };

    service = new BarMissionMedalService(prisma, barAccess);
    admin = new AdminBarMissionMedalService(prisma, service);
  });

  it('7. identity LOGO válido', async () => {
    const created = await service.createDraft('owner-a', 'season-a', {
      ...validDto,
      designConfig: {
        ...baseDesign,
        identityMode: 'LOGO',
        identityPlacement: 'PRIMARY',
        identityAssetId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        emblem: 'COCKTAIL_GLASS',
      },
    } as any);
    expect(created.designConfigValid).toBe(true);
    expect(created.visual.identityMode).toBe('LOGO');
    expect(created.visual.identityAssetUrl).toBe(
      'https://cdn.example/feed/owner/logo-a.png',
    );
  });

  it('8. logo de otro bar rechazado', async () => {
    await expect(
      service.createDraft('owner-a', 'season-a', {
        ...validDto,
        designConfig: {
          ...baseDesign,
          identityMode: 'LOGO',
          identityAssetId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('12. ACTIVE no editable', async () => {
    const draft = await service.createDraft('owner-a', 'season-a', validDto as any);
    await prisma.barMissionMedalVersion.update({
      where: { id: draft.id },
      data: { status: BarMissionMedalVersionStatus.ACTIVE },
    });
    await expect(
      service.updateDraft('owner-a', 'season-a', draft.id, {
        designConfig: { ...baseDesign, palette: 'VIOLET' },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('13. nueva versión conserva diseño', async () => {
    const v1 = await service.createDraft('owner-a', 'season-a', validDto as any);
    await prisma.barMissionMedalVersion.update({
      where: { id: v1.id },
      data: { status: BarMissionMedalVersionStatus.ACTIVE },
    });
    const v2 = await service.createNextVersion('owner-a', 'season-a');
    expect(v2.designConfig).toEqual(v1.designConfig);
    expect(v2.visual.shape).toBe('HEXAGON');
  });

  it('14. histórico no cambia si logo del bar cambia', async () => {
    const v1 = await service.createDraft('owner-a', 'season-a', {
      ...validDto,
      designConfig: {
        ...baseDesign,
        identityMode: 'LOGO',
        identityAssetId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      },
    } as any);
    const frozenUrl = v1.visual.identityAssetUrl;
    barA.logoUrl = 'https://cdn.example/feed/owner/logo-NEW.png';
    const mapped = service.mapVersion({
      ...versions[0],
      conditions: conditions.filter((c) => c.medalVersionId === v1.id),
    });
    expect(mapped.visual.identityAssetUrl).toBe(frozenUrl);
    expect(mapped.visual.identityAssetUrl).not.toBe(barA.logoUrl);
  });

  it('15. ADMIN recibe config', async () => {
    const draft = await service.createDraft('owner-a', 'season-a', validDto as any);
    const mapped = service.mapVersion({
      ...versions[0],
      conditions: conditions.filter((c) => c.medalVersionId === draft.id),
    });
    expect(mapped.visual).toMatchObject({
      schemaVersion: 1,
      shape: 'HEXAGON',
      style: 'MYSTIC',
      material: 'OBSIDIAN',
      palette: 'ELECTRIC_BLUE',
    });
    expect(mapped.designConfigValid).toBe(true);
  });

  it('16. USER/public visual fallback en mapVersion legacy', () => {
    const mapped = service.mapVersion({
      id: 'legacy',
      seasonId: 'season-a',
      version: 1,
      title: 'Old',
      description: 'Desc',
      status: BarMissionMedalVersionStatus.ACTIVE,
      conditionMode: BarMissionMedalConditionMode.ALL,
      xpReward: 0,
      templateId: null,
      designConfig: null,
      reviewNote: null,
      moderatedByAdminId: null,
      moderatedAt: null,
      submittedAt: null,
      approvedAt: null,
      activatedAt: null,
      disabledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      conditions: [],
    });
    expect(mapped.isLegacyVisualFallback).toBe(true);
    expect(mapped.visual.shape).toBe('CIRCLE');
    expect(mapped.visual.emblem).toBe('COCKTAIL_GLASS');
  });

  it('ADMIN no aprueba designConfig inválido', async () => {
    const draft = await service.createDraft('owner-a', 'season-a', validDto as any);
    await prisma.barMissionMedalVersion.update({
      where: { id: draft.id },
      data: {
        status: BarMissionMedalVersionStatus.PENDING_REVIEW,
        designConfig: { schemaVersion: 1, shape: 'NOPE' },
      },
    });
    await expect(admin.approve(draft.id, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
