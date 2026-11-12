import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  IsNotCommonPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../../../common/validators/password.validator';

export class UpdateAuthProfileDto {
  @ApiProperty({
    example: 'Nguyen Van A',
    description: 'Display name',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'Display name must not be blank' })
  @MaxLength(100)
  displayName: string;

  @ApiPropertyOptional({
    example: '0900000000',
    description: 'Phone number; blank clears the existing value',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current account password' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    description: 'New password',
    minLength: MIN_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH, {
    message: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`,
  })
  @IsNotCommonPassword()
  newPassword: string;
}
