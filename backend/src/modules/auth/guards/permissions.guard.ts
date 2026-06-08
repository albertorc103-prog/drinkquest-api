import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthForbiddenException } from '../exceptions/auth-forbidden.exception';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthPermission } from '../permissions/auth-permission.enum';
import { hasAllPermissions } from '../permissions/auth-context.util';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AuthPermission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!user?.sub) {
      throw new UnauthorizedException('No autenticado');
    }

    if (!hasAllPermissions(user, required)) {
      throw new AuthForbiddenException();
    }
    return true;
  }
}
