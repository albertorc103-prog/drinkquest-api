import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  hashPassword,
  normalizeVerificationCode,
  randomVerificationCode,
  randomToken,
  sha256,
  slugify,
  verifyPassword,
} from '../../common/utils/crypto.util';
import { MailService } from '../notifications/mail.service';
import { BarSubscriptionService } from '../subscriptions/bar-subscription.service';
import { JwtBarClaimsService } from '../subscriptions/jwt-bar-claims.service';
import { RegisterDto } from './dto/register.dto';
import { validateLoginIntent } from './auth-login-intent.util';
import { AuthLoginIntent } from './enums/auth-login-intent.enum';
import { AuthMeResponseDto } from './dto/auth-me-response.dto';
import { toAuthProfileDto } from './mappers/auth-profile.mapper';
import { AuthSessionResponseDto } from './dto/auth-session-response.dto';
import { toAuthUserSummary } from './mappers/auth-user.mapper';
import { enrichJwtAuthClaims } from './permissions/auth-context.util';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Mínimo entre reenvíos (evita bloqueo de Brevo y spam). */
  private static readonly RESEND_COOLDOWN_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly subscriptions: BarSubscriptionService,
    private readonly jwtBarClaims: JwtBarClaimsService,
    private readonly users: UsersService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSessionResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists && !exists.deletedAt) {
      throw new ConflictException('El email ya está registrado');
    }

    const role = dto.role ?? Role.USER;
    if (role === Role.BAR && !dto.businessName?.trim()) {
      throw new BadRequestException('businessName es obligatorio para cuentas BAR');
    }

    const passwordHash = await hashPassword(dto.password);
    const displayName = dto.displayName.trim();

    // Cuenta soft-deleted: reactivar en lugar de bloquear el email para siempre.
    if (exists?.deletedAt) {
      const restored = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: exists.id },
          data: {
            passwordHash,
            displayName,
            role,
            deletedAt: null,
            emailVerified: false,
            emailVerifiedAt: null,
            totalXp: 0,
            level: 1,
            coins: 0,
            loginStreakDays: 0,
            lastLoginEpochDay: 0,
            streakBonusTierClaimed: 0,
            dailyChestClaimedDay: 0,
            questProgress: Prisma.DbNull,
            achievementProgress: Prisma.DbNull,
          },
        });
        await this.users.wipeUserProgressData(tx, exists.id);
        if (role === Role.BAR) {
          const existingBar = await tx.bar.findFirst({
            where: { ownerUserId: user.id },
          });
          if (!existingBar) {
            await this.createBarForOwner(tx, user.id, dto.businessName!);
          } else if (existingBar.deletedAt) {
            await tx.bar.update({
              where: { id: existingBar.id },
              data: {
                deletedAt: null,
                businessName: dto.businessName!.trim(),
              },
            });
          }
        }
        return user;
      });
      this.queueEmailVerification(restored.id, restored.email);
      return this.issueTokensForUser(restored.id, restored.email, restored.role);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          role,
        },
      });
      if (role === Role.BAR) {
        await this.createBarForOwner(tx, created.id, dto.businessName!);
      }
      return created;
    });

    this.queueEmailVerification(user.id, user.email);
    return this.issueTokensForUser(user.id, user.email, user.role);
  }

  private async createBarForOwner(
    tx: Prisma.TransactionClient,
    ownerUserId: string,
    businessName: string,
  ) {
    const baseSlug = slugify(businessName);
    let slug = baseSlug;
    let n = 1;
    while (await tx.bar.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${n++}`;
    }
    const bar = await tx.bar.create({
      data: {
        ownerUserId,
        businessName: businessName.trim(),
        slug,
      },
    });
    await this.subscriptions.createTrialSubscription(bar.id, tx);
  }

  async login(email: string, password: string, intent: AuthLoginIntent): Promise<AuthSessionResponseDto> {
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

  async refresh(refreshToken: string): Promise<AuthSessionResponseDto> {
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
    // Respuesta genérica para no filtrar si el email existe.
    const generic = { message: 'Si el email existe, recibirás instrucciones.' };
    if (!user) return generic;

    const token = randomToken();
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    if (!this.mail.isConfigured()) {
      this.logger.warn(
        `Forgot-password: token creado para ${user.email} pero SMTP no está configurado (MAIL_ENABLED/SMTP_*). El correo no se enviará.`,
      );
      return generic;
    }

    try {
      await this.mail.sendPasswordReset(user.email, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Forgot-password OK but email failed: ${message}`);
    }
    return generic;
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
    const code = normalizeVerificationCode(token);
    if (!code) throw new BadRequestException('El código debe tener 6 dígitos');
    const row = await this.prisma.emailVerification.findFirst({
      where: { tokenHash: sha256(code), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) throw new BadRequestException('Código inválido o expirado');
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
    if (!this.mail.isConfigured()) {
      throw new BadRequestException('El envío de correo no está configurado en el servidor');
    }

    const recent = await this.prisma.emailVerification.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const elapsed = Date.now() - recent.createdAt.getTime();
      if (elapsed < AuthService.RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((AuthService.RESEND_COOLDOWN_MS - elapsed) / 1000);
        throw new BadRequestException(
          `Espera ${waitSec} s antes de reenviar. El correo anterior puede seguir en camino (revisa spam).`,
        );
      }
    }

    const token = await this.createVerificationToken(userId);
    try {
      // Await para devolver error real si Brevo rechaza el remitente (p. ej. Gmail no verificado).
      await this.mail.sendEmailVerification(user.email, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Resend verification failed for ${user.email}: ${message}`);
      throw new BadRequestException(
        message || 'No se pudo enviar el correo. Intenta de nuevo en unos minutos.',
      );
    }
    return {
      message: 'Código de verificación en cola. Puede tardar 1–2 minutos; revisa spam si no llega.',
    };
  }

  /** Crea token siempre; el envío solo si el correo está configurado. */
  private async queueEmailVerification(userId: string, email: string): Promise<void> {
    try {
      const token = await this.createVerificationToken(userId);
      if (!this.mail.isConfigured()) {
        this.logger.warn(
          `Verification token created for ${email} but mail is not configured; user can resend later.`,
        );
        return;
      }
      this.mail.dispatchEmailVerification(email, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Register OK but verification token failed: ${message}`);
    }
  }

  private static readonly VERIFICATION_CODE_TTL_MS = 15 * 60_000;

  private async createVerificationToken(userId: string): Promise<string> {
    const code = randomVerificationCode();
    await this.prisma.$transaction([
      this.prisma.emailVerification.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailVerification.create({
        data: {
          userId,
          tokenHash: sha256(code),
          expiresAt: new Date(Date.now() + AuthService.VERIFICATION_CODE_TTL_MS),
        },
      }),
    ]);
    return code;
  }

  async getMe(jwtUser: JwtPayload): Promise<AuthMeResponseDto> {
    const profileRow = await this.users.getProfile(jwtUser.sub, jwtUser.sub);
    const claims = enrichJwtAuthClaims(jwtUser.role, {
      permissions: jwtUser.permissions,
      accountType: jwtUser.accountType,
      isAdmin: jwtUser.isAdmin,
    });

    return {
      id: jwtUser.sub,
      email: jwtUser.email,
      role: jwtUser.role,
      permissions: claims.permissions,
      isAdmin: claims.isAdmin,
      accountType: claims.accountType,
      profile: toAuthProfileDto(profileRow),
      barId: jwtUser.barId,
    };
  }

  private async issueTokensForUser(
    userId: string,
    email: string,
    role: Role,
  ): Promise<AuthSessionResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const payload = await this.buildJwtPayload(userId, email, role);
    const tokens = await this.issueTokens(payload);
    return {
      ...tokens,
      user: toAuthUserSummary(user),
    };
  }

  private async buildJwtPayload(userId: string, email: string, role: Role): Promise<JwtPayload> {
    const barClaims = await this.jwtBarClaims.buildForUser(userId, role);
    const authClaims = enrichJwtAuthClaims(role);
    return {
      sub: userId,
      email,
      role,
      ...barClaims,
      permissions: authClaims.permissions,
      accountType: authClaims.accountType,
      isAdmin: authClaims.isAdmin,
    };
  }

  private async issueTokens(payload: JwtPayload): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  }> {
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
