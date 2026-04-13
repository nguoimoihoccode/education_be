import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserDto } from './dto/user.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/enums/roles.enum';
import {
  UpdateUserRolesDto,
  PromoteToTeacherDto,
} from './dto/update-roles.dto';

@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Public: Create new user (registration)
  @Public()
  @Post()
  async create(@Body() createUserDto: CreateUserDto): Promise<UserDto> {
    return this.usersService.create(createUserDto);
  }

  // Get current user profile
  @Get('me')
  async getMe(@Request() req: any): Promise<UserDto> {
    const userId = req.user.id || req.user.sub;
    return this.usersService.findById(userId);
  }

  // Get user by ID (Admin only)
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  async getUserById(@Param('id') id: string): Promise<UserDto> {
    return this.usersService.findById(parseInt(id, 10));
  }

  // Update user roles (Admin only)
  @Put(':id/roles')
  @Roles(UserRole.ADMIN)
  async updateUserRoles(
    @Param('id') id: string,
    @Body() dto: UpdateUserRolesDto,
  ): Promise<UserDto> {
    return this.usersService.updateRoles(parseInt(id, 10), dto.roles);
  }

  // Request to become a teacher (any authenticated user)
  @Post('become-teacher')
  async requestTeacher(
    @Request() req: any,
    @Body() dto: PromoteToTeacherDto,
  ): Promise<UserDto> {
    const userId = req.user.id || req.user.sub;
    return this.usersService.promoteToTeacher(userId, dto.bio);
  }

  // Verify teacher (Admin/Education Admin only)
  @Put(':id/verify-teacher')
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  async verifyTeacher(@Param('id') id: string): Promise<UserDto> {
    return this.usersService.verifyTeacher(parseInt(id, 10));
  }
}
