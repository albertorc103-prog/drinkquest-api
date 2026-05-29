import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { hashPassword, randomToken, sha256, slugify, verifyPassword } from '../../common/utils/crypto.util';
import { MailService } from '../notifications/mail.service';
import { BarSubscriptionService } from '../subscriptions/bar-subscription.service';
import { JwtBarClaimsService } from '../subscriptions/jwt-bar-claims.service';
import { RegisterDto } from './dto/register.dto';
import { validateLoginIntent } from './auth-login-intent.util';
import { AuthLoginIntent } from './enums/auth-login-intent.enum';
import { JwtPayload, TokenPair } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly subscriptions: BarSubscriptionService,
    private readonly jwtBarClaims: JwtBarClaimsService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('El email ya está registrado');

    const role = dto.role ?? Role.USER;
    if (role === Role.BAR && !dto.businessName?.trim()) {
      throw new BadRequestException('businessName es obligatorio para cuentas BAR');
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName.trim(),
          role,
        },
      });
      if (role === Role.BAR) {
        const baseSlug = slugify(dto.businessName!);
        let slug = baseSlug;
        let n = 1;
        while (await tx.bar.findUnique({ where: { slug } })) {
          slug = `${baseSlug}-${n++}`;
        }
        const bar = await tx.bar.create({
          data: {
            ownerUserId: created.id,
            businessName: dto.businessName!.trim(),
            slug,
          },
        });
        await this.subscriptions.createTrialSubscription(bar.id, tx);
      }
      return created;
    });

    try {
      await this.sendEmailVerification(user.id, user.email);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Register OK but verification email failed: ${message}`);
    }
    return this.issueTokensForUser(user.id, user.email, user.role);
  }

  async login(email: string, password: string, intent: AuthLoginIntent): Promise<TokenPair> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }
    const bar =
      intent === AuthLoginIntent.BAR
        ? await this.prisma.bar.findFirst({
            where: { ownerUserId: user.id, deletedAt: null },
            select: { id: true },
          })
        : null;
    this.assertLoginIntent(user.role, bar, intent);
    this.logger.log(
      JSON.stringify({
        event: 'auth_login',
        userId: user.id,
        role: user.role,
        intent,
      }),
    );
    return this.issueTokensForUser(user.id, user.email, user.role);
  }

  private assertLoginIntent(
    role: Role,
    bar: { id: string } | null,
    intent: AuthLoginIntent,
  ): void {
    validateLoginIntent(role, intent, bar != null);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!stored || stored.user.deletedAt) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    this.logger.log(
      JSON.stringify({
        event: 'auth_refresh',
        userId: stored.user.id,
        role: stored.user.role,
      }),
    );
    return this.issueTokensForUser(stored.user.id, stored.user.email, stored.user.role);
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null },
    });
    if (!user) return { message: 'Si el email existe, recibirás instrucciones.' };
    const token = randomToken();
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    try {
      await this.mail.sendPasswordReset(user.email, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Forgot-password OK but email failed: ${message}`);
    }
    return { message: 'Si el email existe, recibirás instrucciones.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const row = await this.prisma.passwordReset.findFirst({
      where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) throw new BadRequestException('Token inválido o expirado');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    return { message: 'Contraseña actualizada' };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const row = await this.prisma.emailVerification.findFirst({
      where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) throw new BadRequestException('Token inválido o expirado');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerification.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    return { message: 'Email verificado' };
  }

  async resendVerification(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Usuario no encontrado');
    if (user.emailVerified) throw new BadRequestException('Email ya verificado');
    try {
      await this.sendEmailVerification(user.id, user.email);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Resend verification failed: ${message}`);
      throw new BadRequestException('No se pudo enviar el correo de verificación');
    }
    return { message: 'Email de verificación enviado' };
  }

  private async sendEmailVerification(userId: string, email: string) {
    const token = randomToken();
    await this.prisma.emailVerification.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    await this.mail.sendEmailVerification(email, token);
  }

  private async issueTokensForUser(
    userId: string,
    email: string,
    role: Role,
  ): Promise<TokenPair> {
    const barClaims = await this.jwtBarClaims.buildForUser(userId, role);
    return this.issueTokens({ sub: userId, email, role, ...barClaims });
  }

  private async issueTokens(payload: JwtPayload): Promise<TokenPair> {
    const accessSecret = this.config.get<string>('auth.accessSecret')!;
    const refreshSecret = this.config.get<string>('auth.refreshSecret')!;
    const accessExpires = this.config.get<string>('auth.accessExpires', '15m');
    const refreshExpires = this.config.get<string>('auth.refreshExpires', '7d');

    const accessToken = await this.jwt.signAsync(
      { ...payload, role: payload.role },
      { secret: accessSecret, expiresIn: accessExpires as `${number}d` | `${number}h` | `${number}m` },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: payload.sub, type: 'refresh' },
      { secret: refreshSecret, expiresIn: refreshExpires as `${number}d` | `${number}h` | `${number}m` },
    );
    const refreshMs = this.parseExpiry(refreshExpires);
    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + refreshMs),
      },
    });
    return { accessToken, refreshToken, expiresIn: accessExpires };
  }

  private parseExpiry(exp: string): number {
    const m = exp.match(/^(\d+)([smhd])$/);
    if (!m) return 7 * 86400_000;
    const n = parseInt(m[1], 10);
    const u = m[2];
    const mult = u === 's' ? 1000 : u === 'm' ? 60_000 : u === 'h' ? 3600_000 : 86400_000;
    return n * mult;
  }
}
