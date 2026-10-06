import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { BarReservationStatus, ChatRoomType, Role, SubscriptionStatus } from '@prisma/client';
import { AccountDeletionService } from './account-deletion.service';

describe('AccountDeletionService', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const barId = '22222222-2222-2222-2222-222222222222';

  function buildPrismaMock(overrides: Record<string, unknown> = {}) {
    const tx = {
      bar: { update: jest.fn() },
      barReservation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      report: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      qrSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      promotionAnalyticsEvent: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      placeVisit: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      placeReview: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      postLike: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      postCommentLike: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      feedPost: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      postComment: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userDrinkUnlock: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      drinkHistoryEntry: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userFavoriteDrink: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userMission: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userAchievement: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userBarMissionProgress: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userBarMedal: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userGlobalEventProgress: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userGlobalEventMedal: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      gamificationReward: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      uploadAsset: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      notification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userPromotionActivation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      chatParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      chatRoom: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      messageRead: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      messageReaction: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      chatMessage: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      friendship: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      friendRequest: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userBlock: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      emailVerification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      passwordReset: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      deviceToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userNotificationPreferences: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: { delete: jest.fn().mockResolvedValue({}) },
    };

    return {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      barSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      feedPost: { findMany: jest.fn().mockResolvedValue([]) },
      chatMessage: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      __tx: tx,
      ...overrides,
    };
  }

  function buildService(prisma: ReturnType<typeof buildPrismaMock>) {
    const redis = { del: jest.fn().mockResolvedValue(1) };
    const storage = {
      tryExtractObjectKey: jest.fn((v: string | null) => (v?.startsWith('avatars/') ? v : null)),
      deleteObjectsBestEffort: jest.fn().mockResolvedValue({ deleted: 0, failed: 0 }),
    };
    const stripe = {
      enabled: jest.fn().mockReturnValue(false),
      requireClient: jest.fn(),
      logDisabledOnce: jest.fn(),
    };
    const subscriptions = {
      mutate: jest.fn().mockResolvedValue({}),
    };
    const service = new AccountDeletionService(
      prisma as never,
      redis as never,
      storage as never,
      stripe as never,
      subscriptions as never,
    );
    return { service, redis, storage, stripe, subscriptions, prisma };
  }

  it('TEST 9: password incorrecto no elimina', async () => {
    const prisma = buildPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      id: userId,
      passwordHash: '$2b$12$invalidhashxxxxxxxxxxxxxxxxxxxxxxx',
      role: Role.USER,
      email: 'a@b.com',
    });
    const { service, prisma: p } = buildService(prisma);
    // verifyPassword will fail on invalid hash format — use real bcrypt mismatch via mock
    jest.spyOn(require('../../common/utils/crypto.util'), 'verifyPassword').mockResolvedValue(false);

    await expect(service.deleteOwnAccountWithPassword(userId, 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('TEST 1/5/7: USER sin bar elimina visitas y hard-delete', async () => {
    jest.spyOn(require('../../common/utils/crypto.util'), 'verifyPassword').mockResolvedValue(true);
    const prisma = buildPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      id: userId,
      passwordHash: 'hash',
      role: Role.USER,
      email: 'u@test.com',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: Role.USER,
      avatarUrl: 'avatars/x.jpg',
      deletedAt: null,
      bar: null,
    });
    const { service, redis, storage, prisma: p } = buildService(prisma);

    const result = await service.deleteOwnAccountWithPassword(userId, 'secret');
    expect(result.deleted).toBe(true);
    expect(result.mode).toBe('hard_delete');
    expect(p.__tx.placeVisit.deleteMany).toHaveBeenCalledWith({ where: { userId } });
    expect(p.__tx.placeReview.deleteMany).toHaveBeenCalledWith({ where: { userId } });
    expect(p.__tx.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
    expect(redis.del).toHaveBeenCalledWith(`online:${userId}`);
    expect(storage.deleteObjectsBestEffort).toHaveBeenCalled();
  });

  it('TEST 2: GROUP chat — no borra sala group, sí mensajes propios', async () => {
    jest.spyOn(require('../../common/utils/crypto.util'), 'verifyPassword').mockResolvedValue(true);
    const prisma = buildPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      id: userId,
      passwordHash: 'hash',
      role: Role.USER,
      email: 'u@test.com',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: Role.USER,
      avatarUrl: null,
      deletedAt: null,
      bar: null,
    });
    const groupRoomId = '33333333-3333-3333-3333-333333333333';
    prisma.__tx.chatParticipant.findMany.mockResolvedValue([
      { roomId: groupRoomId, room: { type: ChatRoomType.GROUP } },
    ]);
    const { service, prisma: p } = buildService(prisma);
    await service.deleteOwnAccountWithPassword(userId, 'secret');
    expect(p.__tx.chatRoom.deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [groupRoomId] } } }),
    );
    expect(p.__tx.chatMessage.deleteMany).toHaveBeenCalledWith({ where: { senderId: userId } });
    expect(p.__tx.chatParticipant.deleteMany).toHaveBeenCalledWith({ where: { userId } });
  });

  it('TEST 3: DIRECT chat — elimina sala completa', async () => {
    jest.spyOn(require('../../common/utils/crypto.util'), 'verifyPassword').mockResolvedValue(true);
    const prisma = buildPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      id: userId,
      passwordHash: 'hash',
      role: Role.USER,
      email: 'u@test.com',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: Role.USER,
      avatarUrl: null,
      deletedAt: null,
      bar: null,
    });
    const directId = '44444444-4444-4444-4444-444444444444';
    prisma.__tx.chatParticipant.findMany.mockResolvedValue([
      { roomId: directId, room: { type: ChatRoomType.DIRECT } },
    ]);
    const { service, prisma: p } = buildService(prisma);
    await service.deleteOwnAccountWithPassword(userId, 'secret');
    expect(p.__tx.chatRoom.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [directId] } },
    });
  });

  it('TEST 8: BAR con Stripe activo — cancela y desactiva bar', async () => {
    jest.spyOn(require('../../common/utils/crypto.util'), 'verifyPassword').mockResolvedValue(true);
    const prisma = buildPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      id: userId,
      passwordHash: 'hash',
      role: Role.BAR,
      email: 'bar@test.com',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: Role.BAR,
      avatarUrl: null,
      deletedAt: null,
      bar: { id: barId, deletedAt: null },
    });
    prisma.barSubscription.findUnique.mockResolvedValue({
      id: 'sub',
      barId,
      status: SubscriptionStatus.ACTIVE,
      stripeSubscriptionId: 'sub_123',
      stripeCustomerId: 'cus_1',
    });
    const { service, stripe, subscriptions, prisma: p } = buildService(prisma);
    stripe.enabled.mockReturnValue(true);
    const cancel = jest.fn().mockResolvedValue({});
    stripe.requireClient.mockReturnValue({ subscriptions: { cancel } });

    const result = await service.deleteOwnAccountWithPassword(userId, 'secret');
    expect(cancel).toHaveBeenCalledWith('sub_123');
    expect(subscriptions.mutate).toHaveBeenCalled();
    expect(p.__tx.bar.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: barId },
        data: expect.objectContaining({
          ownerUserId: null,
          isActive: false,
          phone: null,
        }),
      }),
    );
    expect(result.barDeactivated).toBe(true);
    expect(result.stripeCanceled).toBe(true);
  });

  it('TEST 10: fallo Stripe aborta sin transaction', async () => {
    jest.spyOn(require('../../common/utils/crypto.util'), 'verifyPassword').mockResolvedValue(true);
    const prisma = buildPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      id: userId,
      passwordHash: 'hash',
      role: Role.BAR,
      email: 'bar@test.com',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: Role.BAR,
      avatarUrl: null,
      deletedAt: null,
      bar: { id: barId, deletedAt: null },
    });
    prisma.barSubscription.findUnique.mockResolvedValue({
      id: 'sub',
      barId,
      status: SubscriptionStatus.ACTIVE,
      stripeSubscriptionId: 'sub_123',
      stripeCustomerId: 'cus_1',
    });
    const { service, stripe, prisma: p } = buildService(prisma);
    stripe.enabled.mockReturnValue(true);
    stripe.requireClient.mockReturnValue({
      subscriptions: { cancel: jest.fn().mockRejectedValue(new Error('stripe down')) },
    });

    await expect(service.deleteOwnAccountWithPassword(userId, 'secret')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('cancela reservas futuras y anonimiza', async () => {
    jest.spyOn(require('../../common/utils/crypto.util'), 'verifyPassword').mockResolvedValue(true);
    const prisma = buildPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      id: userId,
      passwordHash: 'hash',
      role: Role.USER,
      email: 'u@test.com',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      role: Role.USER,
      avatarUrl: null,
      deletedAt: null,
      bar: null,
    });
    const { service, prisma: p } = buildService(prisma);
    await service.deleteOwnAccountWithPassword(userId, 'secret');
    expect(p.__tx.barReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BarReservationStatus.CANCELLED,
          guestName: 'Cliente',
          userId: null,
        }),
      }),
    );
    expect(p.__tx.qrSession.updateMany).toHaveBeenCalledWith({
      where: { scannedById: userId },
      data: { scannedById: null },
    });
  });
});
