import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { HomeworkTargetType } from '../entities/homework-assignment.entity';

/** GV giao một bài (quiz/deck có sẵn của Learning Hub) cho lớp. */
export class CreateHomeworkDto {
  @ApiProperty({ description: 'Class id (uuid)' })
  @IsUUID()
  classId: string;

  @ApiProperty({ description: 'Subject id (uuid)' })
  @IsUUID()
  subjectId: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  /** ISO datetime — deadline có cả giờ (VD '2026-09-20T19:00:00.000Z'). */
  @ApiProperty({ example: '2026-09-20T19:00:00.000Z' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ enum: HomeworkTargetType })
  @IsEnum(HomeworkTargetType)
  targetType: HomeworkTargetType;

  @ApiProperty({ description: 'Quiz id hoặc FlashcardDeck id (uuid)' })
  @IsUUID()
  targetId: string;

  /** Bật = HS làm xong quiz này tự nhận đầu điểm 15 phút. */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  countsAsGrade?: boolean;
}
