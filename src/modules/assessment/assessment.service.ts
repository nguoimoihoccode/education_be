import {
  externalTextPolicy,
  containsRosterIdentity,
  textPayload,
  textPayloadHash,
  TEXT_RELEASE_EVENT,
  TEXT_REVOKE_EVENT,
  MANUAL_ONLY_EVENT,
} from './runtime/external-text';
import type { Question } from './runtime/types';
import { DOCX_LIMIT, DOCX_MIME } from './runtime/storage';
import { examEvidence } from './runtime/exam-match';
import { compareAiToTeacher, type AgreementPair } from './domain/ai-agreement';
import { summarizeCost, type CostCall } from './domain/cost-report';
import { loadRouting } from './runtime/routing';
import { Inject, Injectable, Optional, HttpException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, Raw } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as E from './entities/assessment.entities';
import { SchoolClassSubjectAccessService } from '../school/school-class-subject-access.service';
import { SchoolService } from '../school/school.service';
import {
  isValidIsoDayRange,
  vnDayRangeWhere,
} from '../../common/utils/date-range.util';
import {
  School,
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

/** Raw provider-call row (snake_case, bigint as string) to the cost policy shape. */
function costCall(r: any): CostCall {
  const num = (v: unknown) =>
    v === null || v === undefined ? null : Number(v);
  return {
    ...(r.calls !== undefined ? { count: Number(r.calls) } : {}),
    state: r.state,
    purpose: r.purpose,
    provider: r.provider,
    modelRequested: r.model_requested,
    attemptNumber: Number(r.attempt_number),
    inputUsage: r.input_usage,
    outputUsage: r.output_usage,
    reservedCostMicros: num(r.reserved_cost_micros) ?? 0,
    actualCostMicros: num(r.actual_cost_micros),
  };
}

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
  /**
   * Pilot gate per school × class × subject (design §4). A missing row is
   * closed. Inside a transaction the row is read FOR SHARE, so a concurrent
   * pause waits for the business change instead of racing it.
   */
  private async pilotState(
    m: EntityManager,
    scope: { schoolId: string; classId: string; subjectId: string },
  ): Promise<E.PilotState> {
    const row = await m.findOne(E.AssessmentPilotScope, {
      where: {
        schoolId: scope.schoolId,
        classId: scope.classId,
        subjectId: scope.subjectId,
      },
      ...(m.queryRunner?.isTransactionActive
        ? { lock: { mode: 'pessimistic_read' as const } }
        : {}),
    });
    return row?.state ?? 'closed';
  }
  private async assertPilotActive(
    m: EntityManager,
    scope: { schoolId: string; classId: string; subjectId: string },
  ) {
    const state = await this.pilotState(m, scope);
    if (state === 'active') return;
    if (state === 'paused')
      assessmentError(
        'ASSESSMENT_PILOT_PAUSED',
        'Assessment processing is paused for this class and subject',
        409,
      );
    assessmentError(
      'ASSESSMENT_PILOT_CLOSED',
      'Assessment is not open for this class and subject',
      409,
    );
  }
  /** Paused keeps review open (no model call, no new job) but stops intake and finalization. */
  private pilotCapabilities(state: E.PilotState, archived = false) {
    const active = state === 'active' && !archived;
    return {
      canCreate: active,
      canProcess: active,
      canReview: state !== 'closed' && !archived,
      canFinalize: active,
    };
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
    if (
      ['extract', 'grade', 'template', 'aggregate'].includes(stage) &&
      data.kind !== 'official_docx'
    ) {
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
        old.attemptCount < 3 &&
        !(
          data.kind === 'official_docx' &&
          old.lastErrorCode?.startsWith('exam_import_')
        ) &&
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
        capabilities: this.pilotCapabilities('closed'),
        classes: [],
      };
    const schoolId = await this.schools.resolveSchoolIdForUser(actor);
    const classes = await this.db.manager.find(SchoolClass, {
      where: { schoolId, active: true },
    });
    const subjects = await this.db.manager.find(Subject, {
      where: { schoolId },
    });
    const scopes = await this.db.manager.find(E.AssessmentPilotScope, {
      where: { schoolId },
    });
    const stateOf = new Map(
      scopes.map((x) => [`${x.classId}:${x.subjectId}`, x.state]),
    );
    const visible = [];
    const seen = new Set<E.PilotState>();
    for (const cls of classes) {
      const allowed = [];
      for (const subject of subjects) {
        try {
          await this.access.assertAccess(actor, cls.id, subject.id);
          const pilotState = stateOf.get(`${cls.id}:${subject.id}`) ?? 'closed';
          seen.add(pilotState);
          allowed.push({
            id: subject.id,
            name: subject.name,
            pilotState,
            capabilities: this.pilotCapabilities(pilotState),
          });
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
    // Top level answers "can I do this anywhere?"; per subject is authoritative.
    const best: E.PilotState = seen.has('active')
      ? 'active'
      : seen.has('paused')
        ? 'paused'
        : 'closed';
    return {
      enabled: true,
      capabilities: this.pilotCapabilities(best),
      classes: visible,
    };
  }
  /** Operations view of every pilot scope, newest change first. Works with the global flag off. */
  async pilotScopes(schoolId?: string) {
    const [rows, allSchools, allClasses, allSubjects] = await Promise.all([
      this.db.manager.find(E.AssessmentPilotScope, {
        where: schoolId ? { schoolId } : {},
        order: { updatedAt: 'DESC' },
      }),
      this.db.manager.find(School, {
        where: schoolId ? { id: schoolId } : {},
        order: { name: 'ASC' },
      }),
      this.db.manager.find(SchoolClass, {
        where: schoolId ? { schoolId } : {},
        order: { name: 'ASC' },
      }),
      this.db.manager.find(Subject, {
        where: schoolId ? { schoolId } : {},
        order: { name: 'ASC' },
      }),
    ]);
    const schoolName = new Map(allSchools.map((x) => [x.id, x.name]));
    const className = new Map(allClasses.map((x) => [x.id, x.name]));
    const subjectName = new Map(allSubjects.map((x) => [x.id, x.name]));
    return {
      items: rows.map((x) => ({
        id: x.id,
        schoolId: x.schoolId,
        schoolName: schoolName.get(x.schoolId) ?? null,
        classId: x.classId,
        className: className.get(x.classId) ?? null,
        subjectId: x.subjectId,
        subjectName: subjectName.get(x.subjectId) ?? null,
        state: x.state,
        revision: x.revision,
        reason: x.reason,
        updatedBy: x.updatedBy,
        updatedAt: x.updatedAt,
      })),
      schools: allSchools.map((s) => ({
        id: s.id,
        name: s.name,
        classes: allClasses
          .filter((c) => c.schoolId === s.id)
          .map((c) => ({ id: c.id, name: c.name })),
        subjects: allSubjects
          .filter((sub) => sub.schoolId === s.id)
          .map((sub) => ({ id: sub.id, name: sub.name })),
      })),
    };
  }
  /**
   * Open, pause or close one class × subject. The row lock makes the change
   * wait for any in-flight business transaction that read the scope FOR SHARE,
   * and the worker re-reads the state before every model call and result write.
   * Pausing/closing parks waiting jobs; reopening re-queues only jobs the gate
   * itself stopped.
   */
  async setPilotScope(actor: number, d: D.PilotScopeDto) {
    const reason = d.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      assessmentError(
        'ASSESSMENT_INVALID_INPUT',
        'A reason of 3 to 500 characters is required',
      );
    return this.db.transaction(async (m) => {
      // Lock the parent class row so two concurrent first-time opens on the
      // same class serialize cleanly instead of racing into unique 23505.
      const cls = await m.findOne(SchoolClass, {
        select: { id: true, schoolId: true },
        where: { id: d.classId },
        lock: { mode: 'pessimistic_write' },
      });
      const subject = cls
        ? await m.findOne(Subject, {
            select: { id: true },
            where: { id: d.subjectId, schoolId: cls.schoolId },
          })
        : null;
      if (!cls || !subject) this.notFound();
      const schoolId = cls.schoolId;
      let row = await m.findOne(E.AssessmentPilotScope, {
        where: { schoolId, classId: d.classId, subjectId: d.subjectId },
        lock: { mode: 'pessimistic_write' },
      });
      const fromState = row?.state ?? null;
      if (row) {
        assertRevision(row.revision, d.expectedRevision);
        row.state = d.state;
        row.reason = reason;
        row.updatedBy = actor;
        row.revision++;
      } else {
        if (d.expectedRevision !== undefined)
          assertRevision(null, d.expectedRevision);
        row = m.create(E.AssessmentPilotScope, {
          schoolId,
          classId: d.classId,
          subjectId: d.subjectId,
          state: d.state,
          reason,
          updatedBy: actor,
        });
      }
      row = await m.save(E.AssessmentPilotScope, row);
      await m.save(
        E.AssessmentPilotScopeEvent,
        m.create(E.AssessmentPilotScopeEvent, {
          schoolId,
          scopeId: row.id,
          fromState,
          toState: row.state,
          scopeRevision: row.revision,
          actorId: actor,
          reason,
        }),
      );
      let requeuedJobs = 0;
      let parkedJobs = 0;
      if (row.state === 'active' && fromState !== 'active') {
        const [{ n }] = await m.query(
          `WITH requeued AS (
             UPDATE school_assessment_jobs j
                SET state='pending',next_attempt_at=now(),last_error_code=NULL,
                    attempt_count=GREATEST(j.attempt_count-1,0),
                    dispatch_generation=j.dispatch_generation+1,updated_at=now()
               FROM school_assessments a
              WHERE a.id=j.assessment_id AND a.school_id=j.school_id
                AND a.school_id=$1 AND a.class_id=$2 AND a.subject_id=$3
                AND j.state='paused' AND j.last_error_code LIKE 'pilot\\_%'
             RETURNING j.submission_id,j.school_id,j.data
           ), touched AS (
             UPDATE school_assessment_submissions s
                SET processing_state='queued',updated_at=now()
               FROM requeued r
              WHERE r.submission_id IS NOT NULL
                AND s.id=r.submission_id AND s.school_id=r.school_id
                AND (r.data->>'inputRevision') ~ '^[0-9]+$'
                AND s.input_revision=(r.data->>'inputRevision')::int
                AND s.processing_state='paused'
             RETURNING s.id
           )
           SELECT count(*)::int AS n FROM requeued`,
          [schoolId, d.classId, d.subjectId],
        );
        requeuedJobs = n;
      } else if (row.state !== 'active') {
        const code = row.state === 'paused' ? 'pilot_paused' : 'pilot_closed';
        const [{ n }] = await m.query(
          `WITH parked AS (
             UPDATE school_assessment_jobs j
                SET state='paused',last_error_code=$4,
                    lease_token=NULL,lease_owner=NULL,lease_until=NULL,updated_at=now()
               FROM school_assessments a
              WHERE a.id=j.assessment_id AND a.school_id=j.school_id
                AND a.school_id=$1 AND a.class_id=$2 AND a.subject_id=$3
                AND j.state IN ('pending','dispatched','retry_wait')
             RETURNING j.submission_id,j.school_id,j.data
           ), touched AS (
             UPDATE school_assessment_submissions s
                SET processing_state='paused',updated_at=now()
               FROM parked p
              WHERE p.submission_id IS NOT NULL
                AND s.id=p.submission_id AND s.school_id=p.school_id
                AND (p.data->>'inputRevision') ~ '^[0-9]+$'
                AND s.input_revision=(p.data->>'inputRevision')::int
                AND s.processing_state='queued'
             RETURNING s.id
           )
           SELECT count(*)::int AS n FROM parked`,
          [schoolId, d.classId, d.subjectId, code],
        );
        parkedJobs = n;
      }
      return {
        id: row.id,
        schoolId,
        classId: row.classId,
        subjectId: row.subjectId,
        state: row.state,
        revision: row.revision,
        reason: row.reason,
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt,
        requeuedJobs,
        parkedJobs,
      };
    });
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
      await this.assertPilotActive(m, {
        schoolId,
        classId: d.classId,
        subjectId: d.subjectId,
      });
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
    const pilotState = await this.pilotState(this.db.manager, a);
    const examVersions = await this.db.manager.find(E.AssessmentExamVersion, {
      where: { schoolId: a.schoolId, assessmentId: a.id },
      order: { examCode: 'ASC', versionNumber: 'DESC' },
    });
    const examImports = (
      await this.db.manager.find(E.AssessmentJob, {
        where: { schoolId: a.schoolId, assessmentId: id, stage: 'template' },
        select: {
          id: true,
          data: true,
          state: true,
          lastErrorCode: true,
          resultRef: true,
        },
        order: { createdAt: 'DESC' },
      })
    )
      .filter((job) => job.data?.kind === 'official_docx')
      .map((job) => this.examImportStatus(job));
    const imported = new Map(
      examImports
        .filter((job) => job.versionId)
        .map((job) => [job.versionId, job.jobId]),
    );
    if (imported.size) {
      const revisions = await this.db.manager.find(E.AssessmentReviewEvent, {
        where: {
          schoolId: a.schoolId,
          assessmentId: id,
          eventType: 'official_exam_version_revised',
        },
        select: { beforeRef: true, afterRef: true },
      });
      const parents = new Map(
        revisions.map((event) => [
          event.afterRef.examVersionId,
          event.beforeRef.examVersionId,
        ]),
      );
      for (const version of examVersions) {
        let sourceId = version.id;
        while (parents.has(sourceId) && !imported.has(sourceId))
          sourceId = parents.get(sourceId);
        const jobId = imported.get(sourceId);
        if (jobId) imported.set(version.id, jobId);
      }
    }
    const roster = await this.db.manager.findBy(E.AssessmentRoster, {
      schoolId: a.schoolId,
      assessmentId: id,
    });
    const nowMs = Date.now();
    const exports = (
      await this.db.manager.find(E.AssessmentExport, {
        where: {
          schoolId: a.schoolId,
          assessmentId: id,
          state: 'completed',
        },
        select: { id: true, format: true, createdAt: true, expiresAt: true },
        order: { createdAt: 'DESC' },
      })
    ).filter((exp) => exp.expiresAt.getTime() > nowMs);
    return {
      roster: roster
        .map((student) => ({
          id: student.studentId,
          displayName: student.displayNameSnapshot,
          studentCode: student.studentCodeSnapshot ?? undefined,
        }))
        .sort(
          (first, second) =>
            first.displayName.localeCompare(second.displayName, 'vi') ||
            first.id - second.id,
        ),
      ...a,
      externalTextEnabled: !!externalTextPolicy(a.id),
      examVersions: examVersions.map((version) => ({
        ...version,
        sourceImportJobId: imported.get(version.id),
      })),
      examImports,
      exports,
      pilotState,
      capabilities: this.pilotCapabilities(pilotState, !!a.archivedAt),
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
      const files = d.files ?? [];
      const fileIds = files.map((file) => file.clientFileId.toLowerCase());
      if (
        files.length &&
        (!d.studentId || new Set(fileIds).size !== files.length)
      )
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'A class upload requires a student and distinct file identifiers',
        );
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
        if (files.length) {
          const registered = await m.findBy(E.AssessmentAsset, {
            id: In(fileIds),
            schoolId: a.schoolId,
            assessmentId: a.id,
            submissionId: old.id,
            purpose: 'student_work',
          });
          if (
            !files.every((file) =>
              registered.some(
                (asset) =>
                  asset.id === file.clientFileId &&
                  this.sameUpload(asset, file),
              ),
            )
          )
            assessmentError(
              'ASSESSMENT_IDEMPOTENCY_CONFLICT',
              'Client group was created with different files',
              409,
            );
        }
        return old;
      }
      if (d.studentId) {
        await this.assertRoster(m, a, d.studentId);
        if (
          files.length &&
          (await m.existsBy(E.AssessmentSubmission, {
            assessmentId: id,
            schoolId: a.schoolId,
            studentId: d.studentId,
            deletedAt: IsNull(),
          }))
        )
          assessmentError(
            'ASSESSMENT_IDEMPOTENCY_CONFLICT',
            'Học sinh đã có bài trong đợt này. Mở bài hiện có để bổ sung trang.',
            409,
          );
      }
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
      const saved = await m.save(E.AssessmentSubmission, s);
      if (files.length) {
        const registeredAt = Date.now();
        await m.insert(
          E.AssessmentAsset,
          files.map((file, index) => ({
            ...this.newUpload(a, {
              ...file,
              submissionId: saved.id,
              purpose: 'student_work',
            }),
            // The worker reads files by createdAt. Keep the teacher's file order.
            createdAt: new Date(registeredAt + index),
          })),
        );
      }
      return saved;
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
      manualOnly:
        s.processingState === 'manual_only' ||
        (await m.existsBy(E.AssessmentReviewEvent, {
          schoolId: a.schoolId,
          assessmentId: a.id,
          submissionId: s.id,
          eventType: MANUAL_ONLY_EVENT,
        })),
      reviewApproved: currentReview
        ? await this.hasReviewApproval(m, a, s, currentReview)
        : false,
      publication,
    };
  }
  private uploadsReady(
    assets: Pick<E.AssessmentAsset, 'state' | 'sealedKey'>[],
  ) {
    return (
      assets.length > 0 &&
      assets.every((asset) => asset.state === 'sealed' && !!asset.sealedKey)
    );
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
    const page = this.paginate(rows, q);
    if (!page.items.length) return page;
    const files = await this.db.manager.find(E.AssessmentAsset, {
      where: {
        schoolId: a.schoolId,
        assessmentId: id,
        submissionId: In(page.items.map((item) => item.id)),
      },
      select: { submissionId: true, state: true, sealedKey: true },
    });
    const filesBySubmission = new Map<string | null, E.AssessmentAsset[]>();
    for (const file of files) {
      const group = filesBySubmission.get(file.submissionId) ?? [];
      group.push(file);
      filesBySubmission.set(file.submissionId, group);
    }
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        uploadReady: this.uploadsReady(filesBySubmission.get(item.id) ?? []),
      })),
    };
  }
  async submissionDetail(actor: number, id: string, sId: string) {
    const a = await this.getAssessment(actor, id);
    const s = await this.submission(a, sId);
    const uploads = await this.db.manager.findBy(E.AssessmentAsset, {
      schoolId: a.schoolId,
      assessmentId: id,
      submissionId: sId,
    });
    const summary = await this.summary(a, s);
    const verifyingIds = uploads
      .filter((asset) => asset.state === 'verifying')
      .map((asset) => asset.id);
    const failedVerifications = verifyingIds.length
      ? await this.db.manager.findBy(E.AssessmentJob, {
          schoolId: a.schoolId,
          assessmentId: id,
          stage: 'seal',
          scopeKey: In(verifyingIds),
          state: In(['failed', 'paused']),
        })
      : [];
    const failedIds = new Set(failedVerifications.map((job) => job.scopeKey));
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
      uploadReady: this.uploadsReady(uploads),
      uploads: uploads.map((asset) => ({
        id: asset.id,
        name: asset.originalName,
        mime: asset.declaredMime,
        byteSize: asset.byteSize,
        state: asset.state,
        verificationFailed: failedIds.has(asset.id),
      })),
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
  private sameUpload(
    asset: E.AssessmentAsset,
    file: D.AssessmentUploadFileDto,
  ) {
    return (
      asset.originalName === file.name &&
      asset.declaredMime === file.mime &&
      asset.byteSize === file.byteSize
    );
  }
  private newUpload(a: E.Assessment, d: D.UploadDto): E.AssessmentAsset {
    const docx =
      d.mime === DOCX_MIME && d.purpose === 'marking_guide' && !d.submissionId;
    if (
      !docx &&
      !['image/jpeg', 'image/png', 'application/pdf'].includes(d.mime)
    )
      assessmentError(
        'ASSESSMENT_UNSUPPORTED_FILE',
        'Use JPEG, PNG, PDF or a DOCX marking guide',
        415,
      );
    if (
      d.byteSize >
      (docx
        ? DOCX_LIMIT
        : (d.mime === 'application/pdf' ? 50 : 20) * 1024 * 1024)
    )
      assessmentError(
        'ASSESSMENT_INVALID_INPUT',
        'Upload exceeds file size limit',
      );
    const id = d.clientFileId?.toLowerCase() ?? randomUUID();
    return this.db.manager.create(E.AssessmentAsset, {
      id,
      schoolId: a.schoolId,
      assessmentId: a.id,
      submissionId: d.submissionId ?? null,
      purpose: d.purpose,
      originalName: d.name,
      declaredMime: d.mime,
      byteSize: d.byteSize,
      sha256: d.sha256 ?? null,
      state: 'uploading',
      stagingKey: `assessment/${a.schoolId}/${a.id}/staging/${id}`,
      uploadExpiresAt: new Date(0),
    });
  }
  async upload(actor: number, id: string, d: D.UploadDto) {
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      await this.assertPilotActive(m, a);
      const storage = this.storage;
      if (!storage)
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
      const submission = d.submissionId
        ? await this.submission(a, d.submissionId, m, true)
        : null;
      let asset: E.AssessmentAsset;
      if (d.clientFileId) {
        const planned = await m.findOne(E.AssessmentAsset, {
          where: {
            id: d.clientFileId,
            schoolId: a.schoolId,
            assessmentId: id,
            submissionId: d.submissionId ?? IsNull(),
            purpose: d.purpose,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!planned) this.notFound();
        if (!this.sameUpload(planned, d))
          assessmentError(
            'ASSESSMENT_IDEMPOTENCY_CONFLICT',
            'Chọn lại đúng file đã gắn với bài này.',
            409,
          );
        if (planned.state === 'sealed')
          return { assetId: planned.id, state: planned.state, upload: null };
        if (planned.state === 'verifying') {
          const failed = await m.findOne(E.AssessmentJob, {
            where: {
              schoolId: a.schoolId,
              assessmentId: id,
              stage: 'seal',
              scopeKey: planned.id,
              state: In(['failed', 'paused']),
            },
            lock: { mode: 'pessimistic_write' },
          });
          if (!failed)
            return { assetId: planned.id, state: planned.state, upload: null };
          // Wait for the replacement transfer to complete before dispatching this job again.
          failed.state = 'cancelled';
          failed.lastErrorCode = 'upload_retry_requested';
          await m.save(E.AssessmentJob, failed);
          planned.state = 'uploading';
        }
        if (planned.state !== 'uploading')
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'Upload is not available',
          );
        asset = planned;
      } else {
        asset = this.newUpload(a, d);
      }
      const upload = await storage.createUpload(asset);
      asset.uploadExpiresAt = new Date(upload.expiresAt);
      if (submission && !d.clientFileId) {
        submission.inputRevision++;
        submission.currentReviewRevisionId = null;
        submission.processingState = 'idle';
        await m.save(E.AssessmentSubmission, submission);
      }
      await m.save(E.AssessmentAsset, asset);
      return {
        assetId: asset.id,
        state: asset.state,
        upload: {
          method: 'POST',
          url: upload.url,
          fields: upload.fields,
          requiredHeaders: {},
        },
        expiresAt: upload.expiresAt,
      };
    });
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
        await this.assertPilotActive(m, a);
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
        let job = await m.findOneBy(E.AssessmentJob, {
          schoolId: a.schoolId,
          assessmentId: id,
          stage: 'seal',
          scopeKey: asset.id,
          state: 'cancelled',
          lastErrorCode: 'upload_retry_requested',
        });
        if (job) {
          job.state = 'pending';
          job.nextAttemptAt = new Date();
          job.attemptCount = 0;
          job.lastErrorCode = null;
          job.dispatchGeneration++;
          job = await m.save(E.AssessmentJob, job);
        } else {
          job = await this.job(
            m,
            a,
            'seal',
            asset.id,
            { assetId },
            asset.submissionId,
          );
        }
        return { assetId, jobId: job.id, state: 'verifying' };
      },
    );
  }
  private assertArtifactKey(a: E.Assessment, key: string) {
    if (
      !key.startsWith(`assessment/${a.schoolId}/${a.id}/`) ||
      key.includes('..') ||
      key.includes('/staging/')
    )
      this.notFound();
  }

  private async artifactBytes(
    a: E.Assessment,
    key: string,
    mime: string,
    filename: string,
    limit: number,
    inline = false,
  ) {
    this.assertArtifactKey(a, key);
    if (!this.storage?.read)
      assessmentError('ASSESSMENT_NOT_READY', 'Storage unavailable', 503);
    let bytes: Buffer;
    try {
      bytes = await this.storage.read(key, limit);
    } catch {
      this.notFound();
    }
    if (!Buffer.isBuffer(bytes) || bytes.length > limit) this.notFound();
    return {
      bytes,
      mime,
      disposition: `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    };
  }

  private async accessibleAsset(actor: number, id: string, assetId: string) {
    const a = await this.getAssessment(actor, id);
    // Staff evidence links exist only while the scope is active (design §4).
    await this.assertPilotActive(this.db.manager, a);
    const asset = await this.db.manager.findOne(E.AssessmentAsset, {
      where: {
        id: assetId,
        schoolId: a.schoolId,
        assessmentId: id,
        state: 'sealed',
      },
    });
    if (!asset?.sealedKey || asset.state !== 'sealed') this.notFound();
    if (asset.submissionId) await this.submission(a, asset.submissionId);
    this.assertArtifactKey(a, asset.sealedKey);
    return { a, asset };
  }

  async assetAccess(actor: number, id: string, assetId: string) {
    await this.accessibleAsset(actor, id, assetId);
    return {
      url: `/assessments/${id}/assets/${assetId}/content`,
      requiresAuth: true,
    };
  }

  async assetContent(actor: number, id: string, assetId: string) {
    const { a, asset } = await this.accessibleAsset(actor, id, assetId);
    const mime = asset.verifiedMime;
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      [DOCX_MIME]: 'docx',
    };
    if (
      !mime ||
      !extensions[mime] ||
      !Number.isSafeInteger(asset.byteSize) ||
      asset.byteSize < 1 ||
      asset.byteSize > 50 * 1024 * 1024
    )
      this.notFound();
    return this.artifactBytes(
      a,
      asset.sealedKey!,
      mime,
      `assessment-${asset.id}.${extensions[mime]}`,
      asset.byteSize,
      mime.startsWith('image/') || mime === 'application/pdf',
    );
  }
  async process(actor: number, id: string, d: D.ProcessDto, key?: string) {
    return this.command(actor, id, key, 'process', d, async (m, a) => {
      this.mutable(a);
      await this.assertPilotActive(m, a);
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
      const skipped: string[] = [];
      for (const s of rows) {
        if (
          await m.existsBy(E.AssessmentReviewEvent, {
            schoolId: a.schoolId,
            assessmentId: id,
            submissionId: s.id,
            eventType: MANUAL_ONLY_EVENT,
          })
        ) {
          skipped.push(s.id);
          continue;
        }
        if (
          d.readyOnly &&
          (s.inputRevision !== d.expectedInputRevisions[s.id] ||
            s.processingState !== 'idle')
        ) {
          skipped.push(s.id);
          continue;
        }
        assertRevision(s.inputRevision, d.expectedInputRevisions[s.id]);
        const assets = await m.find(E.AssessmentAsset, {
          where: {
            schoolId: a.schoolId,
            assessmentId: id,
            submissionId: s.id,
          },
        });
        if (!this.uploadsReady(assets)) {
          if (d.readyOnly) {
            skipped.push(s.id);
            continue;
          }
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'Wait for uploaded work to be verified before processing',
            409,
          );
        }
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
      return { jobIds, ...(d.readyOnly ? { skipped } : {}) };
    });
  }
  /** Measures the AI against the teacher on reviews the teacher approved or published, before anyone trusts bulk approval. */
  async aiAgreement(actor: number, id: string) {
    const a = await this.getAssessment(actor, id);
    const m = this.db.manager;
    const submissions = await m.find(E.AssessmentSubmission, {
      where: { schoolId: a.schoolId, assessmentId: id, deletedAt: IsNull() },
    });
    const reviewed = submissions.filter((s) => !!s.currentReviewRevisionId);
    if (!reviewed.length) return compareAiToTeacher([]);
    const submissionIds = reviewed.map((s) => s.id);
    // Three batched reads instead of several queries per submission.
    const [decidedRows, proposalRows, publications] = await Promise.all([
      m.find(E.AssessmentReviewRevision, {
        where: {
          schoolId: a.schoolId,
          id: In(reviewed.map((s) => s.currentReviewRevisionId!)),
        },
      }),
      m.find(E.AssessmentReviewRevision, {
        where: {
          schoolId: a.schoolId,
          submissionId: In(submissionIds),
          createdBy: IsNull(),
        },
        order: { revisionNumber: 'ASC' },
      }),
      m.find(E.AssessmentPublication, {
        where: {
          schoolId: a.schoolId,
          submissionId: In(submissionIds),
          state: 'active',
        },
        select: { id: true, submissionId: true },
      }),
    ]);
    const decidedById = new Map(decidedRows.map((r) => [r.id, r]));
    const published = new Set(publications.map((p) => p.submissionId));
    const pairs: AgreementPair[] = [];
    for (const s of reviewed) {
      const decided = decidedById.get(s.currentReviewRevisionId!);
      if (!decided || decided.submissionId !== s.id) continue;
      // Only unpublished submissions still need the per-submission approval lookup.
      if (
        !published.has(s.id) &&
        !(await this.hasReviewApproval(m, a, s, decided))
      )
        continue;
      const proposed = proposalRows.find(
        (r) =>
          r.submissionId === s.id &&
          r.inputManifest?.inputRevision ===
            decided.inputManifest?.inputRevision,
      );
      if (proposed)
        pairs.push({
          proposed: proposed.effectiveResults,
          decided: decided.effectiveResults,
          approvedAsProposed: proposed.id === decided.id,
        });
    }
    return compareAiToTeacher(pairs);
  }
  /** Tokens and micro-USD spent on this assessment, retries included (design §3). */
  async costReport(actor: number, id: string) {
    const a = await this.getAssessment(actor, id);
    const rows: any[] = await this.db.manager.query(
      `SELECT c.state,c.purpose,c.provider,c.model_requested,c.attempt_number,
              c.input_usage,c.output_usage,c.reserved_cost_micros,
              c.actual_cost_micros,j.stage
         FROM school_assessment_provider_calls c
         JOIN school_assessment_jobs j
           ON j.id=c.job_id AND j.school_id=c.school_id
        WHERE j.school_id=$1 AND j.assessment_id=$2`,
      [a.schoolId, a.id],
    );
    const finalized = await this.db.manager.count(E.AssessmentPublication, {
      where: { schoolId: a.schoolId, assessmentId: a.id, state: 'active' },
    });
    const calls = rows.map(costCall);
    const byStage = new Map<string, CostCall[]>();
    rows.forEach((r, i) => {
      if (!byStage.has(r.stage)) byStage.set(r.stage, []);
      byStage.get(r.stage)!.push(calls[i]);
    });
    const { byPurpose, byModel, retries, byState, ...total } = summarizeCost(
      calls,
      finalized,
    );
    return {
      assessmentId: a.id,
      ...total,
      retries,
      byState,
      byPurpose,
      byModel,
      byStage: [...byStage].map(([stage, list]) => {
        const t = summarizeCost(list);
        return {
          stage,
          calls: t.calls,
          inputTokens: t.inputTokens,
          outputTokens: t.outputTokens,
          knownCostMicros: t.knownCostMicros,
          unknownCostCalls: t.unknownCostCalls,
        };
      }),
    };
  }
  /**
   * School-wide spend per local day (Asia/Ho_Chi_Minh, the budget window the
   * worker enforces) and per assessment, for principals and operations.
   */
  async schoolCostSummary(actor: number, from: string, to: string) {
    if (!isValidIsoDayRange(from, to, 92))
      assessmentError(
        'ASSESSMENT_INVALID_INPUT',
        'from/to must be valid YYYY-MM-DD calendar dates at most 92 days apart',
      );
    const schoolId = await this.schools.resolveSchoolIdForUser(actor);
    const tok = (col: string) =>
      `jsonb_build_object('tokens', COALESCE(sum(CASE WHEN jsonb_typeof(${col}->'tokens')='number'
        AND (${col}->>'tokens')::numeric > 0 THEN (${col}->>'tokens')::bigint END),0)::bigint)`;
    const rows: any[] = await this.db.manager.query(
      `SELECT count(*)::int AS calls,
              c.state,c.purpose,c.provider,c.model_requested,
              CASE WHEN c.attempt_number > 1 THEN 2 ELSE 1 END AS attempt_number,
              ${tok('c.input_usage')} AS input_usage,
              ${tok('c.output_usage')} AS output_usage,
              COALESCE(sum(c.reserved_cost_micros),0)::bigint AS reserved_cost_micros,
              sum(c.actual_cost_micros)::bigint AS actual_cost_micros,
              j.assessment_id,
              to_char((c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'YYYY-MM-DD') AS day
         FROM school_assessment_provider_calls c
         JOIN school_assessment_jobs j
           ON j.id=c.job_id AND j.school_id=c.school_id
        WHERE c.school_id=$1
          AND ${vnDayRangeWhere('c.created_at', '$2', '$3')}
        GROUP BY 2, 3, 4, 5, 6, 11, 12, (c.actual_cost_micros IS NOT NULL)`,
      [schoolId, from, to],
    );
    const group = (key: (r: any) => string) => {
      const out = new Map<string, CostCall[]>();
      for (const r of rows) {
        const k = key(r);
        if (!out.has(k)) out.set(k, []);
        out.get(k)!.push(costCall(r));
      }
      return out;
    };
    const brief = (calls: CostCall[], finalized = 0) => {
      const t = summarizeCost(calls, finalized);
      return {
        calls: t.calls,
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        knownCostMicros: t.knownCostMicros,
        knownCostUsd: t.knownCostUsd,
        unknownCostCalls: t.unknownCostCalls,
        upperBoundCostMicros: t.upperBoundCostMicros,
        knownCostPerFinalizedMicros: t.knownCostPerFinalizedMicros,
      };
    };
    const perAssessment = group((r) => r.assessment_id);
    const ids = [...perAssessment.keys()];
    const assessments = ids.length
      ? await this.db.manager.find(E.Assessment, {
          select: { id: true, title: true, classId: true, subjectId: true },
          where: { schoolId, id: In(ids) },
        })
      : [];
    const finalized: { assessment_id: string; n: number }[] = ids.length
      ? await this.db.manager.query(
          `SELECT assessment_id,count(*)::int AS n
             FROM school_assessment_publications
            WHERE school_id=$1 AND state='active' AND assessment_id=ANY($2::uuid[])
              AND ${vnDayRangeWhere('finalized_at', '$3', '$4')}
            GROUP BY assessment_id`,
          [schoolId, ids, from, to],
        )
      : [];
    const done = new Map(finalized.map((x) => [x.assessment_id, x.n]));
    const meta = new Map(assessments.map((x) => [x.id, x]));
    const { byPurpose, byModel, retries, byState, ...total } = summarizeCost(
      rows.map(costCall),
      [...done.values()].reduce((n, x) => n + x, 0),
    );
    return {
      from,
      to,
      timeZone: 'Asia/Ho_Chi_Minh',
      ...total,
      retries,
      byState,
      byPurpose,
      byModel,
      byDay: [...group((r) => r.day)]
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([d, calls]) => ({ day: d, ...brief(calls) })),
      byAssessment: [...perAssessment]
        .map(([assessmentId, calls]) => ({
          assessmentId,
          title: meta.get(assessmentId)?.title ?? null,
          classId: meta.get(assessmentId)?.classId ?? null,
          subjectId: meta.get(assessmentId)?.subjectId ?? null,
          finalizedSubmissions: done.get(assessmentId) ?? 0,
          ...brief(calls, done.get(assessmentId) ?? 0),
        }))
        .sort((x, y) => y.knownCostMicros - x.knownCostMicros),
    };
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
        inputRevision: j.data?.inputRevision,
        attemptCount: j.attemptCount,
        lastErrorCode: j.lastErrorCode,
      })),
      warnings: [],
    };
  }
  async assetStatus(actor: number, id: string, assetId: string) {
    const a = await this.getAssessment(actor, id);
    const asset = await this.db.manager.findOneBy(E.AssessmentAsset, {
      id: assetId,
      schoolId: a.schoolId,
      assessmentId: id,
    });
    if (!asset) this.notFound();
    const job = await this.db.manager.findOne(E.AssessmentJob, {
      where: {
        schoolId: a.schoolId,
        assessmentId: id,
        stage: 'seal',
        scopeKey: asset.id,
      },
      order: { createdAt: 'DESC' },
    });
    return { state: asset.state, sealState: job?.state };
  }
  private examImportStatus(job: E.AssessmentJob, withSource = false) {
    return {
      jobId: job.id,
      assetId: job.data.assetId,
      examCode: job.data.examCode,
      state: job.state,
      canRetry:
        ['failed', 'paused'].includes(job.state) &&
        !job.lastErrorCode?.startsWith('exam_import_'),
      versionId: job.resultRef?.versionId,
      warnings: job.resultRef?.warnings,
      ...(withSource ? { source: job.resultRef?.source } : {}),
      ...(job.state !== 'succeeded' ? { errorCode: job.lastErrorCode } : {}),
    };
  }
  async getExamImport(actor: number, id: string, jobId: string) {
    const a = await this.getAssessment(actor, id);
    const job = await this.db.manager.findOneBy(E.AssessmentJob, {
      id: jobId,
      schoolId: a.schoolId,
      assessmentId: id,
      stage: 'template',
    });
    if (!job || job.data?.kind !== 'official_docx') this.notFound();
    return this.examImportStatus(job, true);
  }
  async importExam(
    actor: number,
    id: string,
    dto: D.ExamImportDto,
    key?: string,
  ) {
    return this.command(actor, id, key, 'exam-imports', dto, async (m, a) => {
      this.mutable(a);
      await this.assertPilotActive(m, a);
      const asset = await m.findOneBy(E.AssessmentAsset, {
        id: dto.assetId,
        schoolId: a.schoolId,
        assessmentId: id,
        purpose: 'marking_guide',
        submissionId: IsNull(),
      });
      if (!asset) this.notFound();
      if (
        asset.state !== 'sealed' ||
        asset.verifiedMime !== DOCX_MIME ||
        !asset.sha256 ||
        !asset.sealedKey
      )
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'File Word chưa được xác thực.',
          409,
        );
      const scopeKey = `official-docx:v1:${id}:${dto.examCode}:${asset.sha256}:${a.maxScoreUnits}`;
      const existing = await m.findOneBy(E.AssessmentJob, {
        schoolId: a.schoolId,
        assessmentId: id,
        stage: 'template',
        scopeKey,
      });
      const data = existing?.data ?? {
        kind: 'official_docx',
        assetId: asset.id,
        examCode: dto.examCode,
        sourceSha256: asset.sha256,
        maxScoreUnits: a.maxScoreUnits,
      };
      const job = await this.job(m, a, 'template', scopeKey, data);
      return { jobId: job.id };
    });
  }
  async assignExamVersion(
    actor: number,
    id: string,
    submissionId: string,
    dto: D.AssignExamVersionDto,
    key?: string,
  ) {
    return this.command(
      actor,
      id,
      key,
      `submissions:${submissionId}:exam-version`,
      dto,
      async (m, a) => {
        this.mutable(a);
        await this.assertPilotActive(m, a);
        const s = await this.submission(a, submissionId, m, true);
        assertRevision(s.inputRevision, dto.expectedInputRevision);
        const version = await m.findOneBy(E.AssessmentExamVersion, {
          id: dto.examVersionId,
          schoolId: a.schoolId,
          assessmentId: id,
          state: 'approved',
        });
        if (!version) this.notFound();
        if (
          await m.existsBy(E.AssessmentPublication, {
            schoolId: a.schoolId,
            submissionId,
          })
        )
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'Bài đã ghi sổ điểm.',
            409,
          );
        const before = {
          examVersionId: s.examVersionId,
          inputRevision: s.inputRevision,
        };
        s.examVersionId = version.id;
        s.inputRevision++;
        s.currentReviewRevisionId = null;
        s.processingState = 'queued';
        await m.save(E.AssessmentSubmission, s);
        const data = {
          inputRevision: s.inputRevision,
          examVersionId: version.id,
          manualExamVersionId: version.id,
        };
        const job = await this.job(m, a, 'extract', s.id, data, s.id);
        await this.event(
          m,
          a,
          actor,
          'exam_version_assigned',
          s.id,
          before,
          data,
        );
        return { jobId: job.id };
      },
    );
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
      const source = d.sourceVersionId
        ? await m.findOneBy(E.AssessmentExamVersion, {
            id: d.sourceVersionId,
            schoolId: a.schoolId,
            assessmentId: id,
            examCode: d.examCode,
          })
        : null;
      if (d.sourceVersionId && !source) this.notFound();
      const last = await m.findOne(E.AssessmentExamVersion, {
        where: { schoolId: a.schoolId, assessmentId: id, examCode: d.examCode },
        order: { versionNumber: 'DESC' },
      });
      const version = await m.save(
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
          sourceRegionIds: source?.sourceRegionIds ?? [],
          draftSource:
            source?.draftSource === 'official' ? 'official' : 'teacher',
        }),
      );
      if (source?.draftSource === 'official') {
        await this.event(
          m,
          a,
          actor,
          'official_exam_version_revised',
          null,
          { examVersionId: source.id },
          { examVersionId: version.id },
        );
      }
      return version;
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
        await this.assertPilotActive(m, a);
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
        const waiting =
          v.draftSource === 'official' && d.applyTo === 'unpublished'
            ? await m.findBy(E.AssessmentJob, {
                schoolId: a.schoolId,
                assessmentId: id,
                stage: 'extract',
                state: 'paused',
                lastErrorCode: 'exam_import_pending',
              })
            : [];
        const waitingRevisions = new Map(
          waiting
            .filter((job) => job.resultRef?.awaitingExamCode === v.examCode)
            .map((job) => [job.submissionId, job.data?.inputRevision] as const),
        );
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
            if (d.applyTo === 'unpublished') {
              if (!old || old.examCode !== v.examCode) continue;
              if (
                (old.draftSource === 'official' ||
                  v.draftSource === 'official') &&
                examEvidence(v.document, old.document.questions) !== 'match'
              )
                continue;
            }
          } else if (
            d.applyTo === 'unpublished' &&
            waitingRevisions.get(s.id) !== s.inputRevision
          )
            continue;
          if (s.examVersionId === v.id && v.state === 'approved') continue;
          // An unassigned waiting submission still needs independent content matching.
          if (s.examVersionId || d.submissionIds) s.examVersionId = v.id;
          s.inputRevision++;
          s.currentReviewRevisionId = null;
          s.processingState = 'queued';
          await m.save(E.AssessmentSubmission, s);
          const j = await this.job(
            m,
            a,
            'extract',
            s.id,
            { inputRevision: s.inputRevision, examVersionId: s.examVersionId },
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
      await this.assertPilotActive(m, a);
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
      const priorRun = await m.findOne(E.AssessmentJob, {
        where: {
          schoolId: a.schoolId,
          assessmentId: id,
          submissionId: s.id,
          stage: In(['extract', 'grade']),
          state: In(['running', 'succeeded']),
        },
        order: { createdAt: 'DESC' },
      });
      const manualExamVersionId =
        priorRun?.data?.inputRevision === s.inputRevision
          ? priorRun.data.manualExamVersionId
          : undefined;
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
          ...(manualExamVersionId ? { manualExamVersionId } : {}),
        },
        s.id,
      );
      return { answer, jobId: job.id, inputRevision: s.inputRevision };
    });
  }
  private async externalTextCandidates(
    m: EntityManager,
    a: E.Assessment,
    s: E.AssessmentSubmission,
  ) {
    const policy = externalTextPolicy(a.id);
    const current = s.currentReviewRevisionId
      ? await m.findOneBy(E.AssessmentReviewRevision, {
          id: s.currentReviewRevisionId,
          schoolId: a.schoolId,
          assessmentId: a.id,
          submissionId: s.id,
        })
      : null;
    if (
      !policy ||
      a.archivedAt ||
      !current ||
      current.createdBy !== null ||
      current.inputManifest.inputRevision !== s.inputRevision ||
      (await m.existsBy(E.AssessmentReviewEvent, {
        schoolId: a.schoolId,
        assessmentId: a.id,
        submissionId: s.id,
        eventType: MANUAL_ONLY_EVENT,
      })) ||
      s.identityState !== 'confirmed' ||
      !s.examVersionId ||
      (await m.existsBy(E.AssessmentPublication, {
        schoolId: a.schoolId,
        submissionId: s.id,
        state: 'active',
      }))
    )
      return { policy: null, items: [] };
    const version = await m.findOneBy(E.AssessmentExamVersion, {
      id: s.examVersionId,
      schoolId: a.schoolId,
      assessmentId: a.id,
      state: 'approved',
    });
    if (!version) return { policy: null, items: [] };
    const ids = Object.values(s.currentAnswerRevisionIds);
    const answers = ids.length
      ? await m.findBy(E.AssessmentAnswerRevision, {
          id: In(ids),
          schoolId: a.schoolId,
          assessmentId: a.id,
          submissionId: s.id,
          examVersionId: version.id,
        })
      : [];
    const roster = await m.find(E.AssessmentRoster, {
      where: { schoolId: a.schoolId, assessmentId: a.id },
      select: { displayNameSnapshot: true, studentCodeSnapshot: true },
    });
    const items = answers.flatMap((answer) => {
      if (
        answer.observationState !== 'readable' ||
        !answer.sourceRegionIds?.length
      )
        return [];
      const question = (version.document.questions as Question[]).find(
        (q) => q.questionKey === answer.questionKey,
      );
      const payload = question ? textPayload(question, answer.content) : null;
      return payload && !containsRosterIdentity(payload, roster)
        ? [
            {
              questionKey: answer.questionKey,
              payload,
              hash: textPayloadHash(payload),
            },
          ]
        : [];
    });
    return { policy, items };
  }

  async selectManualOnly(
    actor: number,
    id: string,
    sId: string,
    d: D.ExternalTextRevokeDto,
    key?: string,
  ) {
    return this.command(
      actor,
      id,
      key,
      `submissions:${sId}:manual-only`,
      d,
      async (m, a) => {
        this.mutable(a);
        const s = await this.submission(a, sId, m, true);
        assertRevision(s.inputRevision, d.expectedInputRevision);
        if (
          await m.existsBy(E.AssessmentPublication, {
            schoolId: a.schoolId,
            submissionId: s.id,
            state: 'active',
          })
        )
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'Bài đã ghi sổ điểm.',
            409,
          );
        if (
          await m.existsBy(E.AssessmentReviewEvent, {
            schoolId: a.schoolId,
            assessmentId: id,
            submissionId: sId,
            eventType: MANUAL_ONLY_EVENT,
          })
        )
          return { manualOnly: true };
        s.inputRevision++;
        s.currentReviewRevisionId = null;
        s.processingState = 'manual_only';
        await m.save(E.AssessmentSubmission, s);
        await this.event(
          m,
          a,
          actor,
          MANUAL_ONLY_EVENT,
          sId,
          {},
          { inputRevision: s.inputRevision },
        );
        return { manualOnly: true };
      },
    );
  }

  async externalTextPreview(actor: number, id: string, sId: string) {
    const a = await this.getAssessment(actor, id);
    const s = await this.submission(a, sId);
    return {
      inputRevision: s.inputRevision,
      ...(await this.externalTextCandidates(this.db.manager, a, s)),
    };
  }

  async releaseExternalText(
    actor: number,
    id: string,
    sId: string,
    d: D.ExternalTextReleaseDto,
    key?: string,
  ) {
    return this.command(
      actor,
      id,
      key,
      `submissions:${sId}:external-text`,
      d,
      async (m, a) => {
        this.mutable(a);
        await this.assertPilotActive(m, a);
        const s = await this.submission(a, sId, m, true);
        assertRevision(s.inputRevision, d.expectedInputRevision);
        if (['queued', 'running'].includes(s.processingState))
          assessmentError(
            'ASSESSMENT_STALE_REVISION',
            'Bài đang được xử lý.',
            409,
          );
        const { policy, items } = await this.externalTextCandidates(m, a, s);
        const hashes = Object.entries(d.hashes);
        if (
          !policy ||
          !hashes.length ||
          hashes.length > 12 ||
          hashes.some(
            ([questionKey, hash]) =>
              !items.some(
                (item) =>
                  item.questionKey === questionKey && item.hash === hash,
              ),
          )
        )
          assessmentError(
            'ASSESSMENT_INVALID_INPUT',
            'Nội dung gửi không khớp bản xem trước hoặc tuyến API ngoài đang đóng.',
            409,
          );
        const release = await m.save(
          E.AssessmentReviewEvent,
          m.create(E.AssessmentReviewEvent, {
            schoolId: a.schoolId,
            assessmentId: id,
            submissionId: sId,
            actorId: actor,
            eventType: TEXT_RELEASE_EVENT,
            beforeRef: {},
            requestId: randomUUID(),
            afterRef: {
              policy,
              contextRevision: a.contextRevision,
              reviewRevisionId: s.currentReviewRevisionId,
              inputRevision: s.inputRevision,
              identityRevision: s.identityRevision,
              examVersionId: s.examVersionId,
              hashes: Object.fromEntries(hashes),
            },
            eventPayload: { schemaVersion: 1 },
          }),
        );
        s.processingState = 'queued';
        await m.save(E.AssessmentSubmission, s);
        const job = await this.job(
          m,
          a,
          'grade',
          s.id,
          {
            inputRevision: s.inputRevision,
            examVersionId: s.examVersionId,
            externalReleaseId: release.id,
          },
          s.id,
        );
        return { jobId: job.id };
      },
    );
  }

  async revokeExternalText(
    actor: number,
    id: string,
    sId: string,
    d: D.ExternalTextRevokeDto,
    key?: string,
  ) {
    return this.command(
      actor,
      id,
      key,
      `submissions:${sId}:external-text-revoke`,
      d,
      async (m, a) => {
        this.mutable(a);
        const s = await this.submission(a, sId, m, true);
        assertRevision(s.inputRevision, d.expectedInputRevision);
        const jobs = await m.findBy(E.AssessmentJob, {
          schoolId: a.schoolId,
          assessmentId: id,
          submissionId: sId,
          stage: 'grade',
          state: In([
            'pending',
            'dispatched',
            'running',
            'retry_wait',
            'paused',
            'failed',
          ]),
        });
        const releaseIds = jobs.flatMap((job) =>
          job.data?.inputRevision === s.inputRevision &&
          typeof job.data.externalReleaseId === 'string'
            ? [job.data.externalReleaseId]
            : [],
        );
        await this.event(
          m,
          a,
          actor,
          TEXT_REVOKE_EVENT,
          sId,
          {},
          { inputRevision: s.inputRevision, releaseIds },
        );
        return { revoked: true };
      },
    );
  }

  private async accessiblePage(
    actor: number,
    id: string,
    pageId: string,
    original: boolean,
  ) {
    const a = await this.getAssessment(actor, id);
    await this.assertPilotActive(this.db.manager, a);
    const page = await this.db.manager.findOne(E.AssessmentPage, {
      where: { id: pageId, schoolId: a.schoolId, assessmentId: id },
    });
    if (!page || !page.submissionId) this.notFound();
    await this.submission(a, page.submissionId);
    const asset = await this.db.manager.findOne(E.AssessmentAsset, {
      where: {
        id: page.assetId,
        schoolId: a.schoolId,
        assessmentId: id,
        submissionId: page.submissionId,
        state: 'sealed',
      },
    });
    if (!asset || asset.state !== 'sealed') this.notFound();
    const key =
      original && typeof page.quality?.originalAnalysisKey === 'string'
        ? page.quality.originalAnalysisKey
        : page.analysisObjectKey;
    this.assertArtifactKey(a, key);
    return { a, key };
  }

  async pageAccess(
    actor: number,
    id: string,
    pageId: string,
    original = false,
  ) {
    await this.accessiblePage(actor, id, pageId, original);
    return {
      url: `/assessments/${id}/pages/${pageId}/content${original ? '?source=original' : ''}`,
      requiresAuth: true,
    };
  }

  async pageContent(
    actor: number,
    id: string,
    pageId: string,
    original = false,
  ) {
    const { a, key } = await this.accessiblePage(actor, id, pageId, original);
    return this.artifactBytes(
      a,
      key,
      'image/jpeg',
      `assessment-${pageId}.jpg`,
      20 * 1024 * 1024,
      true,
    );
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
      await this.assertPilotActive(m, a);
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
      if (['queued', 'running'].includes(s.processingState))
        assessmentError(
          'ASSESSMENT_STALE_REVISION',
          'Bài đang được xử lý.',
          409,
        );
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
        if (!result.sourceRegionIds?.length && !result.sourceAssetIds?.length)
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
                'low_confidence',
                'short_answer_unclear',
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
  async manualReview(
    actor: number,
    id: string,
    sId: string,
    d: D.ManualReviewDto,
  ) {
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      const s = await this.submission(a, sId, m, true);
      assertRevision(s.inputRevision, d.expectedInputRevision);
      assertRevision(s.identityRevision, d.expectedIdentityRevision);
      assertRevision(
        s.currentReviewRevisionId,
        d.expectedReviewRevisionId ?? null,
      );
      const version = await m.findOneBy(E.AssessmentExamVersion, {
        id: d.examVersionId,
        schoolId: a.schoolId,
        assessmentId: a.id,
        state: 'approved',
      });
      if (!version) this.notFound();
      assertRevision(version.gradingSpecHash, d.expectedVersionHash);
      const assets = await m.findBy(E.AssessmentAsset, {
        schoolId: a.schoolId,
        assessmentId: a.id,
        submissionId: s.id,
        purpose: 'student_work',
      });
      if (!this.uploadsReady(assets))
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Cần có bản gốc đã xác thực để chấm thủ công.',
          409,
        );
      const scores = new Map(
        d.scores.map((entry) => [entry.questionKey, entry.earnedUnits]),
      );
      const questions = version.document.questions as {
        questionKey: string;
        maxUnits: number;
      }[];
      if (
        !d.reason.trim() ||
        scores.size !== d.scores.length ||
        scores.size !== questions.length ||
        questions.some((question) => !scores.has(question.questionKey))
      )
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Nhập điểm mỗi câu đúng một lần và ghi lý do chấm thủ công.',
        );
      const sourceAssetIds = assets.map((asset) => asset.id);
      const effectiveResults = questions.map((question) => {
        const earnedUnits = scores.get(question.questionKey)!;
        normalizeScore(earnedUnits, question.maxUnits);
        return {
          questionKey: question.questionKey,
          maxUnits: question.maxUnits,
          earnedUnits,
          source: 'teacher',
          sourceAssetIds,
          sourceRegionIds: [],
        };
      });
      const latest = await m.findOne(E.AssessmentReviewRevision, {
        where: { schoolId: a.schoolId, submissionId: s.id },
        order: { revisionNumber: 'DESC' },
      });
      const previousReviewId = s.currentReviewRevisionId;
      if (s.examVersionId !== version.id) s.currentAnswerRevisionIds = {};
      s.examVersionId = version.id;
      s.inputRevision++;
      const inputManifest = {
        inputRevision: s.inputRevision,
        examVersionId: version.id,
        answerRevisionIds: s.currentAnswerRevisionIds,
        sourceAssetIds,
      };
      const flags: [] = [];
      const totals = summarizeResults(effectiveResults, a.maxScoreUnits);
      const review = await m.save(
        E.AssessmentReviewRevision,
        m.create(E.AssessmentReviewRevision, {
          schoolId: a.schoolId,
          assessmentId: a.id,
          submissionId: s.id,
          revisionNumber: (latest?.revisionNumber ?? 0) + 1,
          examVersionId: version.id,
          inputManifest,
          effectiveResults,
          flags,
          ...totals,
          createdBy: actor,
          contentHash: hash({
            inputManifest,
            effectiveResults,
            flags,
            ...totals,
          }),
        }),
      );
      s.currentReviewRevisionId = review.id;
      s.processingState = 'ready';
      await m.save(E.AssessmentSubmission, s);
      await this.event(
        m,
        a,
        actor,
        'manual_review_created',
        s.id,
        { reviewRevisionId: previousReviewId },
        { reviewRevisionId: review.id },
        d.reason.trim(),
      );
      return review;
    });
  }
  private assertReviewProcessingComplete(s: E.AssessmentSubmission) {
    if (['queued', 'running'].includes(s.processingState))
      assessmentError(
        'ASSESSMENT_FINALIZATION_BLOCKED',
        'Bài đang được xử lý. Hãy kiểm tra lại sau khi có kết quả.',
        409,
      );
  }
  private reviewApprovalRef(
    assessment: E.Assessment,
    submission: E.AssessmentSubmission,
    review: E.AssessmentReviewRevision,
  ) {
    return {
      contextRevision: assessment.contextRevision,
      inputRevision: submission.inputRevision,
      identityRevision: submission.identityRevision,
      examVersionId: review.examVersionId,
      reviewRevisionId: review.id,
      reviewHash: review.contentHash,
    };
  }
  private hasReviewApproval(
    m: EntityManager,
    assessment: E.Assessment,
    submission: E.AssessmentSubmission,
    review: E.AssessmentReviewRevision,
  ) {
    return m.existsBy(E.AssessmentReviewEvent, {
      schoolId: assessment.schoolId,
      assessmentId: assessment.id,
      submissionId: submission.id,
      eventType: 'review_approved',
      afterRef: Raw((column) => `${column} @> CAST(:approval AS jsonb)`, {
        approval: JSON.stringify(
          this.reviewApprovalRef(assessment, submission, review),
        ),
      }),
    });
  }
  async approveReview(
    actor: number,
    id: string,
    sId: string,
    d: D.ApproveReviewDto,
  ) {
    return this.db.transaction(async (m) => {
      const a = await this.getAssessment(actor, id, m, true);
      this.mutable(a);
      const s = await this.submission(a, sId, m, true);
      assertRevision(a.contextRevision, d.expectedContextRevision);
      assertRevision(s.inputRevision, d.expectedInputRevision);
      assertRevision(s.identityRevision, d.expectedIdentityRevision);
      assertRevision(s.currentReviewRevisionId, d.expectedReviewRevisionId);
      this.assertReviewProcessingComplete(s);
      if (!s.studentId || !['confirmed', 'proposed'].includes(s.identityState))
        assessmentError(
          'ASSESSMENT_FINALIZATION_BLOCKED',
          'Confirm the submission identity',
          409,
        );
      await this.assertRoster(m, a, s.studentId);
      const review = await m.findOneBy(E.AssessmentReviewRevision, {
        id: d.expectedReviewRevisionId,
        schoolId: a.schoolId,
        assessmentId: a.id,
        submissionId: s.id,
      });
      if (!review) this.notFound();
      assertRevision(review.contentHash, d.expectedReviewHash);
      assertReviewPublishable(review, s, a.maxScoreUnits);
      assertRevision(
        hash(review.inputManifest.answerRevisionIds ?? {}),
        hash(s.currentAnswerRevisionIds),
      );
      if (!(await this.hasReviewApproval(m, a, s, review)))
        await this.event(
          m,
          a,
          actor,
          'review_approved',
          s.id,
          {},
          this.reviewApprovalRef(a, s, review),
        );
      return { reviewApproved: true, reviewRevisionId: review.id };
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
            await this.assertPilotActive(m, a);
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
            this.assertReviewProcessingComplete(s);
            if (!(await this.hasReviewApproval(m, a, s, review)))
              assessmentError(
                'ASSESSMENT_FINALIZATION_BLOCKED',
                'Giáo viên cần duyệt kết quả hiện tại của bài trước khi ghi sổ điểm.',
                409,
              );
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
      await this.assertPilotActive(m, a);
      const job = await m.findOne(E.AssessmentJob, {
        where: { id: jobId, schoolId: a.schoolId, assessmentId: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) this.notFound();
      if (
        !['failed', 'retry_wait', 'paused'].includes(job.state) ||
        (job.data?.kind === 'official_docx' &&
          job.lastErrorCode?.startsWith('exam_import_')) ||
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
      await this.assertPilotActive(m, a);
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
  private async accessibleExport(actor: number, id: string, expId: string) {
    const a = await this.getAssessment(actor, id);
    const exp = await this.db.manager.findOne(E.AssessmentExport, {
      where: {
        id: expId,
        schoolId: a.schoolId,
        assessmentId: id,
        state: 'completed',
      },
    });
    if (
      !exp?.outputObjectKey ||
      exp.state !== 'completed' ||
      exp.expiresAt.getTime() <= Date.now() ||
      !['pdf', 'xlsx'].includes(exp.format)
    )
      this.notFound();
    this.assertArtifactKey(a, exp.outputObjectKey);
    const snapshot = exp.snapshotManifest?.publications;
    if (
      !Array.isArray(snapshot) ||
      !snapshot.length ||
      snapshot.some(
        (item: unknown) =>
          !item ||
          typeof (item as { publicationId?: unknown }).publicationId !==
            'string',
      )
    )
      this.notFound();
    const ids = [
      ...new Set(
        snapshot.map((item: { publicationId: string }) => item.publicationId),
      ),
    ];
    const publications = await this.db.manager.findBy(E.AssessmentPublication, {
      schoolId: a.schoolId,
      assessmentId: id,
      id: In(ids),
    });
    if (publications.length !== ids.length) this.notFound();
    const submissionIds = [
      ...new Set(publications.map((publication) => publication.submissionId)),
    ];
    const activeSubmissions = await this.db.manager.countBy(
      E.AssessmentSubmission,
      {
        schoolId: a.schoolId,
        assessmentId: id,
        id: In(submissionIds),
        deletedAt: IsNull(),
      },
    );
    if (activeSubmissions !== submissionIds.length) this.notFound();
    return { a, exp };
  }

  async exportAccess(actor: number, id: string, expId: string) {
    await this.accessibleExport(actor, id, expId);
    return {
      url: `/assessments/${id}/exports/${expId}/content`,
      requiresAuth: true,
    };
  }

  async exportContent(actor: number, id: string, expId: string) {
    const { a, exp } = await this.accessibleExport(actor, id, expId);
    const mime =
      exp.format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return this.artifactBytes(
      a,
      exp.outputObjectKey!,
      mime,
      `assessment-${exp.id}.${exp.format}`,
      50 * 1024 * 1024,
    );
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
  /** Readable by its student, approved parents and staff even while the global flag is off or the scope is paused. */
  async published(actor: number, pubId: string) {
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
        if (
          !(e instanceof HttpException) ||
          ![404, 503].includes(e.getStatus())
        )
          throw e;
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
