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
      secretOrKey: config.getOrThrow<string>('auth.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    const authClaims = enrichJwtAuthClaims(user.role, {
      permissions: payload.permissions,
      accountType: payload.accountType,
      isAdmin: payload.isAdmin,
    });
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
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
