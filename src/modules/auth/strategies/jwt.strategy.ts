import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../database/prisma.service';
import { enrichJwtAuthClaims } from '../permissions/auth-context.util';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Solo HS256: evita alg=none / algorithm confusion.
      algorithms: ['HS256'],
      secretOrKey: config.getOrThrow<string>('auth.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Token inválido');
    }
    // Corte limpio FASE 5.1: tokens sin `sv` (pre-migración) no son válidos.
    if (typeof payload.sv !== 'number' || !Number.isInteger(payload.sv) || payload.sv < 0) {
      throw new UnauthorizedException('Token inválido');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, role: true, securityVersion: true },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    if (payload.sv !== user.securityVersion) {
      throw new UnauthorizedException('Sesión invalidada');
    }
    // Rol/permisos desde DB (no confiar en claims de rol del JWT).
    const authClaims = enrichJwtAuthClaims(user.role);
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      sv: user.securityVersion,
      permissions: authClaims.permissions,
      accountType: authClaims.accountType,
      isAdmin: authClaims.isAdmin,
      barId: payload.barId,
      subscriptionStatus: payload.subscriptionStatus,
      subscriptionPlan: payload.subscriptionPlan,
      qrEnabled: payload.qrEnabled,
      promoEnabled: payload.promoEnabled,
    };
  }
}
