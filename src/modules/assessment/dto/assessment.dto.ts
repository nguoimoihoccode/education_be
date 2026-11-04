import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
export class AssessmentCreateDto {
  @IsUUID() classId: string;
  @IsUUID() subjectId: string;
  @IsString() @Length(1, 200) title: string;
  @IsDateString({ strict: true }) examDate: string;
  @IsInt() @IsIn([1, 2]) term: number;
  @IsIn(['oral', '15min', '45min', 'final']) testType: string;
  @IsInt() @IsIn([1, 2]) coefficient: number;
  @IsInt() @Min(1) @Max(1000000) maxScoreUnits: number;
}
export class AssessmentPatchDto {
  @IsInt() @Min(1) expectedContextRevision: number;
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsDateString({ strict: true }) examDate?: string;
  @IsOptional() @IsInt() @IsIn([1, 2]) term?: number;
  @IsOptional() @IsIn(['oral', '15min', '45min', 'final']) testType?: string;
  @IsOptional() @IsInt() @IsIn([1, 2]) coefficient?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) maxScoreUnits?: number;
}
export class SubmissionCreateDto {
  @IsString() @Length(1, 100) clientGroupId: string;
  @IsOptional() @IsInt() @Min(1) studentId?: number;
}
export class IdentityDto {
  @IsInt() @Min(1) studentId: number;
  @IsInt() @Min(1) expectedIdentityRevision: number;
}
export class UploadDto {
  @IsOptional() @IsUUID() submissionId?: string;
  @IsIn(['student_work', 'marking_guide']) purpose: string;
  @IsString() @Length(1, 255) name: string;
  @IsString() mime: string;
  @IsInt() @Min(1) @Max(52428800) byteSize: number;
  @IsOptional() @IsString() sha256?: string;
}
export class ExamVersionDto {
  @IsString() @Length(1, 50) examCode: string;
  @IsObject() document: Record<string, any>;
}
export class ApproveVersionDto {
  @IsString() expectedVersionHash: string;
  @IsOptional() @IsIn(['unpublished']) applyTo?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  submissionIds?: string[];
}
export class ProcessDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  submissionIds?: string[];
  @IsObject() expectedInputRevisions: Record<string, number>;
}
export class AnswerDto {
  @IsInt() @Min(1) expectedInputRevision: number;
  @IsUUID() expectedAnswerRevisionId: string;
  @IsObject() content: Record<string, any>;
  @IsString() @Length(1, 1000) reason: string;
}
export class ReviewDto {
  @IsUUID() expectedReviewRevisionId: string;
  @IsOptional() @IsArray() overrides?: any[];
  @IsOptional() @IsArray() flagResolutions?: any[];
}
export class FinalizationItemDto {
  @IsUUID() submissionId: string;
  @IsInt() expectedInputRevision: number;
  @IsUUID() expectedReviewRevisionId: string;
  @IsString() expectedReviewHash: string;
  @IsInt() expectedContextRevision: number;
  @IsOptional() @IsInt() expectedPublicationRevision: number | null;
  @IsObject() identityAcknowledgement: {
    studentId: number;
    expectedIdentityRevision: number;
  };
}
export class FinalizationsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FinalizationItemDto)
  items: FinalizationItemDto[];
}
export class WithdrawDto {
  @IsInt() @Min(1) expectedPublicationRevision: number;
  @IsString() @Length(1, 1000) reason: string;
}
export class ExportDto {
  @IsIn(['xlsx', 'pdf']) format: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  submissionIds?: string[];
}
export class RosterDto {
  @IsInt() @Min(1) expectedContextRevision: number;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  studentIds: number[];
}
export class PageSelectionDto {
  @IsInt() @Min(1) expectedInputRevision: number;
  @IsArray() @ArrayNotEmpty() primaryPolygon: number[][];
}
