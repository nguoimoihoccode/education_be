import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common/exceptions/forbidden.exception';
import { UserRole } from '../enums/roles.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UsersService } from '../../modules/users/users.service';

@Injectable()
export class RolesGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user?.sub) {
      throw new ForbiddenException('User has no roles assigned');
    }

    const currentUser = await this.usersService.findById(user.sub);
    const currentRoles = currentUser.roles ?? [];
    const hasRole = requiredRoles.some((role) => currentRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    user.roles = currentRoles;
    return true;
  }
}
