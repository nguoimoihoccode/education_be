import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { GradeTestType } from '../entities/grade-entry.entity';

/** Một đầu điểm giáo viên nhập vào sổ điểm. */
export class CreateGradeDto {
  @ApiProperty({ description: 'Class id (uuid)' })
  @IsUUID()
  classId: string;

  @ApiProperty({ description: 'Subject id (uuid)' })
  @IsUUID()
  subjectId: string;

  @ApiProperty({ description: 'Student user id' })
  @Type(() => Number)
  @IsInt()
  studentId: number;

  @ApiProperty({ enum: GradeTestType })
  @IsEnum(GradeTestType)
  testType: GradeTestType;

  @ApiProperty({ example: 8.5, minimum: 0, maximum: 10 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(10)
  score: number;

  @ApiProperty({ example: '2026-09-14' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  date: string;

  /** 1 | 2 — bỏ trống thì suy ra từ testType (15p/miệng ×1, 45p/cuối ×2). */
  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  coefficient?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  term?: number;
}

export class UpdateGradeDto extends PartialType(CreateGradeDto) {}
