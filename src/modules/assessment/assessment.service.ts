import { loadRouting } from './runtime/routing';
import { Inject, Injectable, Optional, HttpException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as E from './entities/assessment.entities';
import { SchoolClassSubjectAccessService } from '../school/school-class-subject-access.service';
import { SchoolService } from '../school/school.service';
import {
  SchoolClass,
  Subject,
  ClassMembership,
  ParentLink,
  ParentLinkStatus,
  GradeEntry,
  GradeTestType,
} from '../school/entities';
import { ASSESSMENT_STORAGE } from './assessment.ports';
import type { AssessmentStoragePort } from './assessment.ports';
import {
  assessmentError,
  assertExamDocument,
  assertRevision,
  assertReviewPublishable,
  hash,
  normalizeScore,
  summarizeResults,
} from './domain/assessment.policy';
import * as D from './dto/assessment.dto';

@Injectable()
export class AssessmentService {
  constructor(
    private readonly db: DataSource,
    private readonly access: SchoolClassSubjectAccessService,
    private readonly schools: SchoolService,
    @Optional()
    @Inject(ASSESSMENT_STORAGE)
    private readonly storage?: AssessmentStoragePort,
  ) {}
  enabled() {
    return process.env.ASSESSMENT_ENABLED === 'true';
  }
  private ready() {
    if (!this.enabled())
      assessmentError('ASSESSMENT_NOT_READY', 'Assessment is disabled', 503);
  }
  private notFound(): never {
    return assessmentError(
      'ASSESSMENT_NOT_FOUND',
      'Assessment resource not found',
      404,
    );
  }
  async getAssessment(
    actor: number,
    id: string,
    m: EntityManager = this.db.manager,
    lock = false,
  ) {
    this.ready();
    const schoolId = await this.schools.resolveSchoolIdForUser(actor);
    const a = await m.findOne(E.Assessment, {
      where: { id, schoolId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!a) this.notFound();
    await this.access.assertAccess(actor, a.classId, a.subjectId, m);
    return a;
  }
  private mutable(a: E.Assessment) {
    if (a.archivedAt)
      assessmentError(
        'ASSESSMENT_INVALID_INPUT',
        'Assessment is archived',
        409,
      );
  }
  private async submission(
    a: E.Assessment,
    id: string,
    m = this.db.manager,
    lock = false,
  ) {
    const s = await m.findOne(E.AssessmentSubmission, {
      where: {
        id,
        schoolId: a.schoolId,
        assessmentId: a.id,
        deletedAt: IsNull(),
      },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!s) this.notFound();
    return s;
  }
  private async event(
    m: EntityManager,
    a: E.Assessment,
    actor: number,
    eventType: string,
    submissionId: string | null = null,
    beforeRef: any = {},
    afterRef: any = {},
    reason: string | null = null,
  ) {
    await m.save(
      E.AssessmentReviewEvent,
      m.create(E.AssessmentReviewEvent, {
        schoolId: a.schoolId,
        assessmentId: a.id,
        submissionId,
        actorId: actor,
        eventType,
        beforeRef,
        afterRef,
        reason,
        requestId: randomUUID(),
        eventPayload: { schemaVersion: 1 },
      }),
    );
  }
  private async job(
    m: EntityManager,
    a: E.Assessment,
    stage: string,
    scopeKey: string,
    data: any,
    submissionId: string | null = null,
  ) {
    let routingSnapshot: any = null;
    if (['extract', 'grade', 'template', 'aggregate'].includes(stage)) {
      try {
        routingSnapshot = loadRouting();
      } catch {
        assessmentError(
          'ASSESSMENT_NOT_READY',
          'Assessment routing configuration is not ready',
          503,
        );
      }
    }
    data = { ...data, ...(routingSnapshot ? { routingSnapshot } : {}) };
    const inputHash = hash(data);
    const old = await m.findOne(E.AssessmentJob, {
      where: { schoolId: a.schoolId, stage, scopeKey, inputHash },
    });
    if (old) {
      if (
        ['failed', 'retry_wait', 'paused'].includes(old.state) &&
        old.attemptCount < 5 &&
        !['budget_exceeded', 'invalid_input', 'policy_denied'].includes(
          old.lastErrorCode ?? '',
        ) &&
        (!old.leaseUntil || old.leaseUntil.getTime() <= Date.now())
      ) {
        old.state = 'pending';
        old.nextAttemptAt = new Date();
        old.dispatchGeneration++;
        await m.save(E.AssessmentJob, old);
      }
      return old;
    }
    return m.save(
      E.AssessmentJob,
      m.create(E.AssessmentJob, {
        schoolId: a.schoolId,
        assessmentId: a.id,
        submissionId,
        stage,
        scopeKey,
        inputHash,
        data,
        state: 'pending',
        nextAttemptAt: new Date(),
        resultRef: {},
        routingPolicyHash: routingSnapshot
          ? hash(routingSnapshot)
          : hash('vps_colocated:v1'),
        routingVersion: routingSnapshot?.routingVersion ?? '1',
        executionTarget: 'vps_colocated',
        producerAgent: 'assessment-api',
      }),
    );
  }
  /** Idempotency record commits atomically with business effects. Lock serializes a same-key retry. */
  async command<T>(
    actor: number,
    aId: string,
    key: string | undefined,
    scope: string,
    body: unknown,
    fn: (m: EntityManager, a: E.Assessment) => Promise<T>,
  ): Promise<T> {
    if (!key || key.length > 200)
      assessmentError(
        'ASSESSMENT_INVALID_INPUT',
        'Idempotency-Key is required (maximum 200 characters)',
      );
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, aId, m, true);
      const routeScope = `${aId}:${scope}`;
      const requestHash = hash(body);
      let row = await m.findOne(E.AssessmentIdempotency, {
        where: {
          schoolId: a.schoolId,
          actorId: actor,
          routeScope,
          idempotencyKey: key,
        },
      });
      if (row) {
        if (row.requestHash !== requestHash)
          assessmentError(
            'ASSESSMENT_IDEMPOTENCY_CONFLICT',
            'Idempotency key was used for another request',
            409,
          );
        if (row.state === 'completed') return row.responseBody as T;
      } else
        row = m.create(E.AssessmentIdempotency, {
          schoolId: a.schoolId,
          actorId: actor,
          routeScope,
          idempotencyKey: key,
          requestHash,
          state: 'running',
          leaseUntil: new Date(Date.now() + 60000),
          expiresAt: new Date(Date.now() + 7 * 86400000),
          responseBody: {},
        });
      const result = await fn(m, a);
      row.state = 'completed';
      row.responseStatus = 200;
      row.responseBody = result;
      await m.save(E.AssessmentIdempotency, row);
      return result;
    });
  }
  async context(actor: number) {
    if (!this.enabled())
      return {
        enabled: false,
        capabilities: {
          canCreate: false,
          canProcess: false,
          canReview: false,
          canFinalize: false,
        },
        classes: [],
      };
    const schoolId = await this.schools.resolveSchoolIdForUser(actor);
    const classes = await this.db.manager.find(SchoolClass, {
      where: { schoolId, active: true },
    });
    const subjects = await this.db.manager.find(Subject, {
      where: { schoolId },
    });
    const visible = [];
    for (const cls of classes) {
      const allowed = [];
      for (const subject of subjects) {
        try {
          await this.access.assertAccess(actor, cls.id, subject.id);
          allowed.push({ id: subject.id, name: subject.name });
        } catch (e) {
          if (!(e instanceof HttpException) || e.getStatus() !== 404) throw e;
        }
      }
      if (allowed.length)
        visible.push({
          id: cls.id,
          name: cls.name,
          academicYearId: cls.academicYearId,
          subjects: allowed,
        });
    }
    return {
      enabled: true,
      capabilities: {
        canCreate: true,
        canProcess: true,
        canReview: true,
        canFinalize: true,
      },
      classes: visible,
    };
  }
  async roster(actor: number, classId: string, subjectId: string) {
    this.ready();
    const { schoolId } = await this.access.assertAccess(
      actor,
      classId,
      subjectId,
    );
    const members = await this.db.manager.find(ClassMembership, {
      where: { schoolId, classId, leftAt: IsNull() },
      relations: ['student'],
    });
    return {
      items: members.map((x) => ({
        id: x.studentId,
        displayName: x.student.name,
        studentCode: null,
      })),
    };
  }
  async create(actor: number, d: D.AssessmentCreateDto, key?: string) {
    this.ready();
    if (!key || key.length > 200)
      assessmentError(
        'ASSESSMENT_INVALID_INPUT',
        'Idempotency-Key is required',
      );
    return this.db.transaction(async (m) => {
      const { cls, schoolId } = await this.access.assertAccess(
        actor,
        d.classId,
        d.subjectId,
        m,
      );
      const requestHash = hash(d);
      const routeScope = 'assessments:create';
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${schoolId}:${actor}:${routeScope}:${key}`,
      ]);
      const existing = await m.findOne(E.AssessmentIdempotency, {
        where: { schoolId, actorId: actor, routeScope, idempotencyKey: key },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          assessmentError(
            'ASSESSMENT_IDEMPOTENCY_CONFLICT',
            'Idempotency key conflict',
            409,
          );
        return existing.responseBody;
      }
      const a = await m.save(
        E.Assessment,
        m.create(E.Assessment, {
          ...d,
          schoolId,
          academicYearId: cls.academicYearId,
          ownerId: actor,
          contextRevision: 1,
          archivedAt: null,
        }),
      );
      const members = await m.find(ClassMembership, {
        where: { schoolId, classId: cls.id, leftAt: IsNull() },
        relations: ['student'],
      });
      for (const member of members)
        await m.save(
          E.AssessmentRoster,
          m.create(E.AssessmentRoster, {
            schoolId,
            assessmentId: a.id,
            studentId: member.studentId,
            displayNameSnapshot: member.student.name,
            studentCodeSnapshot: null,
            membershipId: member.id,
            addedBy: actor,
            addedAt: new Date(),
          }),
        );
      await m.save(
        E.AssessmentIdempotency,
        m.create(E.AssessmentIdempotency, {
          schoolId,
          actorId: actor,
          routeScope,
          idempotencyKey: key,
          requestHash,
          state: 'completed',
          responseStatus: 201,
          responseBody: a,
          leaseUntil: new Date(),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        }),
      );
      return a;
    });
  }
  async list(actor: number, q: any) {
    this.ready();
    const schoolId = await this.schools.resolveSchoolIdForUser(actor);
    const rows = await this.db.manager.find(E.Assessment, {
      where: {
        schoolId,
        ...(q.classId ? { classId: q.classId } : {}),
        ...(q.subjectId ? { subjectId: q.subjectId } : {}),
      },
      order: { createdAt: 'DESC' },
    });
    const allowed = [];
    for (const a of rows) {
      try {
        await this.access.assertAccess(actor, a.classId, a.subjectId);
        allowed.push(a);
      } catch (e) {
        if (!(e instanceof HttpException) || e.getStatus() !== 404) throw e;
      }
    }
    return this.paginate(allowed, q);
  }
  private paginate(items: any[], q: any) {
    const page = Math.max(1, Number(q.page) || 1),
      limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
    return {
      items: items.slice((page - 1) * limit, page * limit),
      total: items.length,
      page,
      limit,
    };
  }
  async detail(actor: number, id: string) {
    const a = await this.getAssessment(actor, id);
    const examVersions = await this.db.manager.find(E.AssessmentExamVersion, {
      where: { schoolId: a.schoolId, assessmentId: a.id },
      order: { examCode: 'ASC', versionNumber: 'DESC' },
    });
    return {
      ...a,
      examVersions,
      capabilities: {
        canProcess: !a.archivedAt,
        canReview: !a.archivedAt,
        canFinalize: !a.archivedAt,
      },
    };
  }
  async patch(actor: number, id: string, d: D.AssessmentPatchDto) {
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      assertRevision(a.contextRevision, d.expectedContextRevision);
      const published = await m.count(E.AssessmentPublication, {
        where: { schoolId: a.schoolId, assessmentId: id },
      });
      const changes = Object.fromEntries(
        Object.entries(d).filter(
          ([k, v]) => k !== 'expectedContextRevision' && v !== undefined,
        ),
      );
      if (published && Object.keys(changes).some((k) => k !== 'title'))
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Published assessment context is frozen',
          409,
        );
      Object.assign(a, changes);
      a.contextRevision++;
      a.revision++;
      return m.save(E.Assessment, a);
    });
  }
  async addRoster(actor: number, id: string, d: D.RosterDto) {
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      assertRevision(a.contextRevision, d.expectedContextRevision);
      for (const studentId of new Set(d.studentIds)) {
        const existing = await m.findOne(E.AssessmentRoster, {
          where: { schoolId: a.schoolId, assessmentId: id, studentId },
        });
        if (existing) continue;
        const member = await m.findOne(ClassMembership, {
          where: {
            schoolId: a.schoolId,
            classId: a.classId,
            studentId,
            leftAt: IsNull(),
          },
          relations: ['student'],
        });
        if (!member) this.notFound();
        await m.save(
          E.AssessmentRoster,
          m.create(E.AssessmentRoster, {
            schoolId: a.schoolId,
            assessmentId: id,
            studentId,
            displayNameSnapshot: member.student.name,
            membershipId: member.id,
            addedBy: actor,
            addedAt: new Date(),
          }),
        );
      }
      a.contextRevision++;
      await m.save(E.Assessment, a);
      await this.event(
        m,
        a,
        actor,
        'roster_extended',
        null,
        {},
        { studentIds: d.studentIds },
      );
      return a;
    });
  }
  async createSubmission(actor: number, id: string, d: D.SubmissionCreateDto) {
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      const old = await m.findOne(E.AssessmentSubmission, {
        where: {
          schoolId: a.schoolId,
          assessmentId: id,
          clientGroupId: d.clientGroupId,
        },
      });
      if (old) {
        if (d.studentId !== undefined && old.studentId !== d.studentId)
          assessmentError(
            'ASSESSMENT_IDEMPOTENCY_CONFLICT',
            'Client group was created with another student',
            409,
          );
        return old;
      }
      if (d.studentId) await this.assertRoster(m, a, d.studentId);
      const s = m.create(E.AssessmentSubmission, {
        schoolId: a.schoolId,
        assessmentId: id,
        clientGroupId: d.clientGroupId,
        studentId: d.studentId ?? null,
        identityState: d.studentId ? 'confirmed' : 'unresolved',
        identityRevision: 1,
        inputRevision: 1,
        processingState: 'idle',
        currentPageIds: [],
        currentAnswerRevisionIds: {},
        examVersionId: null,
        currentReviewRevisionId: null,
        deletedAt: null,
      });
      return m.save(E.AssessmentSubmission, s);
    });
  }
  private async assertRoster(
    m: EntityManager,
    a: E.Assessment,
    studentId: number,
  ) {
    if (
      !(await m.findOne(E.AssessmentRoster, {
        where: { schoolId: a.schoolId, assessmentId: a.id, studentId },
      }))
    )
      this.notFound();
  }
  private async summary(
    a: E.Assessment,
    s: E.AssessmentSubmission,
    m = this.db.manager,
  ) {
    const currentReview = s.currentReviewRevisionId
      ? await m.findOne(E.AssessmentReviewRevision, {
          where: {
            id: s.currentReviewRevisionId,
            schoolId: a.schoolId,
            submissionId: s.id,
          },
        })
      : null;
    const publication = await m.findOne(E.AssessmentPublication, {
      where: { schoolId: a.schoolId, assessmentId: a.id, submissionId: s.id },
    });
    const roster = s.studentId
      ? await m.findOne(E.AssessmentRoster, {
          where: {
            schoolId: a.schoolId,
            assessmentId: a.id,
            studentId: s.studentId,
          },
        })
      : null;
    return {
      ...s,
      displayName: roster?.displayNameSnapshot ?? null,
      currentReview,
      publication,
    };
  }
  async submissions(actor: number, id: string, q: any) {
    const a = await this.getAssessment(actor, id);
    const submissions = await this.db.manager.find(E.AssessmentSubmission, {
      where: { schoolId: a.schoolId, assessmentId: id, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    let rows = await Promise.all(submissions.map((s) => this.summary(a, s)));
    if (q.processingState)
      rows = rows.filter((s) => s.processingState === q.processingState);
    if (q.publicationState)
      rows = rows.filter(
        (s) => (s.publication?.state ?? 'unpublished') === q.publicationState,
      );
    if (q.needsAttention === 'true')
      rows = rows.filter(
        (s) =>
          s.identityState !== 'confirmed' ||
          s.currentReview?.flags?.some(
            (f: any) =>
              f.severity === 'blocking' && f.resolutionState !== 'resolved',
          ),
      );
    return this.paginate(rows, q);
  }
  async submissionDetail(actor: number, id: string, sId: string) {
    const a = await this.getAssessment(actor, id);
    const s = await this.submission(a, sId);
    const summary = await this.summary(a, s);
    const pages = s.currentPageIds.length
      ? await this.db.manager.find(E.AssessmentPage, {
          where: {
            schoolId: a.schoolId,
            assessmentId: id,
            id: In(s.currentPageIds),
          },
        })
      : [];
    const answerIds = Object.values(s.currentAnswerRevisionIds);
    const answers = answerIds.length
      ? await this.db.manager.find(E.AssessmentAnswerRevision, {
          where: {
            schoolId: a.schoolId,
            submissionId: s.id,
            id: In(answerIds),
          },
        })
      : [];
    const publishedReview = summary.publication
      ? await this.db.manager.findOne(E.AssessmentReviewRevision, {
          where: {
            schoolId: a.schoolId,
            id: summary.publication.reviewRevisionId,
            submissionId: s.id,
          },
        })
      : null;
    return {
      ...summary,
      pages: pages.map(({ analysisObjectKey, ...page }) => page),
      answers,
      publishedReview,
    };
  }
  async identity(actor: number, id: string, sId: string, d: D.IdentityDto) {
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      const s = await this.submission(a, sId, m, true);
      assertRevision(s.identityRevision, d.expectedIdentityRevision);
      await this.assertRoster(m, a, d.studentId);
      const duplicate = await m.findOne(E.AssessmentSubmission, {
        where: {
          schoolId: a.schoolId,
          assessmentId: id,
          studentId: d.studentId,
          deletedAt: IsNull(),
        },
      });
      if (duplicate && duplicate.id !== s.id)
        assessmentError(
          'ASSESSMENT_IDENTITY_CONFLICT',
          'Student already has a submission',
          409,
        );
      if (
        (await m.count(E.AssessmentPublication, {
          where: { schoolId: a.schoolId, submissionId: s.id },
        })) &&
        s.studentId !== d.studentId
      )
        assessmentError(
          'ASSESSMENT_IDENTITY_CONFLICT',
          'Published identity cannot be reassigned',
          409,
        );
      const before = {
        studentId: s.studentId,
        identityRevision: s.identityRevision,
      };
      s.studentId = d.studentId;
      s.identityState = 'confirmed';
      s.identityRevision++;
      await m.save(E.AssessmentSubmission, s);
      await this.event(m, a, actor, 'identity_confirmed', s.id, before, {
        studentId: s.studentId,
        identityRevision: s.identityRevision,
      });
      return s;
    });
  }
  async upload(actor: number, id: string, d: D.UploadDto) {
    const a = await this.getAssessment(actor, id);
    this.mutable(a);
    if (!this.storage)
      assessmentError(
        'ASSESSMENT_NOT_READY',
        'Assessment storage is not configured',
        503,
      );
    if (d.purpose === 'student_work' && !d.submissionId)
      assessmentError(
        'ASSESSMENT_INVALID_INPUT',
        'Student work requires a submission',
      );
    if (d.submissionId) await this.submission(a, d.submissionId);
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(d.mime))
      assessmentError(
        'ASSESSMENT_UNSUPPORTED_FILE',
        'Only JPEG, PNG and PDF uploads are supported',
        415,
      );
    const asset = this.db.manager.create(E.AssessmentAsset, {
      id: randomUUID(),
      schoolId: a.schoolId,
      assessmentId: id,
      submissionId: d.submissionId ?? null,
      purpose: d.purpose,
      originalName: d.name,
      declaredMime: d.mime,
      byteSize: d.byteSize,
      sha256: d.sha256 ?? null,
      state: 'uploading',
      uploadExpiresAt: new Date(Date.now() + 900000),
    });
    asset.stagingKey = `assessment/${a.schoolId}/${id}/staging/${asset.id}`;
    const upload = await this.storage.createUpload(asset);
    await this.db.transaction(async (m) => {
      const current = await this.getAssessment(actor, id, m, true);
      this.mutable(current);
      if (d.submissionId) {
        const submission = await this.submission(
          current,
          d.submissionId,
          m,
          true,
        );
        submission.inputRevision++;
        submission.currentReviewRevisionId = null;
        submission.processingState = 'idle';
        await m.save(E.AssessmentSubmission, submission);
      }
      await m.save(E.AssessmentAsset, asset);
    });
    return {
      assetId: asset.id,
      upload: {
        method: 'POST',
        url: upload.url,
        fields: upload.fields,
        requiredHeaders: {},
      },
      expiresAt: upload.expiresAt,
    };
  }
  async complete(actor: number, id: string, assetId: string, key?: string) {
    return this.command(
      actor,
      id,
      key,
      `assets:${assetId}:complete`,
      {},
      async (m, a) => {
        this.mutable(a);
        const asset = await m.findOne(E.AssessmentAsset, {
          where: { id: assetId, schoolId: a.schoolId, assessmentId: id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!asset) this.notFound();
        if (!['uploading', 'verifying', 'sealed'].includes(asset.state))
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'Upload is not available',
          );
        if (
          asset.state === 'uploading' &&
          asset.uploadExpiresAt.getTime() < Date.now()
        )
          assessmentError('ASSESSMENT_INVALID_INPUT', 'Upload has expired');
        if (asset.state !== 'sealed') {
          asset.state = 'verifying';
          await m.save(E.AssessmentAsset, asset);
        }
        const job = await this.job(
          m,
          a,
          'seal',
          asset.id,
          { assetId },
          asset.submissionId,
        );
        return { assetId, jobId: job.id, state: 'verifying' };
      },
    );
  }
  async assetAccess(actor: number, id: string, assetId: string) {
    const a = await this.getAssessment(actor, id);
    const asset = await this.db.manager.findOne(E.AssessmentAsset, {
      where: {
        id: assetId,
        schoolId: a.schoolId,
        assessmentId: id,
        state: 'sealed',
      },
    });
    if (!asset?.sealedKey) this.notFound();
    if (!this.storage)
      assessmentError('ASSESSMENT_NOT_READY', 'Storage unavailable', 503);
    return this.storage.access({
      sealedKey: asset.sealedKey,
      verifiedMime: asset.verifiedMime,
    });
  }
  async process(actor: number, id: string, d: D.ProcessDto, key?: string) {
    return this.command(actor, id, key, 'process', d, async (m, a) => {
      this.mutable(a);
      const rows = await m.find(E.AssessmentSubmission, {
        where: {
          schoolId: a.schoolId,
          assessmentId: id,
          deletedAt: IsNull(),
          ...(d.submissionIds ? { id: In(d.submissionIds) } : {}),
        },
        order: { id: 'ASC' },
      });
      if (d.submissionIds && rows.length !== new Set(d.submissionIds).size)
        this.notFound();
      const jobIds = [];
      for (const s of rows) {
        assertRevision(s.inputRevision, d.expectedInputRevisions[s.id]);
        const assets = await m.find(E.AssessmentAsset, {
          where: {
            schoolId: a.schoolId,
            assessmentId: id,
            submissionId: s.id,
            purpose: 'student_work',
          },
        });
        if (
          !assets.some((x) => x.state === 'sealed') ||
          assets.some((x) => ['uploading', 'verifying'].includes(x.state))
        )
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'Wait for uploaded work to be verified before processing',
            409,
          );
        const j = await this.job(
          m,
          a,
          'extract',
          s.id,
          { inputRevision: s.inputRevision, examVersionId: s.examVersionId },
          s.id,
        );
        s.processingState = 'queued';
        await m.save(E.AssessmentSubmission, s);
        jobIds.push(j.id);
      }
      return { jobIds };
    });
  }
  async progress(actor: number, id: string) {
    const a = await this.getAssessment(actor, id);
    const jobs = await this.db.manager.find(E.AssessmentJob, {
      where: { schoolId: a.schoolId, assessmentId: id },
      order: { createdAt: 'DESC' },
      take: 1000,
    });
    const counts: Record<string, number> = {};
    for (const j of jobs) {
      const k = `${j.stage}:${j.state}`;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return {
      counts,
      jobs: jobs.map((j) => ({
        id: j.id,
        stage: j.stage,
        state: j.state,
        submissionId: j.submissionId,
        attemptCount: j.attemptCount,
        lastErrorCode: j.lastErrorCode,
      })),
      warnings: [],
    };
  }
  async createVersion(actor: number, id: string, d: D.ExamVersionDto) {
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      assertExamDocument(d.document, a.maxScoreUnits, false);
      if (d.document.examCode !== d.examCode)
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Exam code does not match document',
        );
      const last = await m.findOne(E.AssessmentExamVersion, {
        where: { schoolId: a.schoolId, assessmentId: id, examCode: d.examCode },
        order: { versionNumber: 'DESC' },
      });
      return m.save(
        E.AssessmentExamVersion,
        m.create(E.AssessmentExamVersion, {
          schoolId: a.schoolId,
          assessmentId: id,
          examCode: d.examCode,
          versionNumber: (last?.versionNumber ?? 0) + 1,
          state: 'draft',
          document: d.document,
          questionContentHash: hash(
            d.document.questions.map((q: any) => ({
              questionKey: q.questionKey,
              text: q.text,
              kind: q.kind,
            })),
          ),
          gradingSpecHash: hash(d.document),
          sourceRegionIds: [],
          draftSource: 'teacher',
        }),
      );
    });
  }
  async version(actor: number, id: string, vId: string) {
    const a = await this.getAssessment(actor, id);
    const v = await this.db.manager.findOne(E.AssessmentExamVersion, {
      where: { id: vId, schoolId: a.schoolId, assessmentId: id },
    });
    if (!v) this.notFound();
    return v;
  }
  async impact(actor: number, id: string, vId: string) {
    const v = await this.version(actor, id, vId);
    const versions = await this.db.manager.find(E.AssessmentExamVersion, {
      where: { schoolId: v.schoolId, assessmentId: id, examCode: v.examCode },
    });
    const count = await this.db.manager.count(E.AssessmentSubmission, {
      where: {
        schoolId: v.schoolId,
        assessmentId: id,
        examVersionId: In(versions.map((x) => x.id)),
        deletedAt: IsNull(),
      },
    });
    return {
      submissionCount: count,
      questionCount: v.document.questions.length,
    };
  }
  async approveVersion(
    actor: number,
    id: string,
    vId: string,
    d: D.ApproveVersionDto,
    key?: string,
  ) {
    return this.command(
      actor,
      id,
      key,
      `versions:${vId}:approve`,
      d,
      async (m, a) => {
        this.mutable(a);
        const v = await m.findOne(E.AssessmentExamVersion, {
          where: { id: vId, schoolId: a.schoolId, assessmentId: id },
        });
        if (!v) this.notFound();
        assertRevision(v.gradingSpecHash, d.expectedVersionHash);
        assertExamDocument(v.document, a.maxScoreUnits);
        if (!d.submissionIds && d.applyTo !== 'unpublished')
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'Choose unpublished or explicit submissions',
          );
        const rows = await m.find(E.AssessmentSubmission, {
          where: {
            schoolId: a.schoolId,
            assessmentId: id,
            deletedAt: IsNull(),
            ...(d.submissionIds ? { id: In(d.submissionIds) } : {}),
          },
          order: { id: 'ASC' },
        });
        if (d.submissionIds && rows.length !== new Set(d.submissionIds).size)
          this.notFound();
        const jobIds = [];
        for (const s of rows) {
          const pub = await m.findOne(E.AssessmentPublication, {
            where: { schoolId: a.schoolId, submissionId: s.id },
          });
          if (d.applyTo === 'unpublished' && pub) continue;
          if (s.examVersionId) {
            const old = await m.findOne(E.AssessmentExamVersion, {
              where: {
                id: s.examVersionId,
                schoolId: a.schoolId,
                assessmentId: id,
              },
            });
            if (d.applyTo === 'unpublished' && old?.examCode !== v.examCode)
              continue;
          } else if (d.applyTo === 'unpublished') continue;
          if (s.examVersionId === v.id && v.state === 'approved') continue;
          s.examVersionId = v.id;
          s.inputRevision++;
          s.currentReviewRevisionId = null;
          s.processingState = 'queued';
          await m.save(E.AssessmentSubmission, s);
          const j = await this.job(
            m,
            a,
            'extract',
            s.id,
            { inputRevision: s.inputRevision, examVersionId: v.id },
            s.id,
          );
          jobIds.push(j.id);
        }
        v.state = 'approved';
        v.approvedBy = actor;
        v.approvedAt = new Date();
        await m.save(E.AssessmentExamVersion, v);
        await this.event(
          m,
          a,
          actor,
          'key_approved',
          null,
          {},
          { examVersionId: v.id, gradingSpecHash: v.gradingSpecHash },
        );
        return { version: v, jobIds };
      },
    );
  }
  async answer(
    actor: number,
    id: string,
    sId: string,
    questionKey: string,
    d: D.AnswerDto,
  ) {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(questionKey))
      assessmentError('ASSESSMENT_INVALID_INPUT', 'Invalid question key');
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      const s = await this.submission(a, sId, m, true);
      assertRevision(s.inputRevision, d.expectedInputRevision);
      assertRevision(
        s.currentAnswerRevisionIds[questionKey],
        d.expectedAnswerRevisionId,
      );
      const old = await m.findOne(E.AssessmentAnswerRevision, {
        where: {
          id: d.expectedAnswerRevisionId,
          schoolId: a.schoolId,
          submissionId: sId,
          questionKey,
        },
      });
      if (!old || old.examVersionId !== s.examVersionId) this.notFound();
      const v = await m.findOne(E.AssessmentExamVersion, {
        where: { id: s.examVersionId, schoolId: a.schoolId, assessmentId: id },
      });
      const q = v?.document.questions.find(
        (x: any) => x.questionKey === questionKey,
      );
      if (!q) this.notFound();
      const content = { ...d.content };
      if (
        q.kind === 'single_choice' &&
        content.selectedOptionId !== null &&
        !q.options.some((x: any) => x.id === content.selectedOptionId)
      )
        assessmentError('ASSESSMENT_INVALID_INPUT', 'Unknown selected option');
      const observationState =
        content.confirmedBlank === true ? 'confirmed_blank' : 'readable';
      delete content.confirmedBlank;
      if (observationState === 'confirmed_blank' && !d.reason.trim())
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Blank confirmation requires a reason',
        );
      const answer = await m.save(
        E.AssessmentAnswerRevision,
        m.create(E.AssessmentAnswerRevision, {
          schoolId: a.schoolId,
          assessmentId: id,
          submissionId: sId,
          examVersionId: s.examVersionId,
          questionKey,
          revisionNumber: old.revisionNumber + 1,
          observationState,
          content,
          sourceRegionIds: old.sourceRegionIds,
          origin: 'teacher',
          supersedesId: old.id,
          reason: d.reason,
          contentHash: hash({
            content,
            observationState,
            sourceRegionIds: old.sourceRegionIds,
          }),
        }),
      );
      s.currentAnswerRevisionIds = {
        ...s.currentAnswerRevisionIds,
        [questionKey]: answer.id,
      };
      s.inputRevision++;
      s.currentReviewRevisionId = null;
      s.processingState = 'queued';
      await m.save(E.AssessmentSubmission, s);
      await this.event(
        m,
        a,
        actor,
        'answer_corrected',
        s.id,
        { answerRevisionId: old.id },
        { answerRevisionId: answer.id },
        d.reason,
      );
      const job = await this.job(
        m,
        a,
        'grade',
        s.id,
        {
          inputRevision: s.inputRevision,
          examVersionId: s.examVersionId,
          answerRevisionIds: s.currentAnswerRevisionIds,
        },
        s.id,
      );
      return { answer, jobId: job.id, inputRevision: s.inputRevision };
    });
  }
  async pageAccess(
    actor: number,
    id: string,
    pageId: string,
    original = false,
  ) {
    const a = await this.getAssessment(actor, id);
    const page = await this.db.manager.findOne(E.AssessmentPage, {
      where: { id: pageId, schoolId: a.schoolId, assessmentId: id },
    });
    if (!page) this.notFound();
    if (!this.storage)
      assessmentError('ASSESSMENT_NOT_READY', 'Storage unavailable', 503);
    const key =
      original && typeof page.quality?.originalAnalysisKey === 'string'
        ? page.quality.originalAnalysisKey
        : page.analysisObjectKey;
    if (!key.startsWith(`assessment/${a.schoolId}/${a.id}/`)) this.notFound();
    return this.storage.access({ sealedKey: key, verifiedMime: 'image/jpeg' });
  }
  async selection(
    actor: number,
    id: string,
    pageId: string,
    d: D.PageSelectionDto,
  ) {
    if (
      d.primaryPolygon.length < 3 ||
      d.primaryPolygon.length > 8 ||
      d.primaryPolygon.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 2 ||
          p.some((n) => !Number.isFinite(n) || n < 0 || n > 1),
      )
    )
      assessmentError('ASSESSMENT_INVALID_INPUT', 'Invalid polygon');
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      const p = await m.findOne(E.AssessmentPage, {
        where: { id: pageId, schoolId: a.schoolId, assessmentId: id },
      });
      if (!p?.submissionId) this.notFound();
      const s = await this.submission(a, p.submissionId, m, true);
      assertRevision(s.inputRevision, d.expectedInputRevision);
      if (!s.currentPageIds.includes(p.id))
        assessmentError(
          'ASSESSMENT_STALE_REVISION',
          'Page is no longer current',
          409,
        );
      if (d.primaryPolygon.some(([x, y]) => x > 1 || y > 1))
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Polygon extends outside the page',
        );
      const latest = await m.findOne(E.AssessmentPage, {
        where: {
          schoolId: a.schoolId,
          assetId: p.assetId,
          sourcePageNumber: p.sourcePageNumber,
        },
        order: { analysisRevision: 'DESC' },
      });
      const next = m.create(E.AssessmentPage, {
        ...p,
        id: randomUUID(),
        analysisRevision: (latest?.analysisRevision ?? p.analysisRevision) + 1,
        primaryPolygon: d.primaryPolygon,
        quality: {
          ...p.quality,
          reader: null,
          routingHash: null,
          manualPrimaryPolygon: true,
        },
      });
      await m.save(E.AssessmentPage, next);
      s.currentPageIds = s.currentPageIds.map((x: string) =>
        x === p.id ? next.id : x,
      );
      s.inputRevision++;
      s.currentReviewRevisionId = null;
      s.processingState = 'queued';
      await m.save(E.AssessmentSubmission, s);
      await this.event(
        m,
        a,
        actor,
        'primary_page_changed',
        s.id,
        { pageId: p.id },
        { pageId: next.id },
      );
      const job = await this.job(
        m,
        a,
        'extract',
        s.id,
        { inputRevision: s.inputRevision, examVersionId: s.examVersionId },
        s.id,
      );
      return { pageId: next.id, inputRevision: s.inputRevision, jobId: job.id };
    });
  }
  async review(actor: number, id: string, sId: string, d: D.ReviewDto) {
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      const s = await this.submission(a, sId, m, true);
      assertRevision(s.currentReviewRevisionId, d.expectedReviewRevisionId);
      const old = await m.findOne(E.AssessmentReviewRevision, {
        where: {
          id: d.expectedReviewRevisionId,
          schoolId: a.schoolId,
          submissionId: sId,
        },
      });
      if (!old) this.notFound();
      assertRevision(old.inputManifest.inputRevision, s.inputRevision);
      assertRevision(old.examVersionId, s.examVersionId);
      const v = await m.findOne(E.AssessmentExamVersion, {
        where: {
          id: s.examVersionId!,
          schoolId: a.schoolId,
          assessmentId: id,
          state: 'approved',
        },
      });
      if (!v) this.notFound();
      const results = structuredClone(old.effectiveResults),
        flags = structuredClone(old.flags);
      const seen = new Set<string>();
      for (const o of d.overrides ?? []) {
        if (
          !o ||
          typeof o.reason !== 'string' ||
          !o.reason.trim() ||
          seen.has(o.questionKey)
        )
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'Every override needs a unique question and reason',
          );
        seen.add(o.questionKey);
        const result = results.find(
          (r: any) => r.questionKey === o.questionKey,
        );
        const q = v.document.questions.find(
          (r: any) => r.questionKey === o.questionKey,
        );
        if (!q || !result) this.notFound();
        normalizeScore(o.earnedUnits, q.maxUnits);
        if (!result.sourceRegionIds?.length)
          assessmentError(
            'ASSESSMENT_FINALIZATION_BLOCKED',
            'Scoring requires evidence',
            409,
          );
        result.earnedUnits = o.earnedUnits;
        result.source = 'teacher';
        result.reason = o.reason;
        result.criteria = [];
      }
      for (const resolution of d.flagResolutions ?? []) {
        if (
          !['confirm_drawing', 'confirm_score'].includes(resolution.action) ||
          typeof resolution.reason !== 'string' ||
          !resolution.reason.trim()
        )
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'This flag must be resolved through its specific correction workflow',
          );
        const f = flags.find(
          (f: any) =>
            f.code === resolution.code &&
            f.questionKey === resolution.questionKey,
        );
        const r = results.find(
          (r: any) => r.questionKey === resolution.questionKey,
        );
        if (
          !(
            (resolution.action === 'confirm_drawing' &&
              f?.code === 'drawing_review_required') ||
            (resolution.action === 'confirm_score' &&
              [
                'grading_disagreement',
                'insufficient_evidence',
                'unreadable_evidence',
              ].includes(f?.code))
          ) ||
          r?.source !== 'teacher' ||
          !r.sourceRegionIds?.length
        )
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'Drawing confirmation requires an evidenced teacher score',
          );
        f.resolutionState = 'resolved';
        f.resolutionEventId = randomUUID();
      }
      const totals = summarizeResults(results, a.maxScoreUnits);
      const revision = m.create(E.AssessmentReviewRevision, {
        schoolId: a.schoolId,
        assessmentId: id,
        submissionId: sId,
        revisionNumber: old.revisionNumber + 1,
        examVersionId: old.examVersionId,
        inputManifest: old.inputManifest,
        effectiveResults: results,
        flags,
        ...totals,
        createdBy: actor,
        contentHash: hash({
          inputManifest: old.inputManifest,
          effectiveResults: results,
          flags,
          ...totals,
        }),
      });
      await m.save(E.AssessmentReviewRevision, revision);
      s.currentReviewRevisionId = revision.id;
      await m.save(E.AssessmentSubmission, s);
      await this.event(
        m,
        a,
        actor,
        'score_overridden',
        s.id,
        { reviewRevisionId: old.id },
        { reviewRevisionId: revision.id },
        (d.overrides ?? []).map((o: any) => o.reason).join('; ') || null,
      );
      return revision;
    });
  }
  async finalize(
    actor: number,
    id: string,
    d: D.FinalizationsDto,
    key?: string,
  ) {
    if (!key)
      assessmentError(
        'ASSESSMENT_INVALID_INPUT',
        'Idempotency-Key is required',
      );
    const items = [];
    for (const item of [...d.items].sort((a, b) =>
      a.submissionId.localeCompare(b.submissionId),
    )) {
      try {
        const result = await this.command(
          actor,
          id,
          `${key}:${item.submissionId}`,
          'finalize',
          item,
          async (m, a) => {
            this.mutable(a);
            assertRevision(a.contextRevision, item.expectedContextRevision);
            const s = await this.submission(a, item.submissionId, m, true);
            assertRevision(s.inputRevision, item.expectedInputRevision);
            assertRevision(
              s.currentReviewRevisionId,
              item.expectedReviewRevisionId,
            );
            if (
              !s.studentId ||
              !['confirmed', 'proposed'].includes(s.identityState)
            )
              assessmentError(
                'ASSESSMENT_FINALIZATION_BLOCKED',
                'Confirm the submission identity',
                409,
              );
            assertRevision(s.studentId, item.identityAcknowledgement.studentId);
            assertRevision(
              s.identityRevision,
              item.identityAcknowledgement.expectedIdentityRevision,
            );
            await this.assertRoster(m, a, s.studentId);
            const review = await m.findOne(E.AssessmentReviewRevision, {
              where: {
                id: item.expectedReviewRevisionId,
                schoolId: a.schoolId,
                submissionId: s.id,
                assessmentId: id,
              },
            });
            if (!review) this.notFound();
            assertRevision(review.contentHash, item.expectedReviewHash);
            assertReviewPublishable(review, s, a.maxScoreUnits);
            if (
              hash(review.inputManifest.answerRevisionIds ?? {}) !==
              hash(s.currentAnswerRevisionIds)
            )
              assessmentError(
                'ASSESSMENT_STALE_REVISION',
                'Answer manifest changed',
                409,
              );
            const version = await m.findOne(E.AssessmentExamVersion, {
              where: {
                id: review.examVersionId,
                schoolId: a.schoolId,
                assessmentId: id,
              },
            });
            if (!version || !['approved', 'superseded'].includes(version.state))
              assessmentError(
                'ASSESSMENT_FINALIZATION_BLOCKED',
                'Answer key is not approved',
                409,
              );
            const summary = summarizeResults(
              review.effectiveResults,
              a.maxScoreUnits,
            );
            if (
              summary.earnedUnits !== review.earnedUnits ||
              summary.ungradedMaxUnits !== 0
            )
              assessmentError(
                'ASSESSMENT_FINALIZATION_BLOCKED',
                'Review totals are inconsistent',
                409,
              );
            const questionKeys = new Set(
              version.document.questions.map((q: any) => q.questionKey),
            );
            if (
              review.effectiveResults.length !== questionKeys.size ||
              new Set(review.effectiveResults.map((r: any) => r.questionKey))
                .size !== questionKeys.size ||
              review.effectiveResults.some(
                (r: any) =>
                  !questionKeys.has(r.questionKey) ||
                  version.document.questions.find(
                    (q: any) => q.questionKey === r.questionKey,
                  ).maxUnits !== r.maxUnits,
              )
            )
              assessmentError(
                'ASSESSMENT_FINALIZATION_BLOCKED',
                'Review does not match approved questions',
                409,
              );
            const identityPublication = await m.findOne(
              E.AssessmentPublication,
              {
                where: {
                  schoolId: a.schoolId,
                  assessmentId: id,
                  studentId: s.studentId,
                },
              },
            );
            if (
              identityPublication &&
              identityPublication.submissionId !== s.id
            )
              assessmentError(
                'ASSESSMENT_IDENTITY_CONFLICT',
                'Student already has a publication in this assessment',
                409,
              );
            let pub = await m.findOne(E.AssessmentPublication, {
              where: {
                schoolId: a.schoolId,
                submissionId: s.id,
                assessmentId: id,
              },
              lock: { mode: 'pessimistic_write' },
            });
            assertRevision(
              pub?.revision ?? null,
              item.expectedPublicationRevision ?? null,
            );
            const old = pub
              ? {
                  publicationId: pub.id,
                  revision: pub.revision,
                  reviewRevisionId: pub.reviewRevisionId,
                  state: pub.state,
                }
              : {};
            if (
              pub?.state === 'active' &&
              pub.reviewRevisionId === review.id &&
              pub.studentId === s.studentId
            ) {
              const grade = await m.findOne(GradeEntry, {
                where: {
                  schoolId: a.schoolId,
                  assessmentPublicationId: pub.id,
                },
              });
              if (!grade)
                assessmentError(
                  'ASSESSMENT_FINALIZATION_BLOCKED',
                  'Publication grade is missing',
                  409,
                );
              return {
                submissionId: s.id,
                outcome: 'already_finalized',
                publicationId: pub.id,
                gradeEntryId: grade.id,
                score: grade.score,
              };
            }
            const normalizedScoreTenths = normalizeScore(
              review.earnedUnits,
              a.maxScoreUnits,
            );
            const contextSnapshot = {
              schemaVersion: 1,
              examDate: a.examDate,
              term: a.term,
              testType: a.testType,
              coefficient: a.coefficient,
              classId: a.classId,
              subjectId: a.subjectId,
              yearId: a.academicYearId,
              contextRevision: a.contextRevision,
              gradingSpecHash: version.gradingSpecHash,
              inputHash: hash(review.inputManifest),
            };
            if (pub) {
              if (pub.studentId !== s.studentId)
                assessmentError(
                  'ASSESSMENT_IDENTITY_CONFLICT',
                  'Publication identity is immutable',
                  409,
                );
              pub.revision++;
              Object.assign(pub, {
                reviewRevisionId: review.id,
                contextSnapshot,
                normalizedScoreTenths,
                state: 'active',
                finalizedBy: actor,
                finalizedAt: new Date(),
                withdrawnBy: null,
                withdrawnAt: null,
                withdrawalReason: null,
              });
            } else
              pub = m.create(E.AssessmentPublication, {
                schoolId: a.schoolId,
                assessmentId: id,
                submissionId: s.id,
                studentId: s.studentId,
                reviewRevisionId: review.id,
                contextSnapshot,
                normalizedScoreTenths,
                state: 'active',
                revision: 1,
                finalizedBy: actor,
                finalizedAt: new Date(),
              });
            await m.save(E.AssessmentPublication, pub);
            let grade = await m.findOne(GradeEntry, {
              where: { schoolId: a.schoolId, assessmentPublicationId: pub.id },
              lock: { mode: 'pessimistic_write' },
            });
            if (!grade)
              grade = m.create(GradeEntry, {
                schoolId: a.schoolId,
                assessmentPublicationId: pub.id,
              });
            Object.assign(grade, {
              classId: a.classId,
              subjectId: a.subjectId,
              studentId: s.studentId,
              testType: a.testType as GradeTestType,
              coefficient: a.coefficient,
              score: normalizedScoreTenths / 10,
              date: a.examDate,
              term: a.term,
              quizSessionId: null,
              homeworkId: null,
            });
            await m.save(GradeEntry, grade);
            if (s.identityState === 'proposed') {
              s.identityState = 'confirmed';
              s.identityRevision++;
              await m.save(E.AssessmentSubmission, s);
              await this.event(
                m,
                a,
                actor,
                'identity_confirmed',
                s.id,
                {},
                {
                  studentId: s.studentId,
                  identityRevision: s.identityRevision,
                },
              );
            }
            await this.event(m, a, actor, 'finalized', s.id, old, {
              publicationId: pub.id,
              publicationRevision: pub.revision,
              reviewRevisionId: review.id,
              gradeEntryId: grade.id,
              normalizedScoreTenths,
            });
            return {
              submissionId: s.id,
              outcome: 'finalized',
              publicationId: pub.id,
              gradeEntryId: grade.id,
              score: normalizedScoreTenths / 10,
            };
          },
        );
        items.push(result);
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        const response = error.getResponse() as any;
        items.push({
          submissionId: item.submissionId,
          outcome:
            error.getStatus() === 404
              ? 'not_found'
              : response.error === 'ASSESSMENT_STALE_REVISION'
                ? 'conflict'
                : 'blocked',
          errorCode: response.error,
          message: response.message,
        });
      }
    }
    return { items };
  }
  async withdraw(
    actor: number,
    id: string,
    pubId: string,
    d: D.WithdrawDto,
    key?: string,
  ) {
    return this.command(
      actor,
      id,
      key,
      `withdraw:${pubId}`,
      d,
      async (m, a) => {
        const found = await m.findOne(E.AssessmentPublication, {
          where: { id: pubId, schoolId: a.schoolId, assessmentId: id },
        });
        if (!found) this.notFound();
        await this.submission(a, found.submissionId, m, true);
        const pub = await m.findOneOrFail(E.AssessmentPublication, {
          where: { id: pubId, schoolId: a.schoolId, assessmentId: id },
          lock: { mode: 'pessimistic_write' },
        });
        assertRevision(pub.revision, d.expectedPublicationRevision);
        pub.state = 'withdrawn';
        pub.revision++;
        pub.withdrawnBy = actor;
        pub.withdrawnAt = new Date();
        pub.withdrawalReason = d.reason;
        await m.delete(GradeEntry, {
          schoolId: a.schoolId,
          assessmentPublicationId: pub.id,
        });
        await m.save(E.AssessmentPublication, pub);
        await this.event(
          m,
          a,
          actor,
          'withdrawn',
          pub.submissionId,
          { publicationId: pub.id, revision: d.expectedPublicationRevision },
          { publicationId: pub.id, revision: pub.revision },
          d.reason,
        );
        return pub;
      },
    );
  }
  async retry(actor: number, id: string, jobId: string, key?: string) {
    return this.command(actor, id, key, `retry:${jobId}`, {}, async (m, a) => {
      this.mutable(a);
      const job = await m.findOne(E.AssessmentJob, {
        where: { id: jobId, schoolId: a.schoolId, assessmentId: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) this.notFound();
      if (
        !['failed', 'retry_wait', 'paused'].includes(job.state) ||
        ['budget_exceeded', 'invalid_input', 'policy_denied'].includes(
          job.lastErrorCode ?? '',
        )
      )
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'This job cannot be retried',
        );
      if (job.submissionId && job.data.inputRevision) {
        const submission = await this.submission(a, job.submissionId, m, true);
        assertRevision(submission.inputRevision, job.data.inputRevision);
      }
      job.attemptCount = 0;
      job.leaseOwner = null;
      await this.event(
        m,
        a,
        actor,
        'job_retried',
        job.submissionId,
        { jobId: job.id },
        { dispatchGeneration: job.dispatchGeneration + 1 },
      );
      job.state = 'pending';
      job.nextAttemptAt = new Date();
      job.leaseToken = null;
      job.leaseUntil = null;
      job.dispatchGeneration++;
      await m.save(E.AssessmentJob, job);
      return { jobId: job.id, state: job.state };
    });
  }
  async export(actor: number, id: string, d: D.ExportDto, key?: string) {
    return this.command(actor, id, key, 'exports', d, async (m, a) => {
      const pubs = await m.find(E.AssessmentPublication, {
        where: {
          schoolId: a.schoolId,
          assessmentId: id,
          state: 'active',
          ...(d.submissionIds ? { submissionId: In(d.submissionIds) } : {}),
        },
        order: { id: 'ASC' },
      });
      if (
        !pubs.length ||
        (d.submissionIds && pubs.length !== new Set(d.submissionIds).size)
      )
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Choose published submissions',
        );
      const roster = await m.find(E.AssessmentRoster, {
        where: { schoolId: a.schoolId, assessmentId: id },
      });
      const studentNames = new Map(
        roster.map((r) => [r.studentId, r.displayNameSnapshot]),
      );
      const snapshotManifest = {
        schemaVersion: 1,
        requestedAt: new Date().toISOString(),
        title: a.title,
        publications: pubs.map((p) => ({
          publicationId: p.id,
          revision: p.revision,
          studentId: p.studentId,
          studentName: studentNames.get(p.studentId) || String(p.studentId),
          reviewRevisionId: p.reviewRevisionId,
          normalizedScoreTenths: p.normalizedScoreTenths,
          contextSnapshot: p.contextSnapshot,
        })),
      };
      const exp = await m.save(
        E.AssessmentExport,
        m.create(E.AssessmentExport, {
          schoolId: a.schoolId,
          assessmentId: id,
          format: d.format,
          snapshotManifest,
          state: 'queued',
          createdBy: actor,
          expiresAt: new Date(Date.now() + 86400000),
        }),
      );
      const job = await this.job(m, a, 'export', exp.id, {
        exportId: exp.id,
        snapshotManifest,
      });
      return { exportId: exp.id, jobId: job.id };
    });
  }
  async exportDetail(actor: number, id: string, expId: string) {
    const a = await this.getAssessment(actor, id);
    const exp = await this.db.manager.findOne(E.AssessmentExport, {
      where: { id: expId, schoolId: a.schoolId, assessmentId: id },
    });
    if (!exp) this.notFound();
    const { outputObjectKey, ...view } = exp;
    return view;
  }
  async exportAccess(actor: number, id: string, expId: string) {
    const a = await this.getAssessment(actor, id);
    const exp = await this.db.manager.findOne(E.AssessmentExport, {
      where: {
        id: expId,
        schoolId: a.schoolId,
        assessmentId: id,
        state: 'completed',
      },
    });
    if (!exp?.outputObjectKey || exp.expiresAt.getTime() < Date.now())
      this.notFound();
    if (!this.storage)
      assessmentError('ASSESSMENT_NOT_READY', 'Storage unavailable', 503);
    return this.storage.access({
      sealedKey: exp.outputObjectKey,
      verifiedMime:
        exp.format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
  async archive(actor: number, id: string) {
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      a.archivedAt = new Date();
      a.revision++;
      await m.save(E.Assessment, a);
      await this.event(m, a, actor, 'archived');
      return a;
    });
  }
  async published(actor: number, pubId: string) {
    this.ready();
    const pub = await this.db.manager.findOne(E.AssessmentPublication, {
      where: { id: pubId, state: 'active' },
    });
    if (!pub) this.notFound();
    let allowed = pub.studentId === actor;
    if (!allowed)
      allowed = !!(await this.db.manager.findOne(ParentLink, {
        where: {
          schoolId: pub.schoolId,
          parentId: actor,
          studentId: pub.studentId,
          status: ParentLinkStatus.APPROVED,
        },
      }));
    if (!allowed) {
      try {
        await this.getAssessment(actor, pub.assessmentId);
        allowed = true;
      } catch (e) {
        if (!(e instanceof HttpException) || e.getStatus() !== 404) throw e;
      }
    }
    if (!allowed) this.notFound();
    const a = await this.db.manager.findOne(E.Assessment, {
      where: { id: pub.assessmentId, schoolId: pub.schoolId },
    });
    const review = await this.db.manager.findOne(E.AssessmentReviewRevision, {
      where: {
        id: pub.reviewRevisionId,
        schoolId: pub.schoolId,
        submissionId: pub.submissionId,
      },
    });
    if (!a || !review) this.notFound();
    const v = await this.db.manager.findOne(E.AssessmentExamVersion, {
      where: {
        id: review.examVersionId,
        schoolId: pub.schoolId,
        assessmentId: a.id,
      },
    });
    return {
      publicationId: pub.id,
      revision: pub.revision,
      title: a.title,
      studentId: pub.studentId,
      score: pub.normalizedScoreTenths / 10,
      finalizedAt: pub.finalizedAt,
      context: pub.contextSnapshot,
      questions: (v?.document.questions ?? []).map((q: any) => ({
        questionKey: q.questionKey,
        text: q.text,
        kind: q.kind,
        maxUnits: q.maxUnits,
        options: q.options,
        statements: q.statements,
        criteria: q.criteria?.map((c: any) => ({
          id: c.id,
          maxUnits: c.maxUnits,
          description: c.description,
          levels: c.levels,
        })),
      })),
      results: review.effectiveResults.map((r: any) => ({
        questionKey: r.questionKey,
        earnedUnits: r.earnedUnits,
        maxUnits: r.maxUnits,
        criteria: r.criteria?.map((c: any) => ({
          id: c.id,
          earnedUnits: c.earnedUnits,
          maxUnits: c.maxUnits,
        })),
      })),
      evidence: [],
    };
  }
}
