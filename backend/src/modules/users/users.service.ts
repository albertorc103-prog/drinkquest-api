import { Injectable, NotFoundException } from '@nestjs/common';
import { ProfileVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        profileVisibility: true,
        totalXp: true,
        level: true,
        isOnline: true,
        emailVerified: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.profileVisibility === ProfileVisibility.PRIVATE && userId !== viewerId) {
      return { id: user.id, displayName: user.displayName, profileVisibility: 'PRIVATE' };
    }
    return user;
  }

  async updateProfile(userId: string, data: { displayName?: string; bio?: string; profileVisibility?: ProfileVisibility }) {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
  }

  async search(query: string, excludeUserId: string, limit = 20) {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { not: excludeUserId },
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: { id: true, displayName: true, avatarUrl: true, isOnline: true },
    });
  }

  async setOnline(userId: string, online: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isOnline: online, lastSeenAt: online ? undefined : new Date() },
    });
  }
}
