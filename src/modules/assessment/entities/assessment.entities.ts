import {
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export abstract class AssessmentTenantRow {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'school_id', type: 'uuid' }) schoolId: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
  @Column({ type: 'integer', default: 1 }) revision: number;
}

@Entity('school_assessments')
@Index('school_assessments_tenant_id', ['schoolId', 'id'], { unique: true })
export class Assessment extends AssessmentTenantRow {
  @Column({ name: 'class_id', type: 'uuid' }) classId: string;
  @Column({ name: 'subject_id', type: 'uuid' }) subjectId: string;
  @Column({ name: 'academic_year_id', type: 'uuid' }) academicYearId: string;
  @Column({ name: 'owner_id', type: 'integer' }) ownerId: number;
  @Column({ name: 'title', type: 'text' }) title: string;
  @Column({ name: 'exam_date', type: 'date' }) examDate: string;
  @Column({ name: 'term', type: 'integer' }) term: number;
  @Column({ name: 'test_type', type: 'text' }) testType: string;
  @Column({ name: 'coefficient', type: 'integer' }) coefficient: number;
  @Column({ name: 'max_score_units', type: 'integer' }) maxScoreUnits: number;
  @Column({ name: 'context_revision', type: 'integer', default: 1 })
  contextRevision: number;
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;
}

@Entity('school_assessment_roster')
@Index('school_assessment_roster_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
@Index(
  'school_assessment_roster_business_unique',
  ['assessmentId', 'studentId'],
  { unique: true },
)
export class AssessmentRoster extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'student_id', type: 'integer' }) studentId: number;
  @Column({ name: 'display_name_snapshot', type: 'text' })
  displayNameSnapshot: string;
  @Column({ name: 'student_code_snapshot', type: 'text', nullable: true })
  studentCodeSnapshot: string | null;
  @Column({ name: 'membership_id', type: 'uuid' }) membershipId: string;
  @Column({ name: 'added_by', type: 'integer' }) addedBy: number;
  @Column({ name: 'added_at', type: 'timestamptz' }) addedAt: Date;
}

@Entity('school_assessment_exam_versions')
@Index('school_assessment_exam_versions_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
@Index(
  'school_assessment_exam_versions_business_unique',
  ['assessmentId', 'examCode', 'versionNumber'],
  { unique: true },
)
export class AssessmentExamVersion extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'exam_code', type: 'text' }) examCode: string;
  @Column({ name: 'version_number', type: 'integer' }) versionNumber: number;
  @Column({ name: 'state', type: 'text', default: 'draft' }) state: string;
  @Column({ name: 'document', type: 'jsonb', default: () => "'{}'::jsonb" })
  document: any;
  @Column({ name: 'question_content_hash', type: 'text' })
  questionContentHash: string;
  @Column({ name: 'grading_spec_hash', type: 'text' }) gradingSpecHash: string;
  @Column({
    name: 'source_region_ids',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  sourceRegionIds: any;
  @Column({ name: 'draft_source', type: 'text', default: 'teacher' })
  draftSource: string;
  @Column({ name: 'approved_by', type: 'integer', nullable: true }) approvedBy:
    | number
    | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;
}

@Entity('school_assessment_submissions')
@Index('school_assessment_submissions_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
@Index(
  'school_assessment_submissions_business_unique',
  ['assessmentId', 'clientGroupId'],
  { unique: true },
)
@Index('assessment_submission_student_unique', ['assessmentId', 'studentId'], {
  unique: true,
  where: 'student_id IS NOT NULL AND deleted_at IS NULL',
})
export class AssessmentSubmission extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'client_group_id', type: 'text' }) clientGroupId: string;
  @Column({ name: 'student_id', type: 'integer', nullable: true }) studentId:
    | number
    | null;
  @Column({ name: 'identity_state', type: 'text', default: 'unresolved' })
  identityState: string;
  @Column({ name: 'identity_revision', type: 'integer', default: 1 })
  identityRevision: number;
  @Column({ name: 'exam_version_id', type: 'uuid', nullable: true })
  examVersionId: string | null;
  @Column({ name: 'input_revision', type: 'integer', default: 1 })
  inputRevision: number;
  @Column({ name: 'processing_state', type: 'text', default: 'idle' })
  processingState: string;
  @Column({
    name: 'current_page_ids',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  currentPageIds: any;
  @Column({
    name: 'current_answer_revision_ids',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  currentAnswerRevisionIds: any;
  @Column({ name: 'current_review_revision_id', type: 'uuid', nullable: true })
  currentReviewRevisionId: string | null;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

@Entity('school_assessment_assets')
@Index('school_assessment_assets_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
export class AssessmentAsset extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId: string | null;
  @Column({ name: 'purpose', type: 'text' }) purpose: string;
  @Column({ name: 'original_name', type: 'text' }) originalName: string;
  @Column({ name: 'declared_mime', type: 'text' }) declaredMime: string;
  @Column({ name: 'verified_mime', type: 'text', nullable: true })
  verifiedMime: string | null;
  @Column({
    name: 'byte_size',
    type: 'bigint',
    transformer: {
      to: (v: number) => v,
      from: (v: string) => (v === null ? null : Number(v)),
    },
  })
  byteSize: number;
  @Column({ name: 'sha256', type: 'text', nullable: true }) sha256:
    | string
    | null;
  @Column({ name: 'staging_key', type: 'text', nullable: true }) stagingKey:
    | string
    | null;
  @Column({ name: 'sealed_key', type: 'text', nullable: true }) sealedKey:
    | string
    | null;
  @Column({ name: 'storage_version_id', type: 'text', nullable: true })
  storageVersionId: string | null;
  @Column({ name: 'state', type: 'text', default: 'uploading' }) state: string;
  @Column({ name: 'upload_expires_at', type: 'timestamptz' })
  uploadExpiresAt: Date;
  @Column({ name: 'sealed_at', type: 'timestamptz', nullable: true })
  sealedAt: Date | null;
}

@Entity('school_assessment_pages')
@Index('school_assessment_pages_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
@Index(
  'school_assessment_pages_business_unique',
  ['assetId', 'sourcePageNumber', 'analysisRevision'],
  { unique: true },
)
export class AssessmentPage extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId: string | null;
  @Column({ name: 'asset_id', type: 'uuid' }) assetId: string;
  @Column({ name: 'source_page_number', type: 'integer' })
  sourcePageNumber: number;
  @Column({ name: 'analysis_revision', type: 'integer' })
  analysisRevision: number;
  @Column({ name: 'width_px', type: 'integer' }) widthPx: number;
  @Column({ name: 'height_px', type: 'integer' }) heightPx: number;
  @Column({ name: 'analysis_object_key', type: 'text' })
  analysisObjectKey: string;
  @Column({ name: 'page_role', type: 'text' }) pageRole: string;
  @Column({
    name: 'primary_polygon',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  primaryPolygon: any;
  @Column({
    name: 'transform_to_original',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  transformToOriginal: any;
  @Column({ name: 'quality', type: 'jsonb', default: () => "'{}'::jsonb" })
  quality: any;
}

@Entity('school_assessment_regions')
@Index('school_assessment_regions_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
@Index('school_assessment_regions_business_unique', ['pageId', 'regionKey'], {
  unique: true,
})
export class AssessmentRegion extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'page_id', type: 'uuid' }) pageId: string;
  @Column({ name: 'region_key', type: 'text' }) regionKey: string;
  @Column({ name: 'role', type: 'text' }) role: string;
  @Column({ name: 'polygon', type: 'jsonb', default: () => "'{}'::jsonb" })
  polygon: any;
  @Column({ name: 'text', type: 'text', nullable: true }) text: string | null;
  @Column({
    name: 'structured_content',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  structuredContent: any;
  @Column({
    name: 'source_token_refs',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  sourceTokenRefs: any;
  @Column({ name: 'parent_region_id', type: 'uuid', nullable: true })
  parentRegionId: string | null;
  @Column({ name: 'reader_profile_hash', type: 'text' })
  readerProfileHash: string;
}

@Entity('school_assessment_answer_revisions')
@Index('school_assessment_answer_revisions_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
@Index(
  'school_assessment_answer_revisions_business_unique',
  ['submissionId', 'questionKey', 'revisionNumber'],
  { unique: true },
)
export class AssessmentAnswerRevision extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'submission_id', type: 'uuid' }) submissionId: string;
  @Column({ name: 'exam_version_id', type: 'uuid' }) examVersionId: string;
  @Column({ name: 'question_key', type: 'text' }) questionKey: string;
  @Column({ name: 'revision_number', type: 'integer' }) revisionNumber: number;
  @Column({ name: 'observation_state', type: 'text' }) observationState: string;
  @Column({ name: 'content', type: 'jsonb', default: () => "'{}'::jsonb" })
  content: any;
  @Column({
    name: 'source_region_ids',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  sourceRegionIds: any;
  @Column({ name: 'origin', type: 'text' }) origin: string;
  @Column({ name: 'supersedes_id', type: 'uuid', nullable: true })
  supersedesId: string | null;
  @Column({ name: 'reason', type: 'text', nullable: true }) reason:
    | string
    | null;
  @Column({ name: 'content_hash', type: 'text' }) contentHash: string;
}

@Entity('school_assessment_grading_runs')
@Index('school_assessment_grading_runs_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
export class AssessmentGradingRun extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'submission_id', type: 'uuid' }) submissionId: string;
  @Column({ name: 'exam_version_id', type: 'uuid' }) examVersionId: string;
  @Column({ name: 'input_revision', type: 'integer' }) inputRevision: number;
  @Column({
    name: 'scope_question_keys',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  scopeQuestionKeys: any;
  @Column({
    name: 'answer_revision_manifest',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  answerRevisionManifest: any;
  @Column({
    name: 'question_fingerprints',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  questionFingerprints: any;
  @Column({
    name: 'profile_snapshot',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  profileSnapshot: any;
  @Column({ name: 'prompt_snapshot_key', type: 'text' })
  promptSnapshotKey: string;
  @Column({ name: 'code_revision', type: 'text' }) codeRevision: string;
  @Column({ name: 'status', type: 'text' }) status: string;
  @Column({ name: 'output', type: 'jsonb', default: () => "'{}'::jsonb" })
  output: any;
  @Column({
    name: 'reused_from_run_ids',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  reusedFromRunIds: any;
  @Column({
    name: 'usage_summary',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  usageSummary: any;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}

@Entity('school_assessment_review_revisions')
@Index('school_assessment_review_revisions_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
@Index(
  'school_assessment_review_revisions_business_unique',
  ['submissionId', 'revisionNumber'],
  { unique: true },
)
export class AssessmentReviewRevision extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'submission_id', type: 'uuid' }) submissionId: string;
  @Column({ name: 'revision_number', type: 'integer' }) revisionNumber: number;
  @Column({ name: 'exam_version_id', type: 'uuid' }) examVersionId: string;
  @Column({
    name: 'input_manifest',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  inputManifest: any;
  @Column({
    name: 'effective_results',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  effectiveResults: any;
  @Column({ name: 'flags', type: 'jsonb', default: () => "'{}'::jsonb" })
  flags: any;
  @Column({ name: 'earned_units', type: 'integer', nullable: true })
  earnedUnits: number | null;
  @Column({ name: 'ungraded_max_units', type: 'integer' })
  ungradedMaxUnits: number;
  @Column({ name: 'content_hash', type: 'text' }) contentHash: string;
  @Column({ name: 'created_by', type: 'integer', nullable: true }) createdBy:
    | number
    | null;
}

@Entity('school_assessment_review_events')
@Index('school_assessment_review_events_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
export class AssessmentReviewEvent extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId: string | null;
  @Column({ name: 'actor_id', type: 'integer', nullable: true }) actorId:
    | number
    | null;
  @Column({ name: 'event_type', type: 'text' }) eventType: string;
  @Column({ name: 'before_ref', type: 'jsonb', default: () => "'{}'::jsonb" })
  beforeRef: any;
  @Column({ name: 'after_ref', type: 'jsonb', default: () => "'{}'::jsonb" })
  afterRef: any;
  @Column({ name: 'reason', type: 'text', nullable: true }) reason:
    | string
    | null;
  @Column({ name: 'request_id', type: 'text' }) requestId: string;
  @Column({
    name: 'event_payload',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  eventPayload: any;
}

@Entity('school_assessment_jobs')
@Index('school_assessment_jobs_tenant_id', ['schoolId', 'id'], { unique: true })
@Index(
  'school_assessment_jobs_business_unique',
  ['schoolId', 'stage', 'scopeKey', 'inputHash'],
  { unique: true },
)
export class AssessmentJob extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId: string | null;
  @Column({ name: 'stage', type: 'text' }) stage: string;
  @Column({ name: 'scope_key', type: 'text' }) scopeKey: string;
  @Column({ name: 'input_hash', type: 'text' }) inputHash: string;
  @Column({ name: 'data', type: 'jsonb', default: () => "'{}'::jsonb" })
  data: any;
  @Column({ name: 'state', type: 'text', default: 'pending' }) state: string;
  @Column({ name: 'dispatch_generation', type: 'integer', default: 0 })
  dispatchGeneration: number;
  @Column({ name: 'lease_token', type: 'uuid', nullable: true }) leaseToken:
    | string
    | null;
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true })
  leaseUntil: Date | null;
  @Column({ name: 'lease_owner', type: 'text', nullable: true }) leaseOwner:
    | string
    | null;
  @Column({ name: 'fencing_token', type: 'integer', default: 0 })
  fencingToken: number;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz' }) nextAttemptAt: Date;
  @Column({ name: 'last_error_code', type: 'text', nullable: true })
  lastErrorCode: string | null;
  @Column({ name: 'result_ref', type: 'jsonb', default: () => "'{}'::jsonb" })
  resultRef: any;
  @Column({ name: 'execution_target', type: 'text', default: 'vps_colocated' })
  executionTarget: string;
  @Column({ name: 'routing_version', type: 'text', default: '1' })
  routingVersion: string;
  @Column({ name: 'routing_policy_hash', type: 'text' })
  routingPolicyHash: string;
  @Column({ name: 'producer_agent', type: 'text' }) producerAgent: string;
}

@Entity('school_assessment_provider_calls')
@Index('school_assessment_provider_calls_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
@Index(
  'school_assessment_provider_calls_business_unique',
  ['jobId', 'attemptNumber', 'requestHash'],
  { unique: true },
)
export class AssessmentProviderCall extends AssessmentTenantRow {
  @Column({ name: 'job_id', type: 'uuid' }) jobId: string;
  @Column({ name: 'attempt_number', type: 'integer' }) attemptNumber: number;
  @Column({ name: 'profile_hash', type: 'text' }) profileHash: string;
  @Column({ name: 'provider', type: 'text' }) provider: string;
  @Column({ name: 'model_requested', type: 'text' }) modelRequested: string;
  @Column({ name: 'model_reported', type: 'text', nullable: true })
  modelReported: string | null;
  @Column({ name: 'purpose', type: 'text' }) purpose: string;
  @Column({ name: 'request_hash', type: 'text' }) requestHash: string;
  @Column({ name: 'response_object_key', type: 'text', nullable: true })
  responseObjectKey: string | null;
  @Column({ name: 'provider_request_id', type: 'text', nullable: true })
  providerRequestId: string | null;
  @Column({ name: 'state', type: 'text' }) state: string;
  @Column({ name: 'input_usage', type: 'jsonb', default: () => "'{}'::jsonb" })
  inputUsage: any;
  @Column({ name: 'output_usage', type: 'jsonb', default: () => "'{}'::jsonb" })
  outputUsage: any;
  @Column({
    name: 'reserved_cost_micros',
    type: 'bigint',
    transformer: {
      to: (v: number) => v,
      from: (v: string) => (v === null ? null : Number(v)),
    },
  })
  reservedCostMicros: number;
  @Column({
    name: 'actual_cost_micros',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => (v === null ? null : Number(v)),
    },
  })
  actualCostMicros: number | null;
  @Column({ name: 'latency_ms', type: 'integer', nullable: true }) latencyMs:
    | number
    | null;
  @Column({ name: 'error_code', type: 'text', nullable: true }) errorCode:
    | string
    | null;
}

@Entity('school_assessment_publications')
@Index('school_assessment_publications_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
@Index('school_assessment_publications_business_unique', ['submissionId'], {
  unique: true,
})
@Index('assessment_publication_student_unique', ['assessmentId', 'studentId'], {
  unique: true,
})
export class AssessmentPublication extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'submission_id', type: 'uuid' }) submissionId: string;
  @Column({ name: 'student_id', type: 'integer' }) studentId: number;
  @Column({ name: 'review_revision_id', type: 'uuid' })
  reviewRevisionId: string;
  @Column({
    name: 'context_snapshot',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  contextSnapshot: any;
  @Column({ name: 'normalized_score_tenths', type: 'integer' })
  normalizedScoreTenths: number;
  @Column({ name: 'state', type: 'text', default: 'active' }) state: string;
  @Column({ name: 'finalized_by', type: 'integer' }) finalizedBy: number;
  @Column({ name: 'finalized_at', type: 'timestamptz' }) finalizedAt: Date;
  @Column({ name: 'withdrawn_by', type: 'integer', nullable: true })
  withdrawnBy: number | null;
  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;
  @Column({ name: 'withdrawal_reason', type: 'text', nullable: true })
  withdrawalReason: string | null;
}

@Entity('school_assessment_exports')
@Index('school_assessment_exports_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
export class AssessmentExport extends AssessmentTenantRow {
  @Column({ name: 'assessment_id', type: 'uuid' }) assessmentId: string;
  @Column({ name: 'format', type: 'text' }) format: string;
  @Column({
    name: 'snapshot_manifest',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  snapshotManifest: any;
  @Column({ name: 'state', type: 'text', default: 'queued' }) state: string;
  @Column({ name: 'output_object_key', type: 'text', nullable: true })
  outputObjectKey: string | null;
  @Column({ name: 'created_by', type: 'integer' }) createdBy: number;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'error_code', type: 'text', nullable: true }) errorCode:
    | string
    | null;
}

@Entity('school_assessment_idempotency')
@Index('school_assessment_idempotency_tenant_id', ['schoolId', 'id'], {
  unique: true,
})
@Index(
  'school_assessment_idempotency_business_unique',
  ['schoolId', 'actorId', 'routeScope', 'idempotencyKey'],
  { unique: true },
)
export class AssessmentIdempotency extends AssessmentTenantRow {
  @Column({ name: 'actor_id', type: 'integer' }) actorId: number;
  @Column({ name: 'route_scope', type: 'text' }) routeScope: string;
  @Column({ name: 'idempotency_key', type: 'text' }) idempotencyKey: string;
  @Column({ name: 'request_hash', type: 'text' }) requestHash: string;
  @Column({ name: 'state', type: 'text', default: 'running' }) state: string;
  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus: number | null;
  @Column({
    name: 'response_body',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  responseBody: any;
  @Column({ name: 'lease_until', type: 'timestamptz' }) leaseUntil: Date;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
}

export const ASSESSMENT_ENTITIES = [
  Assessment,
  AssessmentRoster,
  AssessmentExamVersion,
  AssessmentSubmission,
  AssessmentAsset,
  AssessmentPage,
  AssessmentRegion,
  AssessmentAnswerRevision,
  AssessmentGradingRun,
  AssessmentReviewRevision,
  AssessmentReviewEvent,
  AssessmentJob,
  AssessmentProviderCall,
  AssessmentPublication,
  AssessmentExport,
  AssessmentIdempotency,
];
