import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Presencia en tiempo real: Redis `online:{userId}` (set de socket ids) es la autoridad.
 * El flag `User.isOnline` en Postgres es caché; se usa solo si Redis falla.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async areOnline(userIds: string[]): Promise<Map<string, boolean>> {
    const unique = [...new Set(userIds.filter((id) => !!id))];
    const map = new Map<string, boolean>();
    if (unique.length === 0) return map;

    try {
      const pipeline = this.redis.client.pipeline();
      for (const id of unique) {
        pipeline.scard(`online:${id}`);
      }
      const results = await pipeline.exec();
      const staleOnlineIds: string[] = [];

      unique.forEach((id, i) => {
        const count = Number(results?.[i]?.[1] ?? 0);
        const online = count > 0;
        map.set(id, online);
        if (!online) staleOnlineIds.push(id);
      });

      // Sana flags DB pegados en true tras reinicios / disconnects perdidos.
      if (staleOnlineIds.length > 0) {
        void this.prisma.user
          .updateMany({
            where: { id: { in: staleOnlineIds }, isOnline: true },
            data: { isOnline: false },
          })
          .catch((err) => {
            this.logger.warn(
              JSON.stringify({
                event: 'presence_db_heal_failed',
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          });
      }

      return map;
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: 'presence_redis_fallback',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      const rows = await this.prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, isOnline: true },
      });
      for (const row of rows) {
        map.set(row.id, row.isOnline);
      }
      return map;
    }
  }
}
