import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { EducationActivityType } from '../entities/activity-log.entity';

export class ActivityLogQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: EducationActivityType })
  @IsOptional()
  @IsEnum(EducationActivityType)
  type?: EducationActivityType;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
