import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private ready = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON')?.trim();
    if (!raw) {
      this.logger.warn(
        'FCM desactivado: define FIREBASE_SERVICE_ACCOUNT_JSON para enviar push.',
      );
      return;
    }
    try {
      const creds = JSON.parse(raw) as admin.ServiceAccount;
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(creds) });
      }
      this.ready = true;
      this.logger.log('FCM listo (firebase-admin).');
    } catch (err) {
      this.logger.error(
        `No se pudo inicializar FCM: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  get isEnabled() {
    return this.ready;
  }

  async registerToken(userId: string, token: string, platform = 'android') {
    const trimmed = token.trim();
    if (!trimmed) return null;
    return this.prisma.deviceToken.upsert({
      where: { token: trimmed },
      create: { userId, token: trimmed, platform },
      update: { userId, platform },
    });
  }

  async unregisterToken(userId: string, token: string) {
    const trimmed = token.trim();
    if (!trimmed) return { count: 0 };
    return this.prisma.deviceToken.deleteMany({
      where: { userId, token: trimmed },
    });
  }

  async unregisterAllForUser(userId: string) {
    return this.prisma.deviceToken.deleteMany({ where: { userId } });
  }

  async sendToUser(
    userId: string,
    title: string,
    body?: string | null,
    data?: Record<string, string>,
  ) {
    if (!this.ready) return { sent: 0 };
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (tokens.length === 0) return { sent: 0 };

    const payload: admin.messaging.MulticastMessage = {
      tokens: tokens.map((t) => t.token),
      notification: {
        title,
        body: body ?? undefined,
      },
      data: data ?? {},
      android: {
        priority: 'high',
        notification: { channelId: 'drinkquest_push' },
      },
    };

    try {
      const result = await admin.messaging().sendEachForMulticast(payload);
      const stale: string[] = [];
      result.responses.forEach((res, idx) => {
        if (!res.success) {
          const code = res.error?.code ?? '';
          if (
            code.includes('registration-token-not-registered') ||
            code.includes('invalid-registration-token')
          ) {
            stale.push(tokens[idx].token);
          }
        }
      });
      if (stale.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { token: { in: stale } },
        });
      }
      return { sent: result.successCount };
    } catch (err) {
      this.logger.warn(
        `FCM sendToUser falló: ${err instanceof Error ? err.message : err}`,
      );
      return { sent: 0 };
    }
  }
}
