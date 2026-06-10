import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, Min } from 'class-validator';

export class LoginSessionDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  tokenId: string;

  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Nguyen Van A' })
  displayName?: string;

  @ApiPropertyOptional({ example: '192.168.1.10' })
  ipAddress?: string;

  @ApiPropertyOptional({ example: 'Mozilla/5.0' })
  userAgent?: string;

  @ApiProperty({ example: 'Desktop' })
  device: string;

  @ApiProperty({ example: 'Chrome' })
  browser: string;

  @ApiProperty({ example: 'macOS' })
  os: string;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  createdAt: Date;

  @ApiPropertyOptional({ example: '2024-01-15T11:30:00Z' })
  lastUsedAt?: Date;

  @ApiProperty({ example: '2024-01-22T10:30:00Z' })
  expiresAt: Date;

  @ApiProperty({ example: false })
  isRevoked: boolean;

  @ApiProperty({ example: true })
  isCurrentSession: boolean;
}

export class AdminSessionFilterDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '') return undefined;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return value;
  })
  @IsInt()
  @Min(1)
  userId?: number;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  active?: boolean;
}
