import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../enums/roles.enum';

const createContext = (user?: {
  sub?: number;
  roles?: UserRole[];
}): ExecutionContext =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(() => ({ user })),
    })),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let usersService: { findById: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    usersService = { findById: jest.fn() };
    guard = new RolesGuard(
      reflector as unknown as Reflector,
      usersService as any,
    );
  });

  it('allows requests when no route roles are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('allows users with at least one required role', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.TEACHER,
      UserRole.ADMIN,
    ]);
    usersService.findById.mockResolvedValue({
      roles: [UserRole.STUDENT, UserRole.ADMIN],
    });

    await expect(
      guard.canActivate(createContext({ sub: 1, roles: [UserRole.STUDENT] })),
    ).resolves.toBe(true);
  });

  it('rejects authenticated users without assigned roles', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      new ForbiddenException('User has no roles assigned') as any,
    );
  });

  it('rejects users missing the required role', async () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    usersService.findById.mockResolvedValue({ roles: [UserRole.STUDENT] });

    await expect(
      guard.canActivate(createContext({ roles: [UserRole.STUDENT] })),
    ).rejects.toThrow(
      new ForbiddenException('User has no roles assigned') as any,
    );

    await expect(
      guard.canActivate(createContext({ sub: 1, roles: [UserRole.STUDENT] })),
    ).rejects.toThrow(
      new ForbiddenException('Insufficient permissions') as any,
    );
  });
});
