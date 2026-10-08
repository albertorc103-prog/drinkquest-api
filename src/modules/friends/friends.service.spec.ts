import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FriendRequestStatus } from '@prisma/client';
import { FriendsService } from './friends.service';

function makePrisma(state: {
  block?: any;
  friendship?: any;
  friendRequest?: any;
  friendRequestIncoming?: any;
}) {
  return {
    userBlock: {
      findFirst: jest.fn(async () => state.block ?? null),
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: state.block ? 1 : 0 })),
      findMany: jest.fn(async () => []),
    },
    friendship: {
      findUnique: jest.fn(async () => state.friendship ?? null),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      upsert: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
    },
    friendRequest: {
      findUnique: jest.fn(async (args: any) => {
        const s = args?.where?.senderId_receiverId;
        if (s && state.friendRequestIncoming && s.senderId === state.friendRequestIncoming.senderId) {
          return state.friendRequestIncoming;
        }
        return state.friendRequest ?? null;
      }),
      upsert: jest.fn(async () => ({
        id: 'req-1',
        senderId: 'a',
        receiverId: 'b',
        status: FriendRequestStatus.PENDING,
        message: null,
        sender: { id: 'a', displayName: 'A', avatarUrl: null },
      })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    },
    chatMessage: { count: jest.fn(async () => 0) },
    notification: {
      count: jest.fn(async () => 0),
      create: jest.fn(async () => ({ id: 'n1' })),
    },
    chatRoom: { findMany: jest.fn(async () => []) },
    chatParticipant: { updateMany: jest.fn(async () => ({ count: 0 })) },
    $transaction: jest.fn(async (ops: any) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops({} as any);
    }),
  };
}

describe('FriendsService authorization', () => {
  const notifications = {
    create: jest.fn(async () => ({ id: 'n1' })),
  };
  const realtime = { emitToUser: jest.fn() };
  const presence = {
    areOnline: jest.fn(async (ids: string[]) => {
      const map = new Map<string, boolean>();
      for (const id of ids) map.set(id, false);
      return map;
    }),
  };

  function makeService(prisma: any) {
    return new FriendsService(
      prisma,
      notifications as any,
      realtime as any,
      presence as any,
    );
  }

  it('TEST 8: solicitud a sí mismo → FAIL', async () => {
    const service = makeService(makePrisma({}) as any);
    await expect(service.sendRequest('u1', 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('TEST 10: ya amigos → respuesta estable alreadyFriends', async () => {
    const service = makeService(makePrisma({ friendship: { id: 'f1' } }) as any);
    const res = await service.sendRequest('u1', 'u2');
    expect((res as any).alreadyFriends).toBe(true);
  });

  it('TEST 13/14: bloqueados no pueden enviar solicitud', async () => {
    const service = makeService(makePrisma({ block: { id: 'b1' } }) as any);
    await expect(service.sendRequest('u1', 'u2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST 4: aceptar request ajena → FAIL', async () => {
    const service = makeService(
      makePrisma({
        friendRequest: {
          id: 'req-1',
          senderId: 'a',
          receiverId: 'b',
          status: FriendRequestStatus.PENDING,
        },
      }) as any,
    );
    await expect(service.respond('c', 'req-1', true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST 5: cancelar request ajena → FAIL', async () => {
    const service = makeService(
      makePrisma({
        friendRequest: {
          id: 'req-1',
          senderId: 'a',
          receiverId: 'b',
          status: FriendRequestStatus.PENDING,
        },
      }) as any,
    );
    await expect(service.cancelRequest('c', 'req-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST 16: solo initiator puede unblock', async () => {
    const service = makeService(makePrisma({ block: null }) as any);
    await expect(service.unblock('a', 'b')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
