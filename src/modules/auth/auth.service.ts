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
import { randomUUID } from 'crypto';
import { RealtimeHub } from '../../common/realtime/realtime-hub.service';
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
import {
  resolveAgeVerifiedAt,
  resolvePublicRegisterRole,
} from './auth-register-age.logic';
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
  /**
   * Ventana de gracia para refresh concurrente del mismo token.
   * Dentro: 401 sin revocar familia (race).
   * Fuera: reuse sospechoso → revoca familia.
   */
  private static readonly REFRESH_RACE_GRACE_MS = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly subscriptions: BarSubscriptionService,
    private readonly jwtBarClaims: JwtBarClaimsService,
    private readonly users: UsersService,
    private readonly realtime: RealtimeHub,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSessionResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists && !exists.deletedAt) {
      throw new ConflictException('El email ya está registrado');
    }

    const role = resolvePublicRegisterRole(dto.role);
    const ageVerifiedAt = resolveAgeVerifiedAt(
      { birthDate: dto.birthDate, adultConfirmed: dto.adultConfirmed },
      role,
    );

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
            ageVerifiedAt,
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
          ageVerifiedAt,
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
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: normalized, deletedAt: null },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      this.logger.warn(
        JSON.stringify({
          event: 'auth_login_failed',
          emailHash: sha256(normalized).slice(0, 12),
        }),
      );
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
        event: 'auth_login_success',
        userIdHash: user.id.slice(0, 8),
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
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            deletedAt: true,
            securityVersion: true,
          },
        },
      },
    });

    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Token ya rotado/revocado: race concurrente vs reuse sospechoso.
    if (stored.revokedAt) {
      await this.handleRevokedRefreshPresentation(stored);
    }

    if (stored.expiresAt <= new Date() || stored.user.deletedAt) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    try {
      await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('auth.refreshSecret'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Rotación atómica: solo un request puede reclamar el token activo.
    const session = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count === 0) {
        const again = await tx.refreshToken.findFirst({ where: { id: stored.id } });
        if (again?.revokedAt) {
          await this.handleRevokedRefreshPresentation(again);
        }
        throw new UnauthorizedException('Refresh token inválido');
      }

      const payload = await this.buildJwtPayload(
        stored.user.id,
        stored.user.email,
        stored.user.role,
        stored.user.securityVersion,
      );
      const tokens = await this.issueTokens(payload, stored.familyId, tx);
      const successor = await tx.refreshToken.findFirst({
        where: { tokenHash: sha256(tokens.refreshToken) },
        select: { id: true },
      });
      if (successor) {
        await tx.refreshToken.update({
          where: { id: stored.id },
          data: { replacedById: successor.id },
        });
      }
      return tokens;
    });

    this.logger.log(
      JSON.stringify({
        event: 'auth_refresh',
        userIdHash: stored.user.id.slice(0, 8),
        role: stored.user.role,
      }),
    );
    return {
      ...session,
      user: toAuthUserSummary({
        id: stored.user.id,
        email: stored.user.email,
        role: stored.user.role,
      }),
    };
  }

  /**
   * Presentación de refresh ya revocado.
   * Race inmediata (ventana corta + replacedById): 401 sin matar familia.
   * Reuse posterior: revoca familia.
   * Nunca re-emite tokens desde A.
   */
  private async handleRevokedRefreshPresentation(stored: {
    id: string;
    userId: string;
    familyId: string;
    revokedAt: Date | null;
    replacedById?: string | null;
  }): Promise<never> {
    const revokedAt = stored.revokedAt ? new Date(stored.revokedAt).getTime() : 0;
    const ageMs = Date.now() - revokedAt;
    const plausibleRace =
      ageMs >= 0 &&
      ageMs <= AuthService.REFRESH_RACE_GRACE_MS &&
      (!!stored.replacedById || ageMs <= 2_000);

    if (plausibleRace) {
      this.logger.warn(
        JSON.stringify({
          event: 'refresh_race_detected',
          userIdHash: stored.userId.slice(0, 8),
          familyIdHash: stored.familyId.slice(0, 8),
          ageMs,
        }),
      );
      throw new UnauthorizedException('Refresh token inválido');
    }

    await this.revokeFamily(stored.familyId);
    this.logger.warn(
      JSON.stringify({
        event: 'refresh_reuse_detected',
        userIdHash: stored.userId.slice(0, 8),
        familyIdHash: stored.familyId.slice(0, 8),
        ageMs,
      }),
    );
    throw new UnauthorizedException('Refresh token inválido');
  }

  async logout(refreshToken: string): Promise<{ ok: true }> {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });
    if (stored && !stored.revokedAt) {
      // Logout de dispositivo: revoca la familia/sesión actual (no otras).
      await this.revokeFamily(stored.familyId);
      this.logger.log(
        JSON.stringify({
          event: 'auth_logout',
          userIdHash: stored.userId.slice(0, 8),
          familyIdHash: stored.familyId.slice(0, 8),
        }),
      );
    }
    // Respuesta uniforme (no filtrar si el token existía). Access residual ≤15m por diseño.
    return { ok: true };
  }

  async logoutAll(userId: string): Promise<{ ok: true; revoked: number }> {
    const result = await this.bumpSecurityAndRevokeAll(userId, 'logout_all');
    await this.prisma.deviceToken.deleteMany({ where: { userId } });
    this.realtime.disconnectUser(userId);
    this.logger.log(
      JSON.stringify({
        event: 'logout_all',
        userIdHash: userId.slice(0, 8),
        revoked: result,
      }),
    );
    return { ok: true, revoked: result };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthSessionResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, role: true, passwordHash: true, securityVersion: true },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }
    if (newPassword.trim().length < 8) {
      throw new BadRequestException('La nueva contraseña debe tener al menos 8 caracteres.');
    }
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          securityVersion: { increment: 1 },
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    this.realtime.disconnectUser(userId);
    this.logger.log(
      JSON.stringify({
        event: 'password_change_sessions_revoked',
        userIdHash: userId.slice(0, 8),
        securityVersion: user.securityVersion + 1,
      }),
    );
    this.logger.log(
      JSON.stringify({
        event: 'security_version_increment',
        userIdHash: userId.slice(0, 8),
        reason: 'password_change',
        securityVersion: user.securityVersion + 1,
      }),
    );
    // Sesión nueva limpia; cliente debe persistir tokens.
    return this.issueTokensForUser(user.id, user.email, user.role);
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
    if (newPassword.trim().length < 8) {
      throw new BadRequestException('La nueva contraseña debe tener al menos 8 caracteres.');
    }
    const passwordHash = await hashPassword(newPassword);
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: row.userId },
        data: {
          passwordHash,
          securityVersion: { increment: 1 },
        },
        select: { securityVersion: true },
      });
      await tx.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      // Single-use: invalidar otros resets pendientes.
      await tx.passwordReset.updateMany({
        where: { userId: row.userId, usedAt: null, id: { not: row.id } },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return user;
    });
    this.realtime.disconnectUser(row.userId);
    this.logger.log(
      JSON.stringify({
        event: 'password_reset_sessions_revoked',
        userIdHash: row.userId.slice(0, 8),
        securityVersion: updated.securityVersion,
      }),
    );
    this.logger.log(
      JSON.stringify({
        event: 'security_version_increment',
        userIdHash: row.userId.slice(0, 8),
        reason: 'password_reset',
        securityVersion: updated.securityVersion,
      }),
    );
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
    familyId?: string,
  ): Promise<AuthSessionResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, role: true, securityVersion: true },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const payload = await this.buildJwtPayload(userId, email, role, user.securityVersion);
    const tokens = await this.issueTokens(payload, familyId);
    return {
      ...tokens,
      user: toAuthUserSummary(user),
    };
  }

  private async buildJwtPayload(
    userId: string,
    email: string,
    role: Role,
    securityVersion: number,
  ): Promise<JwtPayload> {
    const barClaims = await this.jwtBarClaims.buildForUser(userId, role);
    const authClaims = enrichJwtAuthClaims(role);
    return {
      sub: userId,
      email,
      role,
      sv: securityVersion,
      ...barClaims,
      permissions: authClaims.permissions,
      accountType: authClaims.accountType,
      isAdmin: authClaims.isAdmin,
    };
  }

  private async issueTokens(
    payload: JwtPayload,
    familyId?: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  }> {
    const accessSecret = this.config.getOrThrow<string>('auth.accessSecret');
    const refreshSecret = this.config.getOrThrow<string>('auth.refreshSecret');
    const accessExpires = this.config.get<string>('auth.accessExpires', '15m');
    const refreshExpires = this.config.get<string>('auth.refreshExpires', '7d');
    const family = familyId ?? randomUUID();

    const accessToken = await this.jwt.signAsync(
      { ...payload, role: payload.role, sv: payload.sv ?? 0 },
      {
        secret: accessSecret,
        algorithm: 'HS256',
        expiresIn: accessExpires as `${number}d` | `${number}h` | `${number}m`,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: payload.sub, type: 'refresh', fid: family, jti: randomUUID() },
      {
        secret: refreshSecret,
        algorithm: 'HS256',
        expiresIn: refreshExpires as `${number}d` | `${number}h` | `${number}m`,
      },
    );
    const refreshMs = this.parseExpiry(refreshExpires);
    await db.refreshToken.create({
      data: {
        userId: payload.sub,
        familyId: family,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + refreshMs),
      },
    });
    return { accessToken, refreshToken, expiresIn: accessExpires };
  }

  private async revokeFamily(familyId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /** Incrementa securityVersion y revoca todos los refresh (eventos de seguridad globales). */
  private async bumpSecurityAndRevokeAll(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { securityVersion: { increment: 1 } },
        select: { securityVersion: true },
      });
      const revoked = await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.log(
        JSON.stringify({
          event: 'security_version_increment',
          userIdHash: userId.slice(0, 8),
          reason,
          securityVersion: user.securityVersion,
        }),
      );
      return revoked.count;
    });
    return result;
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
