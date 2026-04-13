import { IsOptional, IsString, IsEnum, IsNumber, Min } from 'class-validator';
import { CourseLevel } from '../entities/course.entity';

export class GetCoursesDto {
  @IsOptional()
  @IsString()
  languageId?: string;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 10;
}
