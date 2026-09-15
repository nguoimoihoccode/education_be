import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateClassDto {
  @ApiProperty({ example: '6A', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 6, minimum: 0, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(12)
  grade: number;

  @ApiProperty({ description: 'Academic year id' })
  @IsUUID()
  academicYearId: string;

  @ApiPropertyOptional({ description: 'GVCN user id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  homeroomTeacherId?: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  maxStudents?: number;

  @ApiPropertyOptional({ example: 'A2-104' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  room?: string;
}

export class UpdateClassDto extends PartialType(CreateClassDto) {}

export class CreateAssignmentDto {
  @ApiProperty({ description: 'Teacher user id' })
  @Type(() => Number)
  @IsInt()
  teacherId: number;

  @ApiProperty({ description: 'Subject id (uuid)' })
  @IsUUID()
  subjectId: string;

  @ApiProperty({ description: 'Class id (uuid)' })
  @IsUUID()
  classId: string;
}

/**
 * Bulk add students to a class.
 * Existing users join directly; unknown emails get a STUDENT account with a
 * temporary password returned in the response (single-school MVP convenience).
 */
export class StudentEntryDto {
  @ApiProperty({ example: 'parent@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn An', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class AddStudentsDto {
  @ApiProperty({ type: [StudentEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentEntryDto)
  students: StudentEntryDto[];

  @ApiPropertyOptional({
    description: 'Skip creating accounts for unknown emails',
  })
  @IsOptional()
  @IsBoolean()
  existingOnly?: boolean;
}
