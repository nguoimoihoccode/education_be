import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AttendanceStatus } from '../entities/attendance-record.entity';

/** Một ô TKK do hiệu trưởng xếp lên grid. */
export class CreateTimetableSlotDto {
  @ApiProperty({ description: 'Class id (uuid)' })
  @IsUUID()
  classId: string;

  @ApiProperty({ description: 'Subject id (uuid)' })
  @IsUUID()
  subjectId: string;

  @ApiProperty({ description: 'Teacher user id' })
  @Type(() => Number)
  @IsInt()
  teacherId: number;

  @ApiProperty({ example: 2, description: '1=Sunday, 2..7 = Thứ 2..Thứ 7' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ example: 3, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodNumber: number;

  @ApiPropertyOptional({ example: 'A2-104' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  room?: string;
}

/**
 * Candidate slot for POST /timetable/validate — the "what-if" grid.
 * subjectId is accepted but irrelevant to conflicts (kept so the FE can send
 * the exact payload it would submit).
 */
export class TimetableSlotCandidateDto {
  @ApiProperty()
  @IsUUID()
  classId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  teacherId: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodNumber: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  room?: string;
}

export class ValidateTimetableDto {
  @ApiProperty({ type: [TimetableSlotCandidateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimetableSlotCandidateDto)
  slots: TimetableSlotCandidateDto[];
}

/** Một dòng trong phiếu điểm danh của một tiết. */
export class AttendanceRecordInputDto {
  @ApiProperty({ description: 'Student user id' })
  @Type(() => Number)
  @IsInt()
  studentId: number;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

/** Bulk upsert điểm danh 1 tiết = cả lớp (docs §3.4). */
export class TakeAttendanceDto {
  @ApiProperty({ description: 'Class id (uuid)' })
  @IsUUID()
  classId: string;

  @ApiProperty({ example: '2026-09-14' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  date: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodNumber: number;

  @ApiProperty({ type: [AttendanceRecordInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordInputDto)
  records: AttendanceRecordInputDto[];
}
