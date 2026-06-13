import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  EducationExportFormat,
  EducationExportTimeRange,
} from '../entities/data-export.entity';

@ValidatorConstraint({ name: 'hasSelectedDataType', async: false })
class HasSelectedDataTypeConstraint implements ValidatorConstraintInterface {
  validate(value: EducationExportDataTypesDto) {
    return (
      !!value &&
      ['profile', 'progress', 'flashcards', 'quizzes', 'forum'].some(
        (key) => value[key as keyof EducationExportDataTypesDto],
      )
    );
  }

  defaultMessage(_args: ValidationArguments) {
    return 'Select at least one data type';
  }
}

export class EducationExportDataTypesDto {
  @ApiProperty({ default: true })
  @IsBoolean()
  profile = true;

  @ApiProperty({ default: true })
  @IsBoolean()
  progress = true;

  @ApiProperty({ default: true })
  @IsBoolean()
  flashcards = true;

  @ApiProperty({ default: true })
  @IsBoolean()
  quizzes = true;

  @ApiProperty({ default: false })
  @IsBoolean()
  forum = false;

  [key: string]: boolean | undefined;
}

export class RequestDataExportDto {
  @ApiProperty({ enum: EducationExportFormat })
  @IsEnum(EducationExportFormat)
  format: EducationExportFormat;

  @ApiProperty({ enum: EducationExportTimeRange })
  @IsEnum(EducationExportTimeRange)
  timeRange: EducationExportTimeRange;

  @ApiProperty({ type: EducationExportDataTypesDto })
  @ValidateNested()
  @Type(() => EducationExportDataTypesDto)
  @Validate(HasSelectedDataTypeConstraint)
  dataTypes: EducationExportDataTypesDto;
}
