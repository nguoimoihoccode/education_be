import {
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { UserRole } from '../../../common/enums/roles.enum';

export class UpdateUserRolesDto {
  @IsArray()
  @IsEnum(UserRole, { each: true })
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
