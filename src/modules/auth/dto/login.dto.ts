import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address or username',
  })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address (legacy field)',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'User password',
  })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
