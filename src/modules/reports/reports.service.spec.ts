import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReportStatus, ReportTargetType } from '@prisma/client';
import { ReportsService } from './reports.service';

describe('ReportsService FASE 4.1', () => {
  it('TEST 24: report REVIEW válido → PASS', async () => {
    const prisma = {
      placeReview: { findFirst: jest.fn(async () => ({ id: 'rev1', userId: 'u2' })) },
      report: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async (args: any) => ({
          id: 'r1',
          status: ReportStatus.OPEN,
          createdAt: new Date(),
          ...args.data,
        })),
      },
    };
    const service = new ReportsService(prisma as any);
    const res = await service.create('u1', {
      targetType: 'REVIEW',
      targetReviewId: 'rev1',
      reason: 'SPAM',
    });
    expect(res.id).toBe('r1');
    expect(prisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: ReportTargetType.REVIEW,
          targetReviewId: 'rev1',
        }),
      }),
    );
  });

  it('TEST 25: review inexistente → FAIL', async () => {
    const prisma = {
      placeReview: { findFirst: jest.fn(async () => null) },
      report: { findFirst: jest.fn(), create: jest.fn() },
    };
    const service = new ReportsService(prisma as any);
    await expect(
      service.create('u1', { targetType: 'REVIEW', targetReviewId: 'x', reason: 'SPAM' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('TEST 26: report REVIEW repetido → dedup', async () => {
    const prisma = {
      placeReview: { findFirst: jest.fn(async () => ({ id: 'rev1', userId: 'u2' })) },
      report: {
        findFirst: jest.fn(async () => ({ id: 'existing' })),
        create: jest.fn(),
      },
    };
    const service = new ReportsService(prisma as any);
    await expect(
      service.create('u1', { targetType: 'REVIEW', targetReviewId: 'rev1', reason: 'SPAM' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('TEST 27: report MESSAGE participante → PASS', async () => {
    const prisma = {
      chatMessage: {
        findFirst: jest.fn(async () => ({ id: 'm1', roomId: 'r1', senderId: 'u2' })),
      },
      chatParticipant: {
        findUnique: jest.fn(async () => ({ userId: 'u1' })),
      },
      report: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({
          id: 'r2',
          status: ReportStatus.OPEN,
          createdAt: new Date(),
        })),
      },
    };
    const service = new ReportsService(prisma as any);
    const res = await service.create('u1', {
      targetType: 'MESSAGE',
      targetMessageId: 'm1',
      reason: 'HARASSMENT',
    });
    expect(res.id).toBe('r2');
  });

  it('TEST 28: report MESSAGE no participante → 404', async () => {
    const prisma = {
      chatMessage: {
        findFirst: jest.fn(async () => ({ id: 'm1', roomId: 'r1', senderId: 'u2' })),
      },
      chatParticipant: { findUnique: jest.fn(async () => null) },
      report: { findFirst: jest.fn(), create: jest.fn() },
    };
    const service = new ReportsService(prisma as any);
    await expect(
      service.create('u1', { targetType: 'MESSAGE', targetMessageId: 'm1', reason: 'SPAM' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('TEST 29: report no elimina contenido', async () => {
    const prisma = {
      placeReview: {
        findFirst: jest.fn(async () => ({ id: 'rev1', userId: 'u2' })),
        delete: jest.fn(),
      },
      report: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({
          id: 'r3',
          status: ReportStatus.OPEN,
          createdAt: new Date(),
        })),
      },
    };
    const service = new ReportsService(prisma as any);
    await service.create('u1', {
      targetType: 'REVIEW',
      targetReviewId: 'rev1',
      reason: 'OTHER',
    });
    expect(prisma.placeReview.delete).not.toHaveBeenCalled();
  });

  it('TEST 45 legacy: reportar usuario válido → PASS', async () => {
    const prisma = {
      user: { findFirst: jest.fn(async () => ({ id: 'u2' })) },
      report: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async (args: any) => ({
          id: 'r1',
          status: ReportStatus.OPEN,
          createdAt: new Date(),
          ...args.data,
        })),
      },
    };
    const service = new ReportsService(prisma as any);
    const res = await service.create('u1', {
      targetType: 'USER',
      targetUserId: 'u2',
      reason: 'SPAM',
    });
    expect(res.id).toBe('r1');
  });
});
