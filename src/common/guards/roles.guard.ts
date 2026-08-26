import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!user?.role) {
      throw new ForbiddenException('No autenticado para este recurso.');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        'Tu cuenta no tiene permiso de negocio para esta acción. Cierra sesión e inicia como Negocio.',
      );
    }
    return true;
  }
}
