import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { AppException } from '../errors/app-exception';

type DependencyStatus = 'ok' | 'degraded' | 'error';
type HealthService = 'database' | 'prisma' | 'jwt' | 'storage' | 'env';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check() {
    const checks: Record<HealthService, DependencyStatus> = {
      database: 'error',
      prisma: 'error',
      jwt: 'error',
      storage: 'error',
      env: 'error',
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
      checks.prisma = 'ok';
    } catch {
      /* Prisma / DATABASE_URL */
    }

    try {
      const access = this.config.get<string>('auth.accessSecret');
      const refresh = this.config.get<string>('auth.refreshSecret');
      checks.jwt = access && refresh ? 'ok' : 'degraded';
    } catch {
      /* JWT config inválida */
    }

    try {
      const endpoint = this.config.get<string>('minio.endpoint');
      const bucket = this.config.get<string>('minio.bucket');
      const accessKey = this.config.get<string>('minio.accessKey');
      const secretKey = this.config.get<string>('minio.secretKey');
      if (endpoint && bucket && accessKey && secretKey) {
        checks.storage = 'ok';
      } else {
        checks.storage = 'degraded';
      }
    } catch {
      /* storage config inválida */
    }

    const requiredEnvKeys = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
    const missing = requiredEnvKeys.filter((key) => !process.env[key]);
    checks.env = missing.length === 0 ? 'ok' : 'degraded';

    const hasError = Object.values(checks).includes('error');
    const hasDegraded = Object.values(checks).includes('degraded');

    if (hasError) {
      throw new AppException(
        'SYSTEM_HEALTH_ERROR',
        'Uno o más servicios no están disponibles.',
        503,
        { services: checks, missingEnv: missing },
      );
    }

    return {
      status: hasDegraded ? 'degraded' : 'ok',
      services: checks,
      timestamp: new Date().toISOString(),
    };
  }
}
