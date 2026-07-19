import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FeedPostType, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private postInclude(viewerId?: string) {
    return {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      _count: { select: { likes: true, comments: true } },
      ...(viewerId
        ? {
            likes: {
              where: { userId: viewerId },
              select: { id: true },
              take: 1,
            },
          }
        : {}),
    } as const;
  }

  private mapPost<T extends { likes?: { id: string }[]; _count: { likes: number; comments: number } }>(
    post: T,
  ) {
    const { likes, ...rest } = post as T & { likes?: { id: string }[] };
    return {
      ...rest,
      likedByMe: Array.isArray(likes) ? likes.length > 0 : false,
    };
  }

  async createPost(
    authorId: string,
    body?: string,
    imageUrl?: string,
    type: FeedPostType = FeedPostType.USER,
    meta?: Prisma.InputJsonValue,
  ) {
    if (type === FeedPostType.USER && !body?.trim() && !imageUrl) {
      throw new BadRequestException('La publicación necesita texto o imagen');
    }
    const post = await this.prisma.feedPost.create({
      data: {
        authorId,
        body: body?.trim() || null,
        imageUrl,
        type,
        meta: meta ?? undefined,
      },
      include: this.postInclude(authorId),
    });
    return this.mapPost(post);
  }

  /** Post automático (unlock / logro). No falla el flujo principal si el feed falla. */
  async createSystemPostSafe(
    authorId: string,
    type: FeedPostType,
    body: string,
    meta?: Prisma.InputJsonValue,
  ) {
    try {
      return await this.createPost(authorId, body, undefined, type, meta);
    } catch {
      return null;
    }
  }

  async feed(page = 1, limit = 20, viewerId?: string) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.feedPost.findMany({
        where: { deletedAt: null },
        include: this.postInclude(viewerId),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.feedPost.count({ where: { deletedAt: null } }),
    ]);
    return { items: items.map((p) => this.mapPost(p)), total, page, limit };
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
    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      await this.prisma.postLike.delete({ where: { id: existing.id } });
      return { liked: false };
    }
    await this.prisma.postLike.create({ data: { postId, userId } });
    if (post.authorId !== userId) {
      await this.notifications.create(
        post.authorId,
        NotificationType.FEED_LIKE,
        'Nuevo like en tu publicación',
      );
    }
    return { liked: true };
  }

  async listComments(postId: string, limit = 50) {
    const post = await this.prisma.feedPost.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) throw new NotFoundException();
    return this.prisma.postComment.findMany({
      where: { postId, deletedAt: null },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async comment(postId: string, authorId: string, body: string) {
    const post = await this.prisma.feedPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException();
    const text = body?.trim();
    if (!text) throw new BadRequestException('Comentario vacío');
    const comment = await this.prisma.postComment.create({
      data: { postId, authorId, body: text },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    if (post.authorId !== authorId) {
      await this.notifications.create(
        post.authorId,
        NotificationType.FEED_COMMENT,
        'Nuevo comentario',
      );
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
