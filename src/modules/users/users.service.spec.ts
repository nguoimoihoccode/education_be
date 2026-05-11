import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../../common/enums/roles.enum';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

const createUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'learner@example.com',
    passwordHash: 'hashed-password',
    username: 'learner',
    roles: [UserRole.USER, UserRole.STUDENT],
    isTeacher: false,
    teacherVerified: false,
    lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    hasRole: jest.fn(),
    isTeacherRole: jest.fn(),
    ...overrides,
  }) as User;

describe('UsersService', () => {
  let service: UsersService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn((entity) => entity),
      save: jest.fn(async (entity) => createUser(entity)),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    jest.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('creates email users with default user and student roles', async () => {
    repository.findOne.mockResolvedValue(null);

    const user = await service.create({
      email: 'Learner@example.com',
      password: 'secret123',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'Learner@example.com',
        passwordHash: 'hashed-password',
        username: 'learner',
        provider: 'email',
        roles: [UserRole.USER, UserRole.STUDENT],
      }),
    );
    expect(user).toMatchObject({
      email: 'Learner@example.com',
      roles: [UserRole.USER, UserRole.STUDENT],
    });
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email addresses', async () => {
    repository.findOne.mockResolvedValue(createUser());

    await expect(
      service.create({ email: 'learner@example.com', password: 'secret123' }),
    ).rejects.toThrow(ConflictException);
  });

  it('generates a unique username when the email prefix is already taken', async () => {
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createUser({ username: 'learner' }))
      .mockResolvedValueOnce(null);

    await service.create({
      email: 'learner@example.com',
      password: 'secret123',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'learner1' }),
    );
  });

  it('updates roles for an existing user', async () => {
    repository.findOne.mockResolvedValue(createUser());

    const user = await service.updateRoles(1, [UserRole.ADMIN]);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ roles: [UserRole.ADMIN] }),
    );
    expect(user.roles).toEqual([UserRole.ADMIN]);
  });

  it('throws when updating roles for a missing user', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.updateRoles(99, [UserRole.ADMIN])).rejects.toThrow(
      NotFoundException,
    );
  });

  it('promotes a user to teacher without duplicating the teacher role', async () => {
    repository.findOne.mockResolvedValue(
      createUser({ roles: [UserRole.USER, UserRole.TEACHER] }),
    );

    const user = await service.promoteToTeacher(1, 'I teach languages');

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: [UserRole.USER, UserRole.TEACHER],
        isTeacher: true,
        teacherBio: 'I teach languages',
      }),
    );
    expect(user.roles).toEqual([UserRole.USER, UserRole.TEACHER]);
  });

  it('verifies an existing teacher', async () => {
    repository.findOne.mockResolvedValue(
      createUser({ teacherVerified: false }),
    );

    const user = await service.verifyTeacher(1);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ teacherVerified: true }),
    );
    expect(user.teacherVerified).toBe(true);
  });
});
