import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FriendsService } from '../friends/friends.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
  ) {}

  async getOrCreateRoom(userId: string, friendId: string) {
    if (!(await this.friends.areFriends(userId, friendId))) {
      throw new ForbiddenException('Solo puedes chatear con amigos');
    }
    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        participants: { every: { userId: { in: [userId, friendId] } } },
      },
      include: { participants: true },
    });
    const existing = rooms.find((r) => r.participants.length === 2);
    if (existing) return existing;

    return this.prisma.chatRoom.create({
      data: {
        participants: {
          create: [{ userId }, { userId: friendId }],
        },
      },
      include: { participants: true },
    });
  }

  async sendMessage(roomId: string, senderId: string, body?: string, imageUrl?: string) {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: senderId } },
    });
    if (!participant) throw new ForbiddenException('No perteneces a esta sala');
    return this.prisma.chatMessage.create({
      data: { roomId, senderId, body, imageUrl },
      include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
  }

  async messages(roomId: string, userId: string, cursor?: string, limit = 50) {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) throw new ForbiddenException();
    return this.prisma.chatMessage.findMany({
      where: { roomId, deletedAt: null, ...(cursor && { id: { lt: cursor } }) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { sender: { select: { id: true, displayName: true, avatarUrl: true } }, reads: true },
    });
  }

  async markRead(messageId: string, userId: string) {
    return this.prisma.messageRead.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: { readAt: new Date() },
    });
  }

  async myRooms(userId: string) {
    return this.prisma.chatParticipant.findMany({
      where: { userId },
      include: {
        room: {
          include: {
            participants: { include: { user: { select: { id: true, displayName: true, avatarUrl: true, isOnline: true } } } },
            messages: { take: 1, orderBy: { createdAt: 'desc' } },
          },
        },
      },
    });
  }
}
