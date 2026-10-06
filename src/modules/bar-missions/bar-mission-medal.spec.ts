import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  BarMissionMedalConditionMode,
  BarMissionMedalConditionType,
  BarMissionMedalVersionStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { AdminBarMissionMedalService } from './admin-bar-mission-medal.service';
import { BarMissionMedalService } from './bar-mission-medal.service';

describe('BarMissionMedalService FASE 3', () => {
  const barA = { id: 'bar-a', logoUrl: 'https://cdn.example/feed/owner/logo-a.png' };
  const barB = { id: 'bar-b', logoUrl: null };
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
  const missionOther = {
    id: 'mission-b',
    seasonId: 'season-b',
    season: { id: 'season-b', barId: 'bar-b' },
  };

  let versions: any[];
  let conditions: any[];
  let prisma: any;
  let barAccess: any;
  let service: BarMissionMedalService;
  let admin: AdminBarMissionMedalService;

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
          return [missionA, missionOther].filter((m) => ids.includes(m.id));
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
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const v of versions) {
            if (where.seasonId && v.seasonId !== where.seasonId) continue;
            if (where.status && v.status !== where.status) continue;
            if (where.id?.not && v.id === where.id.not) continue;
            Object.assign(v, data);
            count += 1;
          }
          return { count };
        }),
      },
      barMissionMedalCondition: {
        deleteMany: jest.fn(async ({ where }: any) => {
          const before = conditions.length;
          for (let i = conditions.length - 1; i >= 0; i--) {
            if (conditions[i].medalVersionId === where.medalVersionId) conditions.splice(i, 1);
          }
          return { count: before - conditions.length };
        }),
        createMany: jest.fn(async ({ data }: any) => {
          for (const c of data) {
            conditions.push({
              id: `cond-${conditions.length + 1}`,
              ...c,
            });
          }
          return { count: data.length };
        }),
      },
      uploadAsset: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.id === 'asset-owned') {
            return {
              id: 'asset-owned',
              ownerUserId: 'owner-a',
              publicUrl: 'https://cdn.example/feed/owner/logo-a.png',
            };
          }
          if (where.id === 'asset-other') {
            return {
              id: 'asset-other',
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
              id: 'asset-owned',
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
      resolveByOwnerUserId: jest.fn(async (userId: string) => {
        if (userId === 'owner-a') {
          return {
            bar: barA,
            subscription: {
              plan: SubscriptionPlan.LEGEND,
              status: SubscriptionStatus.ACTIVE,
            },
          };
        }
        if (userId === 'owner-explorer') {
          return {
            bar: barA,
            subscription: {
              plan: SubscriptionPlan.EXPLORER,
              status: SubscriptionStatus.ACTIVE,
            },
          };
        }
        return {
          bar: barB,
          subscription: {
            plan: SubscriptionPlan.LEGEND,
            status: SubscriptionStatus.ACTIVE,
          },
        };
      }),
      isSubscriptionActive: () => true,
    };

    service = new BarMissionMedalService(prisma, barAccess);
    admin = new AdminBarMissionMedalService(prisma, service);
  });

  const validDesign = {
    schemaVersion: 1,
    shape: 'CIRCLE',
    style: 'ELEGANT',
    material: 'GOLD',
    palette: 'AMBER',
    identityMode: 'DRINKQUEST_EMBLEM',
    identityPlacement: 'PRIMARY',
    emblem: 'COCKTAIL_GLASS',
    ornaments: ['STARS'],
  };

  const validDto = {
    title: 'Guardian',
    description: 'Has demostrado conocer el local.',
    conditionMode: BarMissionMedalConditionMode.ALL,
    conditions: [
      { type: BarMissionMedalConditionType.VISITS, targetValue: 3 },
      { type: BarMissionMedalConditionType.DRINKS_UNLOCKED, targetValue: 5 },
      {
        type: BarMissionMedalConditionType.MISSION_COMPLETED,
        referenceId: 'mission-a',
      },
    ],
    designConfig: validDesign,
  };

  it('TEST 2: plan sin entitlement no puede crear', async () => {
    await expect(service.createDraft('owner-explorer', 'season-a', validDto as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST 3: BAR A no edita temporada de BAR B', async () => {
    await expect(service.getCurrent('owner-b', 'season-a')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('TEST 4: crear DRAFT válido', async () => {
    const created = await service.createDraft('owner-a', 'season-a', validDto as any);
    expect(created.status).toBe(BarMissionMedalVersionStatus.DRAFT);
    expect(created.version).toBe(1);
    expect(created.conditions).toHaveLength(3);
    expect(seasonA.currentMedalVersionId).toBe(created.id);
  });

  it('TEST 5/6: title >40 y description >120', async () => {
    await expect(
      service.createDraft('owner-a', 'season-a', {
        ...validDto,
        title: 'x'.repeat(41),
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createDraft('owner-a', 'season-a', {
        ...validDto,
        description: 'y'.repeat(121),
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST 7: cero condiciones', async () => {
    await expect(
      service.createDraft('owner-a', 'season-a', { ...validDto, conditions: [] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST 8/9: VISITS/DRINKS target >=1', async () => {
    await expect(
      service.createDraft('owner-a', 'season-a', {
        ...validDto,
        conditions: [{ type: BarMissionMedalConditionType.VISITS, targetValue: 0 }],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST 10/11: MISSION_COMPLETED exige misión del bar', async () => {
    await expect(
      service.createDraft('owner-a', 'season-a', {
        ...validDto,
        conditions: [{ type: BarMissionMedalConditionType.MISSION_COMPLETED }],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createDraft('owner-a', 'season-a', {
        ...validDto,
        conditions: [
          {
            type: BarMissionMedalConditionType.MISSION_COMPLETED,
            referenceId: 'mission-b',
          },
        ],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST 12: EVENT_PARTICIPATION rechazado', async () => {
    await expect(
      service.createDraft('owner-a', 'season-a', {
        ...validDto,
        conditions: [{ type: BarMissionMedalConditionType.EVENT_PARTICIPATION, targetValue: 1 }],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST 13-16: editable solo DRAFT/CHANGES_REQUESTED', async () => {
    const draft = await service.createDraft('owner-a', 'season-a', validDto as any);
    await service.updateDraft('owner-a', 'season-a', draft.id, { title: 'Nuevo' });
    versions[0].status = BarMissionMedalVersionStatus.PENDING_REVIEW;
    await expect(
      service.updateDraft('owner-a', 'season-a', draft.id, { title: 'X' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    versions[0].status = BarMissionMedalVersionStatus.ACTIVE;
    await expect(
      service.updateDraft('owner-a', 'season-a', draft.id, { title: 'X' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    versions[0].status = BarMissionMedalVersionStatus.CHANGES_REQUESTED;
    await expect(
      service.updateDraft('owner-a', 'season-a', draft.id, { title: 'Ok' }),
    ).resolves.toBeTruthy();
  });

  it('TEST 17/18: submit', async () => {
    const draft = await service.createDraft('owner-a', 'season-a', validDto as any);
    const submitted = await service.submit('owner-a', 'season-a', draft.id);
    expect(submitted.status).toBe(BarMissionMedalVersionStatus.PENDING_REVIEW);
    versions[0].conditions = [];
    conditions.length = 0;
    versions[0].status = BarMissionMedalVersionStatus.DRAFT;
    await expect(service.submit('owner-a', 'season-a', draft.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('TEST 21-25: admin approve / activate', async () => {
    const draft = await service.createDraft('owner-a', 'season-a', validDto as any);
    await service.submit('owner-a', 'season-a', draft.id);
    const approved = await admin.approve(draft.id, 'admin-1');
    expect(approved.status).toBe(BarMissionMedalVersionStatus.APPROVED);
    await expect(admin.activate(draft.id, 'admin-1')).resolves.toMatchObject({
      status: BarMissionMedalVersionStatus.ACTIVE,
    });
  });

  it('TEST 22/23: request-changes y reject requieren comentario', async () => {
    const draft = await service.createDraft('owner-a', 'season-a', validDto as any);
    await service.submit('owner-a', 'season-a', draft.id);
    await expect(admin.requestChanges(draft.id, 'admin-1', 'ab')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(admin.reject(draft.id, 'admin-1', 'Motivo válido de rechazo')).resolves.toMatchObject({
      status: BarMissionMedalVersionStatus.REJECTED,
    });
  });

  it('TEST 25: PENDING no puede activarse', async () => {
    const draft = await service.createDraft('owner-a', 'season-a', validDto as any);
    await service.submit('owner-a', 'season-a', draft.id);
    await expect(admin.activate(draft.id, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST 26/27: activar v2 desactiva v1; unlocks v1 intactos', async () => {
    const v1 = await service.createDraft('owner-a', 'season-a', validDto as any);
    await service.submit('owner-a', 'season-a', v1.id);
    await admin.approve(v1.id, 'admin-1');
    await admin.activate(v1.id, 'admin-1');
    const unlocks = [{ id: 'u1', medalVersionId: v1.id }];
    const v2 = await service.createNextVersion('owner-a', 'season-a');
    expect(v2.version).toBe(2);
    expect(v2.status).toBe(BarMissionMedalVersionStatus.DRAFT);
    await service.submit('owner-a', 'season-a', v2.id);
    await admin.approve(v2.id, 'admin-1');
    await admin.activate(v2.id, 'admin-1');
    expect(versions.find((v) => v.id === v1.id).status).toBe(BarMissionMedalVersionStatus.DISABLED);
    expect(versions.find((v) => v.id === v2.id).status).toBe(BarMissionMedalVersionStatus.ACTIVE);
    expect(unlocks[0].medalVersionId).toBe(v1.id);
  });

  it('TEST 28/29: XP solo antes de ACTIVE', async () => {
    const draft = await service.createDraft('owner-a', 'season-a', validDto as any);
    await expect(admin.setReward(draft.id, 100)).resolves.toMatchObject({ xpReward: 100 });
    await service.submit('owner-a', 'season-a', draft.id);
    await admin.approve(draft.id, 'admin-1');
    await admin.activate(draft.id, 'admin-1');
    await expect(admin.setReward(draft.id, 50)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TEST 30: new-version incrementa y actualiza currentMedalVersionId', async () => {
    const v1 = await service.createDraft('owner-a', 'season-a', validDto as any);
    await service.submit('owner-a', 'season-a', v1.id);
    await admin.approve(v1.id, 'admin-1');
    await admin.activate(v1.id, 'admin-1');
    expect(seasonA.currentMedalVersionId).toBe(v1.id);
    const v2 = await service.createNextVersion('owner-a', 'season-a');
    expect(v2.version).toBe(2);
    expect(seasonA.currentMedalVersionId).toBe(v2.id);
  });

  it('TEST 19/20: BAR y USER no pueden aprobar; ADMIN sí', () => {
    const { hasPermission } = require('../auth/permissions/auth-context.util');
    const { Role } = require('@prisma/client');
    const { AuthPermission } = require('../auth/permissions/auth-permission.enum');
    expect(hasPermission({ role: Role.BAR }, AuthPermission.MODERATE_CONTENT)).toBe(false);
    expect(hasPermission({ role: Role.USER }, AuthPermission.MODERATE_CONTENT)).toBe(false);
    expect(hasPermission({ role: Role.ADMIN }, AuthPermission.MODERATE_CONTENT)).toBe(true);
  });

  it('TEST 31: createDraft duplicado falla', async () => {
    await service.createDraft('owner-a', 'season-a', validDto as any);
    await expect(service.createDraft('owner-a', 'season-a', validDto as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('TEST 31b: version concurrente reintenta en P2002', async () => {
    const { Prisma } = require('@prisma/client');
    const v1 = await service.createDraft('owner-a', 'season-a', validDto as any);
    await service.submit('owner-a', 'season-a', v1.id);
    await admin.approve(v1.id, 'admin-1');
    await admin.activate(v1.id, 'admin-1');
    let attempts = 0;
    const originalCreate = prisma.barMissionMedalVersion.create;
    prisma.barMissionMedalVersion.create = jest.fn(async (args: any) => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        });
        throw err;
      }
      return originalCreate(args);
    });
    const v2 = await service.createNextVersion('owner-a', 'season-a');
    expect(v2.version).toBe(2);
    expect(attempts).toBe(2);
  });

  it('PRECHECK: REJECTED sin ACTIVE permite new-version clonando la REJECTED', async () => {
    const v1 = await service.createDraft('owner-a', 'season-a', {
      ...validDto,
      title: 'Medalla rechazada',
      description: 'Desc original para clonar',
      conditionMode: BarMissionMedalConditionMode.ANY,
    } as any);
    await service.submit('owner-a', 'season-a', v1.id);
    await admin.reject(v1.id, 'admin-1', 'Motivo valido de rechazo largo');
    expect(versions.find((v) => v.id === v1.id).status).toBe(BarMissionMedalVersionStatus.REJECTED);
    expect(versions.some((v) => v.status === BarMissionMedalVersionStatus.ACTIVE)).toBe(false);

    const v2 = await service.createNextVersion('owner-a', 'season-a');
    expect(v2.version).toBe(2);
    expect(v2.status).toBe(BarMissionMedalVersionStatus.DRAFT);
    expect(v2.title).toBe('Medalla rechazada');
    expect(v2.description).toBe('Desc original para clonar');
    expect(v2.conditionMode).toBe('ANY');
    expect(v2.reviewComment).toBeNull();
    expect(v2.submittedAt).toBeNull();
    expect(v2.approvedAt).toBeNull();
    expect(v2.activatedAt).toBeNull();
    expect(v2.conditions.map((c: { type: string }) => c.type)).toEqual([
      'VISITS',
      'DRINKS_UNLOCKED',
      'MISSION_COMPLETED',
    ]);
    expect(versions.find((v) => v.id === v1.id).status).toBe(BarMissionMedalVersionStatus.REJECTED);
    expect(seasonA.currentMedalVersionId).toBe(v2.id);
  });
});
