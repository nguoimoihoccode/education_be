import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export enum LeaderboardPeriod {
  WEEK = 'week',
  MONTH = 'month',
  ALL = 'all',
}

export enum LeaderboardCategory {
  XP = 'xp',
  STREAK = 'streak',
  LESSONS = 'lessons',
  QUIZ = 'quiz',
}

export class LeaderboardQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: LeaderboardPeriod,
    default: LeaderboardPeriod.WEEK,
  })
  @IsOptional()
  @IsEnum(LeaderboardPeriod)
  period: LeaderboardPeriod = LeaderboardPeriod.WEEK;

  @ApiPropertyOptional({
    enum: LeaderboardCategory,
    default: LeaderboardCategory.XP,
  })
  @IsOptional()
  @IsEnum(LeaderboardCategory)
  category: LeaderboardCategory = LeaderboardCategory.XP;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  declare limit?: number;

  constructor() {
    super();
    this.limit = 20;
  }

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
