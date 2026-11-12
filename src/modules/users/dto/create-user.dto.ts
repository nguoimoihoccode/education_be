import { IsEmail, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotCommonPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../../../common/validators/password.validator';

export class CreateUserDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    example: 'Password123!',
    description: `Password (minimum ${MIN_PASSWORD_LENGTH} characters)`,
    minLength: MIN_PASSWORD_LENGTH,
  })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  })
  @MaxLength(MAX_PASSWORD_LENGTH, {
    message: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`,
  })
  @IsNotCommonPassword()
  password: string;
}
