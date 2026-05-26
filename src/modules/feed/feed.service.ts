import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async createPost(authorId: string, body?: string, imageUrl?: string) {
    return this.prisma.feedPost.create({ data: { authorId, body, imageUrl } });
  }

  async feed(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.feedPost.findMany({
        where: { deletedAt: null },
        include: {
          author: { select: { id: true, displayName: true, avatarUrl: true } },
          _count: { select: { likes: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.feedPost.count({ where: { deletedAt: null } }),
    ]);
    return { items, total, page, limit };
  }

  async trending(limit = 10) {
    const posts = await this.prisma.feedPost.findMany({
      where: { deletedAt: null, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      include: { _count: { select: { likes: true, comments: true } } },
      take: 50,
    });
    return posts
      .map((p) => ({ ...p, score: p._count.likes * 2 + p._count.comments }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async like(postId: string, userId: string) {
    const post = await this.prisma.feedPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException();
    await this.prisma.postLike.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId },
      update: {},
    });
    if (post.authorId !== userId) {
      await this.notifications.create(post.authorId, NotificationType.FEED_LIKE, 'Nuevo like en tu publicación');
    }
    return { liked: true };
  }

  async comment(postId: string, authorId: string, body: string) {
    const post = await this.prisma.feedPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException();
    const comment = await this.prisma.postComment.create({ data: { postId, authorId, body } });
    if (post.authorId !== authorId) {
      await this.notifications.create(post.authorId, NotificationType.FEED_COMMENT, 'Nuevo comentario');
    }
    return comment;
  }

  async share(postId: string) {
    return this.prisma.feedPost.update({
      where: { id: postId },
      data: { shareCount: { increment: 1 } },
    });
  }
}
