import { ForbiddenException } from '@nestjs/common';
import { ChatRoomType } from '@prisma/client';
import { ChatService } from './chat.service';

describe('ChatService authorization', () => {
  const friends = {
    areFriends: jest.fn(async () => true),
    areBlocked: jest.fn(async () => false),
  };
  const notifications = { create: jest.fn() };
  const realtime = { emitToRoom: jest.fn(), emitToUser: jest.fn() };
  const presence = {
    areOnline: jest.fn(async (ids: string[]) => {
      const map = new Map<string, boolean>();
      for (const id of ids) map.set(id, false);
      return map;
    }),
  };

  function service(prisma: any) {
    return new ChatService(
      prisma,
      friends as any,
      notifications as any,
      realtime as any,
      presence as any,
    );
  }

  it('TEST 35/36: no participante → Forbidden', async () => {
    const prisma = {
      chatParticipant: {
        findUnique: jest.fn(async () => null),
      },
    };
    await expect(service(prisma).assertParticipant('room-1', 'user-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST 37: markRead sin membership → FAIL', async () => {
    const prisma = {
      chatMessage: {
        findFirst: jest.fn(async () => ({ id: 'm1', roomId: 'room-1' })),
      },
      chatParticipant: {
        findUnique: jest.fn(async () => null),
      },
      messageRead: { upsert: jest.fn() },
    };
    await expect(service(prisma).markRead('m1', 'intruder', 'room-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.messageRead.upsert).not.toHaveBeenCalled();
  });

  it('TEST 38: bloqueado no puede abrir DM', async () => {
    friends.areBlocked.mockResolvedValueOnce(true);
    const prisma = {};
    await expect(service(prisma).getOrCreateRoom('a', 'b')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('TEST 38b: bloqueado no puede enviar mensaje DIRECT', async () => {
    friends.areBlocked.mockReset();
    friends.areFriends.mockReset();
    friends.areBlocked.mockResolvedValue(true);
    friends.areFriends.mockResolvedValue(true);
    const prisma = {
      chatParticipant: {
        findUnique: jest.fn(async () => ({ roomId: 'r1', userId: 'a' })),
        findFirst: jest.fn(async () => ({ userId: 'b' })),
      },
      chatRoom: {
        findUnique: jest.fn(async () => ({ type: ChatRoomType.DIRECT })),
      },
    };
    await expect(
      service(prisma).sendMessage('r1', 'a', 'hola'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('markRead usa roomId del mensaje (no confía en cliente)', async () => {
    friends.areBlocked.mockResolvedValue(false);
    const prisma = {
      chatMessage: {
        findFirst: jest.fn(async () => ({ id: 'm1', roomId: 'real-room' })),
      },
      chatParticipant: {
        findUnique: jest.fn(async () => ({ roomId: 'real-room', userId: 'a' })),
      },
      messageRead: {
        upsert: jest.fn(async () => ({ messageId: 'm1', userId: 'a' })),
      },
    };
    await expect(
      service(prisma).markRead('m1', 'a', 'spoofed-room'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
