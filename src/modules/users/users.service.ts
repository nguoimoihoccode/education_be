import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import { UserDto } from './dto/user.dto';
import { User } from './entities/user.entity';
import { UserRole } from '../../common/enums/roles.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(
    createUserDto: CreateUserDto,
    provider?: string,
    providerId?: string,
  ): Promise<UserDto> {
    const existing = await this.findByEmail(createUserDto.email);
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const username = await this.generateUniqueUsername(createUserDto.email);
    const passwordHash = await bcrypt.hash(createUserDto.password, 10);
    const user = this.userRepository.create({
      email: createUserDto.email,
      passwordHash,
      username,
      provider: provider || 'email',
      providerId,
      roles: [UserRole.USER, UserRole.STUDENT], // Default roles for new users
      lastSeenAt: new Date(),
    });

    const savedUser = await this.userRepository.save(user);
    return this.toUserDto(savedUser);
  }

  async findByProviderId(providerId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { providerId } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findById(id: number): Promise<UserDto> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toUserDto(user);
  }

  async findEntityById(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async updateRoles(userId: number, roles: UserRole[]): Promise<UserDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.roles = roles;
    const savedUser = await this.userRepository.save(user);
    return this.toUserDto(savedUser);
  }

  async promoteToTeacher(userId: number, bio?: string): Promise<UserDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Add teacher role if not present
    if (!user.roles.includes(UserRole.TEACHER)) {
      user.roles = [...user.roles, UserRole.TEACHER];
    }
    user.isTeacher = true;
    user.teacherBio = bio || user.teacherBio;

    const savedUser = await this.userRepository.save(user);
    return this.toUserDto(savedUser);
  }

  async verifyTeacher(userId: number): Promise<UserDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.teacherVerified = true;
    const savedUser = await this.userRepository.save(user);
    return this.toUserDto(savedUser);
  }

  async isUsernameTaken(
    username: string,
    excludeUserId?: number,
  ): Promise<boolean> {
    const candidate = username.trim().toLowerCase();
    if (!candidate) {
      return false;
    }

    const existing = await this.userRepository.findOne({
      where: { username: candidate },
    });

    return !!existing && existing.id !== excludeUserId;
  }

  async updateProfile(
    userId: number,
    changes: { name?: string; username?: string; avatar?: string },
  ): Promise<UserDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (changes.name !== undefined) {
      user.name = changes.name;
    }

    if (changes.avatar !== undefined) {
      user.avatar = changes.avatar;
    }

    if (changes.username !== undefined) {
      user.username = changes.username.trim().toLowerCase() || undefined;
    }

    const savedUser = await this.userRepository.save(user);
    return this.toUserDto(savedUser);
  }

  async touchLastSeen(userId: number): Promise<void> {
    await this.userRepository.update(
      { id: userId },
      { lastSeenAt: new Date() },
    );
  }

  async findEntityByIdForAuth(userId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  toAuthUserResponse(user: User): {
    id: string;
    email: string;
    displayName: string;
    avatar: string | null;
    phone: string | null;
    createdAt: string;
    updatedAt: string;
  } {
    return {
      id: String(user.id),
      email: user.email,
      displayName: user.name || user.email.split('@')[0],
      avatar: user.avatar || null,
      phone: user.phone || null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private toUserDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      avatar: user.avatar,
      roles: user.roles,
      isTeacher: user.isTeacher,
      teacherVerified: user.teacherVerified,
      lastSeenAt: user.lastSeenAt,
    };
  }

  private async generateUniqueUsername(email: string): Promise<string> {
    const normalizedBase =
      email
        .split('@')[0]
        ?.trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '') || 'soulieuser';

    let candidate = normalizedBase;
    let suffix = 0;

    while (
      await this.userRepository.findOne({ where: { username: candidate } })
    ) {
      suffix += 1;
      candidate = `${normalizedBase}${suffix}`;
    }

    return candidate;
  }
}
