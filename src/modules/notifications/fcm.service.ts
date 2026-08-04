import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

type FirebaseMessaging = {
  sendEachForMulticast: (message: {
    tokens: string[];
    notification?: { title: string; body?: string };
    data?: Record<string, string>;
    android?: { priority: 'high' | 'normal' };
  }) => Promise<{
    responses: Array<{ success: boolean; error?: { code?: string } }>;
  }>;
};

/**
 * Push FCM vía firebase-admin.
 * Se activa solo si existe FIREBASE_SERVICE_ACCOUNT_JSON (JSON de service account).
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private messaging: FirebaseMessaging | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (!raw) {
      this.logger.warn(
        'FCM desactivado: define FIREBASE_SERVICE_ACCOUNT_JSON (service account Firebase) en el entorno.',
      );
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const admin = require('firebase-admin') as typeof import('firebase-admin');
      const cred = JSON.parse(raw) as object;
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(cred),
        });
      }
      this.messaging = admin.messaging() as unknown as FirebaseMessaging;
      this.logger.log('FCM inicializado (firebase-admin)');
    } catch (err) {
      this.logger.error(
        `No se pudo inicializar FCM: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.messaging = null;
    }
  }

  get enabled(): boolean {
    return this.messaging != null;
  }

  async sendToUser(
    userId: string,
    title: string,
    body?: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.messaging) return;
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { id: true, token: true },
    });
    if (rows.length === 0) return;
    await this.sendToTokens(
      rows.map((r) => r.token),
      title,
      body,
      data,
    );
  }

  async sendToUsers(
    userIds: string[],
    title: string,
    body?: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.messaging || userIds.length === 0) return;
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    const tokens = [...new Set(rows.map((r) => r.token))];
    if (tokens.length === 0) return;
    // FCM multicast max 500
    for (let i = 0; i < tokens.length; i += 500) {
      await this.sendToTokens(tokens.slice(i, i + 500), title, body, data);
    }
  }

  private async sendToTokens(
    tokens: string[],
    title: string,
    body?: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.messaging || tokens.length === 0) return;
    try {
      const result = await this.messaging.sendEachForMulticast({
        tokens,
        notification: { title, body: body ?? undefined },
        data: data ?? {},
        android: { priority: 'high' },
      });
      const stale: string[] = [];
      result.responses.forEach((res, idx) => {
        if (res.success) return;
        const code = res.error?.code ?? '';
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token')
        ) {
          stale.push(tokens[idx]);
        }
      });
      if (stale.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { token: { in: stale } },
        });
        this.logger.log(`FCM: eliminados ${stale.length} tokens inválidos`);
      }
    } catch (err) {
      this.logger.warn(
        `FCM send falló: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
