import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import {
  SlideDeckSourceType,
  SlideDeckStatus,
  SlideDeckTemplate,
  SlideItem,
} from '../entities/slide-deck.entity';

export class GenerateSlideDeckDto {
  @IsEnum(SlideDeckSourceType)
  sourceType: SlideDeckSourceType;

  @ValidateIf(
    (dto: GenerateSlideDeckDto) =>
      dto.sourceType === SlideDeckSourceType.LESSON,
  )
  @IsUUID()
  lessonId?: string;

  @ValidateIf(
    (dto: GenerateSlideDeckDto) =>
      dto.sourceType === SlideDeckSourceType.PROMPT,
  )
  @IsString()
  @IsNotEmpty()
  prompt?: string;

  @IsEnum(SlideDeckTemplate)
  template: SlideDeckTemplate;

  @IsIn([5, 8, 12])
  slideCount: number;
}

export class CreateSlideDeckDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(SlideDeckSourceType)
  sourceType: SlideDeckSourceType;

  @IsOptional()
  @IsUUID()
  sourceLessonId?: string;

  @IsEnum(SlideDeckTemplate)
  template: SlideDeckTemplate;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  slides: SlideItem[];
}

export class UpdateSlideDeckDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(SlideDeckTemplate)
  template?: SlideDeckTemplate;

  @IsOptional()
  @IsEnum(SlideDeckStatus)
  status?: SlideDeckStatus;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  slides?: SlideItem[];
}
