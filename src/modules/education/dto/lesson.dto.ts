import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { LessonType } from '../entities/lesson.entity';

export class CreateLessonDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsEnum(LessonType)
  type: LessonType = LessonType.VOCABULARY;

  @IsOptional()
  @IsNumber()
  @Min(1)
  estimatedMinutes?: number = 15;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsNotEmpty()
  @IsString()
  courseId: string;
}

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(LessonType)
  type?: LessonType;

  @IsOptional()
  @IsNumber()
  @Min(1)
  estimatedMinutes?: number;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsNumber()
  orderIndex?: number;

  @IsOptional()
  active?: boolean;
}

export class CompleteLessonDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  timeSpent?: number; // seconds

  @IsOptional()
  @IsNumber()
  @Min(0)
  exerciseScore?: number;
}
