import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Matches,
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
export class AssessmentUploadFileDto {
  @IsString() @Length(1, 255) name: string;
  @IsString() mime: string;
  @IsInt() @Min(1) @Max(52428800) byteSize: number;
}
export class PlannedUploadFileDto extends AssessmentUploadFileDto {
  @IsUUID('4') clientFileId: string;
}
export class SubmissionCreateDto {
  @IsString() @Length(1, 100) clientGroupId: string;
  @IsOptional() @IsInt() @Min(1) studentId?: number;
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PlannedUploadFileDto)
  files?: PlannedUploadFileDto[];
}
export class IdentityDto {
  @IsInt() @Min(1) studentId: number;
  @IsInt() @Min(1) expectedIdentityRevision: number;
}
export class UploadDto extends AssessmentUploadFileDto {
  @IsOptional() @IsUUID() submissionId?: string;
  @IsOptional() @IsUUID('4') clientFileId?: string;
  @IsIn(['student_work', 'marking_guide']) purpose: string;
  @IsOptional() @IsString() sha256?: string;
}
export class ExamImportDto {
  @IsUUID('4') assetId: string;
  @IsString() @Matches(/^[\p{L}\p{N}_.-]{1,32}$/u) examCode: string;
}
export class AssignExamVersionDto {
  @IsUUID('4') examVersionId: string;
  @IsInt() @Min(1) expectedInputRevision: number;
}
export class ExamVersionDto {
  @IsOptional() @IsUUID('4') sourceVersionId?: string;
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
  @IsOptional() @IsBoolean() readyOnly?: boolean;
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
class ManualScoreDto {
  @IsString() @Length(1, 64) questionKey: string;
  @IsInt() @Min(0) earnedUnits: number;
}
export class ManualReviewDto {
  @IsInt() @Min(1) expectedInputRevision: number;
  @IsInt() @Min(1) expectedIdentityRevision: number;
  @IsOptional() @IsUUID() expectedReviewRevisionId?: string | null;
  @IsUUID() examVersionId: string;
  @IsString() @Length(1, 100) expectedVersionHash: string;
  @IsString() @Length(1, 1000) reason: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ManualScoreDto)
  scores: ManualScoreDto[];
}
export class ApproveReviewDto {
  @IsInt() @Min(1) expectedInputRevision: number;
  @IsUUID() expectedReviewRevisionId: string;
  @IsString() @Length(1, 100) expectedReviewHash: string;
  @IsInt() @Min(1) expectedContextRevision: number;
  @IsInt() @Min(1) expectedIdentityRevision: number;
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

export class ExternalTextReleaseDto {
  @IsInt() @Min(1) expectedInputRevision: number;
  @IsObject() hashes: Record<string, string>;
}

export class ExternalTextRevokeDto {
  @IsInt() @Min(1) expectedInputRevision: number;
}
