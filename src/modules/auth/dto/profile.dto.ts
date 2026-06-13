import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

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
    minLength: 6,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(50)
  newPassword: string;
}
