import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSchoolDto {
  @ApiProperty({ example: 'Lingua School', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'LINGUA', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional({ example: '123 Nguyễn Huệ, TP.HCM' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '028 3822 0000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class UpdateSchoolDto extends PartialType(CreateSchoolDto) {}

export class CreateAcademicYearDto {
  @ApiProperty({ example: '2026-2027', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: '2026-09-05' })
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ example: '2027-05-31' })
  @IsString()
  @IsNotEmpty()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Set as the school current year (deactivates others)',
    default: false,
  })
  @IsOptional()
  makeActive?: boolean;
}

export class UpdateAcademicYearDto extends PartialType(CreateAcademicYearDto) {}

export class CreateSubjectDto {
  @ApiProperty({ example: 'Toán', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: 'TOAN', maxLength: 30 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code: string;

  @ApiPropertyOptional({
    example: '#8b5cf6',
    description: 'Timetable chip color',
  })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}

/** Grid shape for timetable pages (Phase 3). Stored as JSON on School. */
export class UpdatePeriodConfigDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodsPerDay: number;

  @ApiProperty({
    example: [2, 3, 4, 5, 6, 7],
    description: '1=Sunday, 2..7 = Thứ 2..Thứ 7',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  days: number[];
}
