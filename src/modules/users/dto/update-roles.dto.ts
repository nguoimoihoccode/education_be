import { IsOptional, IsString, IsArray, IsBoolean } from 'class-validator';
import { UserRole } from '../../../common/enums/roles.enum';

export class UpdateUserRolesDto {
  @IsArray()
  roles: UserRole[];
}

export class PromoteToTeacherDto {
  @IsOptional()
  @IsString()
  bio?: string;
}

export class VerifyTeacherDto {
  @IsBoolean()
  verified: boolean;
}
