import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '1', description: 'Unique user identifier' })
  id: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  email: string;

  @ApiProperty({ example: 'Nguyễn Văn A', description: "User's display name" })
  displayName: string;

  @ApiProperty({
    example: 'https://example.com/avatars/user.jpg',
    description: 'URL to user avatar',
    nullable: true,
  })
  avatar: string | null;

  @ApiProperty({
    example: '+84912345678',
    description: 'User phone number',
    nullable: true,
  })
  phone: string | null;

  @ApiProperty({
    example: '2024-01-15T10:30:00Z',
    description: 'Account creation timestamp',
  })
  createdAt: string;

  @ApiProperty({
    example: '2024-03-20T14:45:00Z',
    description: 'Last profile update timestamp',
  })
  updatedAt: string;
}
