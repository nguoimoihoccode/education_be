import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ParentRelation } from '../entities/parent-link.entity';

/** GVCN generates a one-shot invite code for one student + one parent. */
export class InviteParentDto {
  @ApiProperty({ description: 'Student user id (must be active in the class)' })
  @Type(() => Number)
  @IsInt()
  studentId: number;

  @ApiProperty({ enum: ParentRelation, example: ParentRelation.MOTHER })
  @IsEnum(ParentRelation)
  relation: ParentRelation;

  @ApiPropertyOptional({ example: 'Trần Thị Bình', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  parentName?: string;

  @ApiPropertyOptional({ example: '0901234567', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  parentPhone?: string;
}

/** Parent redeems a code at /parent (self-service, after registration). */
export class ClaimInviteDto {
  @ApiProperty({
    example: 'K7M2-QX9D',
    description: 'Invite code from the GVCN',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9-]{4,20}$/, {
    message: 'invite code format is invalid',
  })
  code: string;
}
