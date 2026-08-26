import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeedPostType, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import { evaluateSubscriptionActive } from '../subscriptions/bar-access.rules';
import {
  featuredMapBoostForPlan,
  normalizeSubscriptionPlan,
} from '../subscriptions/subscription-plan.util';

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly friends: FriendsService,
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

  /**
   * Solo bares con suscripción Leyenda activa pueden etiquetarse con @ en el feed.
   */
  async resolveLegendTaggedBarMeta(taggedBarId?: string | null) {
    if (!taggedBarId?.trim()) return undefined;
    const bar = await this.prisma.bar.findFirst({
      where: { id: taggedBarId.trim(), deletedAt: null, isActive: true },
      select: {
        id: true,
        businessName: true,
        slug: true,
        subscription: {
          select: {
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            canceledAt: true,
            qrEnabled: true,
            promoEnabled: true,
            plan: true,
          },
        },
      },
    });
    if (!bar) {
      throw new BadRequestException('Bar no encontrado para etiquetar');
    }
    const now = new Date();
    if (!evaluateSubscriptionActive(bar.subscription, now).allowed) {
      throw new BadRequestException('El bar no tiene suscripción activa');
    }
    const plan = normalizeSubscriptionPlan(bar.subscription?.plan);
    if (!featuredMapBoostForPlan(plan)) {
      throw new BadRequestException(
        'Solo puedes etiquetar bares con suscripción Leyenda',
      );
    }
    return {
      taggedBarId: bar.id,
      taggedBarName: bar.businessName,
      taggedBarSlug: bar.slug,
    } satisfies Prisma.InputJsonObject;
  }

  /** Solo amigos aceptados pueden etiquetarse en un post. */
  async resolveTaggedFriendsMeta(
    authorId: string,
    taggedUserIds?: string[] | null,
  ) {
    if (!taggedUserIds?.length) return undefined;
    const unique = [
      ...new Set(
        taggedUserIds
          .map((id) => String(id ?? '').trim())
          .filter((id) => id.length > 0),
      ),
    ].slice(0, 10);
    if (!unique.length) return undefined;

    const taggedFriends: Array<{
      id: string;
      displayName: string;
      avatarUrl: string | null;
    }> = [];

    for (const userId of unique) {
      if (userId === authorId) {
        throw new BadRequestException('No puedes etiquetarte a ti mismo');
      }
      const isFriend = await this.friends.areFriends(authorId, userId);
      if (!isFriend) {
        throw new BadRequestException('Solo puedes etiquetar a tus amigos');
      }
      const user = await this.prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true, displayName: true, avatarUrl: true },
      });
      if (!user) {
        throw new BadRequestException('Amigo no encontrado para etiquetar');
      }
      taggedFriends.push({
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });
    }

    return {
      taggedUserIds: taggedFriends.map((f) => f.id),
      taggedFriends,
    } satisfies Prisma.InputJsonObject;
  }

  async createPost(
    authorId: string,
    body?: string,
    imageUrl?: string,
    type: FeedPostType = FeedPostType.USER,
    meta?: Prisma.InputJsonValue,
    taggedBarId?: string | null,
    taggedUserIds?: string[] | null,
  ) {
    if (type === FeedPostType.USER && !body?.trim() && !imageUrl) {
      throw new BadRequestException('La publicación necesita texto o imagen');
    }
    const tagMetaParts: Prisma.InputJsonObject[] = [];
    if (type === FeedPostType.USER) {
      const barMeta = await this.resolveLegendTaggedBarMeta(taggedBarId);
      if (barMeta) tagMetaParts.push(barMeta);
      const friendsMeta = await this.resolveTaggedFriendsMeta(
        authorId,
        taggedUserIds,
      );
      if (friendsMeta) tagMetaParts.push(friendsMeta);
    }
    const baseMeta =
      typeof meta === 'object' && meta != null && !Array.isArray(meta)
        ? (meta as Prisma.InputJsonObject)
        : {};
    const mergedMeta =
      tagMetaParts.length > 0
        ? ({
            ...baseMeta,
            ...Object.assign({}, ...tagMetaParts),
          } satisfies Prisma.InputJsonObject)
        : meta;
    const post = await this.prisma.feedPost.create({
      data: {
        authorId,
        body: body?.trim() || null,
        imageUrl,
        type,
        meta: mergedMeta ?? undefined,
      },
      include: this.postInclude(authorId),
    });
    if (type === FeedPostType.USER) {
      await this.notifyFeedPostAudience(authorId, post.id, taggedUserIds);
    }
    return this.mapPost(post);
  }

  /** Avisa solo a quienes fueron etiquetados en la publicación. */
  private async notifyFeedPostAudience(
    authorId: string,
    postId: string,
    taggedUserIds?: string[] | null,
  ) {
    try {
      const tagged = [
        ...new Set(
          (taggedUserIds ?? [])
            .map((id) => String(id ?? '').trim())
            .filter((id) => id.length > 0 && id !== authorId),
        ),
      ];
      if (!tagged.length) return;

      const author = await this.prisma.user.findUnique({
        where: { id: authorId },
        select: { displayName: true },
      });
      const authorName = author?.displayName?.trim() || 'Un amigo';
      const payload = { postId } satisfies Prisma.InputJsonObject;

      for (const userId of tagged) {
        await this.notifications.create(
          userId,
          NotificationType.FEED_MENTION,
          `${authorName} te etiquetó`,
          'Te mencionaron en una publicación de Actividad',
          payload,
        );
      }
    } catch {
      // No bloquea la publicación si fallan las notificaciones.
    }
  }

  /** Post automático (unlock / logro). No falla el flujo principal si el feed falla. */
  async createSystemPostSafe(
    authorId: string,
    type: FeedPostType,
    body: string,
    meta?: Prisma.InputJsonValue,
    imageUrl?: string | null,
  ) {
    try {
      return await this.createPost(
        authorId,
        body,
        imageUrl?.trim() || undefined,
        type,
        meta,
      );
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
    const enriched = await this.enrichUnlockMeta(items);
    return { items: enriched.map((p) => this.mapPost(p)), total, page, limit };
  }

  /** Completa imagen/rareza de unlocks antiguos que solo tenían drinkId en meta. */
  private async enrichUnlockMeta<
    T extends { type: FeedPostType; imageUrl: string | null; meta: Prisma.JsonValue | null },
  >(posts: T[]): Promise<T[]> {
    const drinkIds = new Set<string>();
    for (const post of posts) {
      if (post.type !== FeedPostType.UNLOCK) continue;
      const meta =
        post.meta && typeof post.meta === 'object' && !Array.isArray(post.meta)
          ? (post.meta as Record<string, unknown>)
          : null;
      const drinkId = meta?.drinkId != null ? String(meta.drinkId) : '';
      const hasImage =
        (typeof meta?.drinkImageUrl === 'string' && meta.drinkImageUrl.trim()) ||
        (post.imageUrl?.trim() ?? '');
      if (drinkId && !hasImage) drinkIds.add(drinkId);
    }
    if (!drinkIds.size) return posts;

    const drinks = await this.prisma.drink.findMany({
      where: { id: { in: [...drinkIds] }, deletedAt: null },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        rarity: true,
        legacyId: true,
        xpReward: true,
      },
    });
    const byId = new Map(drinks.map((d) => [d.id, d]));

    return posts.map((post) => {
      if (post.type !== FeedPostType.UNLOCK) return post;
      const meta =
        post.meta && typeof post.meta === 'object' && !Array.isArray(post.meta)
          ? ({ ...(post.meta as Record<string, unknown>) } as Record<string, unknown>)
          : null;
      if (!meta) return post;
      const drinkId = meta.drinkId != null ? String(meta.drinkId) : '';
      const drink = drinkId ? byId.get(drinkId) : undefined;
      if (!drink) return post;
      const drinkImageUrl =
        (typeof meta.drinkImageUrl === 'string' && meta.drinkImageUrl.trim()) ||
        drink.imageUrl ||
        post.imageUrl ||
        null;
      return {
        ...post,
        imageUrl: post.imageUrl?.trim() || drinkImageUrl,
        meta: {
          ...meta,
          drinkName: meta.drinkName ?? drink.name,
          drinkImageUrl,
          rarity: meta.rarity ?? drink.rarity,
          catalogNumber: meta.catalogNumber ?? drink.legacyId,
          xpEarned: meta.xpEarned ?? drink.xpReward,
        },
      };
    });
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

  /**
   * Soft-delete: marca deletedAt. Solo el autor.
   * Rutas: DELETE /feed/posts/:id y POST /feed/posts/:id/delete
   */
  async softDeletePost(postId: string, userId: string) {
    const post = await this.prisma.feedPost.findFirst({
      where: { id: postId, deletedAt: null },
    });
    if (!post) throw new NotFoundException('Publicación no encontrada');
    if (post.authorId !== userId) {
      throw new ForbiddenException('Solo puedes eliminar tus propias publicaciones');
    }
    await this.prisma.feedPost.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });
    return { deleted: true as const };
  }

  async like(postId: string, userId: string) {
    const post = await this.prisma.feedPost.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) throw new NotFoundException();
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

  async listLikes(postId: string, limit = 100) {
    const post = await this.prisma.feedPost.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) throw new NotFoundException();
    const likes = await this.prisma.postLike.findMany({
      where: { postId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return likes.map((like) => ({
      id: like.id,
      createdAt: like.createdAt,
      user: like.user,
    }));
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
    if (!post || post.deletedAt) throw new NotFoundException();
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
    const post = await this.prisma.feedPost.findFirst({
      where: { id: postId, deletedAt: null },
    });
    if (!post) throw new NotFoundException('Publicación no encontrada');
    return this.prisma.feedPost.update({
      where: { id: postId },
      data: { shareCount: { increment: 1 } },
    });
  }
}
