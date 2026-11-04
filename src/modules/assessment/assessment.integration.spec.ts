import * as routing from './runtime/routing';
import { readFileSync } from 'node:fs';
import { DataSource, QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import sharp from 'sharp';
import baseline from '../../database/data-source';
import { AddAssessmentFoundation1910000000000 } from '../../database/migrations/1910000000000-AddAssessmentFoundation';
import { AddAssessmentProcessing1910000000001 } from '../../database/migrations/1910000000001-AddAssessmentProcessing';
import { AddAssessmentPublications1910000000002 } from '../../database/migrations/1910000000002-AddAssessmentPublications';
import * as E from './entities/assessment.entities';
import { GradeEntry } from '../school/entities';
import { AssessmentService } from './assessment.service';
import { AssessmentEngine } from './runtime/engine';
import { AssessmentProcessor } from './runtime/processor';
import { AssessmentModels } from './runtime/provider';
import { hash } from './domain/assessment.policy';
const suite =
  process.env.ASSESSMENT_TEST_PG === 'true' ? describe : describe.skip;
suite(
  'assessment real PostgreSQL transaction boundary (isolated rollback schema)',
  () => {
    let db: DataSource, runner: QueryRunner, scoped: DataSource;
    const previous = process.env.ASSESSMENT_ENABLED;
    beforeAll(async () => {
      process.env.ASSESSMENT_ENABLED = 'true';
      process.env.ASSESSMENT_TEST_AUDIT_SEED = 'test';
      db = new DataSource({
        ...baseline.options,
        host: '127.0.0.1',
        port: 5432,
        username: process.env.ASSESSMENT_TEST_PG_USER || userInfo().username,
        password: process.env.ASSESSMENT_TEST_PG_PASSWORD || '',
        database: 'postgres',
        logging: false,
        synchronize: false,
        migrations: [],
        ssl: false,
      } as any);
      await db.initialize();
      runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      const schema = `assessment_test_${randomUUID().replace(/-/g, '')}`;
      await runner.query(`CREATE SCHEMA ${schema}`);
      await runner.query(`SET LOCAL search_path TO ${schema},public`);
      await runner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await runner.query(
        'CREATE TABLE schools(id uuid PRIMARY KEY);CREATE TABLE users(id integer PRIMARY KEY);CREATE TABLE school_classes(id uuid PRIMARY KEY,school_id uuid);CREATE TABLE school_subjects(id uuid PRIMARY KEY,school_id uuid);CREATE TABLE school_academic_years(id uuid PRIMARY KEY,school_id uuid);CREATE TABLE school_grades(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),school_id uuid,class_id uuid,subject_id uuid,student_id integer,test_type varchar(20),coefficient smallint,score numeric(4,1),date date,term smallint,quiz_session_id uuid,homework_id uuid,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now())',
      );
      await new AddAssessmentFoundation1910000000000().up(runner);
      await new AddAssessmentProcessing1910000000001().up(runner);
      await new AddAssessmentPublications1910000000002().up(runner);
      scoped = {
        manager: runner.manager,
        transaction: (fn: any) => runner.manager.transaction(fn),
        query: (...args: any[]) => runner.query(args[0], args[1]),
        getRepository: (target: any) => runner.manager.getRepository(target),
      } as unknown as DataSource;
    }, 30000);
    beforeEach(async () => {
      await runner.query('SAVEPOINT test_case');
    });
    afterEach(async () => {
      jest.restoreAllMocks();
      await runner.query('ROLLBACK TO SAVEPOINT test_case');
    });
    afterAll(async () => {
      if (runner) {
        await runner.rollbackTransaction();
        await runner.release();
      }
      if (db?.isInitialized) await db.destroy();
      if (previous === undefined) delete process.env.ASSESSMENT_ENABLED;
      else process.env.ASSESSMENT_ENABLED = previous;
      delete process.env.ASSESSMENT_TEST_AUDIT_SEED;
    });
    async function fixture() {
      const schoolId = randomUUID(),
        classId = randomUUID(),
        subjectId = randomUUID(),
        yearId = randomUUID();
      await runner.query('INSERT INTO schools VALUES($1)', [schoolId]);
      await runner.query('INSERT INTO users VALUES(7)');
      for (const table of [
        'school_classes',
        'school_subjects',
        'school_academic_years',
      ])
        await runner.query(`INSERT INTO ${table} VALUES($1,$2)`, [
          table === 'school_classes'
            ? classId
            : table === 'school_subjects'
              ? subjectId
              : yearId,
          schoolId,
        ]);
      const m = runner.manager;
      const assessment = await m.save(
        E.Assessment,
        m.create(E.Assessment, {
          schoolId,
          classId,
          subjectId,
          academicYearId: yearId,
          ownerId: 7,
          title: 'Exam',
          examDate: '2026-11-04',
          term: 1,
          testType: '45min',
          coefficient: 2,
          maxScoreUnits: 1000,
        }),
      );
      await m.save(
        E.AssessmentRoster,
        m.create(E.AssessmentRoster, {
          schoolId,
          assessmentId: assessment.id,
          studentId: 7,
          displayNameSnapshot: 'Synthetic student',
          membershipId: randomUUID(),
          addedBy: 7,
          addedAt: new Date(),
        }),
      );
      const doc = {
        schemaVersion: 1,
        subject: 'Math',
        grade: 8,
        examCode: '101',
        declaredExamPageCount: 1,
        pointScale: 1000,
        maxScoreUnits: 1000,
        questions: [
          {
            questionKey: 'I.1',
            kind: 'single_choice',
            text: 'Q',
            maxUnits: 1000,
            sourceRegionIds: [],
            options: [
              { id: 'A', text: '1' },
              { id: 'B', text: '2' },
            ],
            answerKey: 'A',
          },
        ],
        gradingDefaults: {
          blankScoreUnits: 0,
          carryForwardErrorPolicy: 'no_duplicate_penalty',
          rounding: { mode: 'half_up', normalizeTo: 10, targetDecimals: 1 },
        },
      };
      const version = await m.save(
        E.AssessmentExamVersion,
        m.create(E.AssessmentExamVersion, {
          schoolId,
          assessmentId: assessment.id,
          examCode: '101',
          versionNumber: 1,
          state: 'approved',
          document: doc,
          questionContentHash: hash(doc.questions),
          gradingSpecHash: hash(doc),
          sourceRegionIds: [],
          draftSource: 'teacher',
          approvedBy: 7,
          approvedAt: new Date(),
        }),
      );
      const submission = await m.save(
        E.AssessmentSubmission,
        m.create(E.AssessmentSubmission, {
          schoolId,
          assessmentId: assessment.id,
          clientGroupId: randomUUID(),
          studentId: 7,
          identityState: 'confirmed',
          examVersionId: version.id,
          currentPageIds: [],
          currentAnswerRevisionIds: {},
        }),
      );
      const service = new AssessmentService(
        scoped,
        { assertAccess: async () => undefined } as any,
        { resolveSchoolIdForUser: async () => schoolId } as any,
      );
      return { schoolId, assessment, version, submission, service };
    }
    async function reviewFixture() {
      const f = await fixture();
      const result = {
        questionKey: 'I.1',
        earnedUnits: 725,
        maxUnits: 1000,
        source: 'teacher',
        answerRevisionId: randomUUID(),
        sourceRegionIds: ['synthetic'],
      };
      const inputManifest = {
        inputRevision: 1,
        examVersionId: f.version.id,
        answerRevisionIds: { 'I.1': result.answerRevisionId },
      };
      const review = await runner.manager.save(
        E.AssessmentReviewRevision,
        runner.manager.create(E.AssessmentReviewRevision, {
          schoolId: f.schoolId,
          assessmentId: f.assessment.id,
          submissionId: f.submission.id,
          revisionNumber: 1,
          examVersionId: f.version.id,
          inputManifest,
          effectiveResults: [result],
          flags: [],
          earnedUnits: 725,
          ungradedMaxUnits: 0,
          contentHash: hash({ inputManifest, result }),
          createdBy: 7,
        }),
      );
      f.submission.currentReviewRevisionId = review.id;
      f.submission.currentAnswerRevisionIds = inputManifest.answerRevisionIds;
      await runner.manager.save(E.AssessmentSubmission, f.submission);
      const item = {
        submissionId: f.submission.id,
        expectedInputRevision: 1,
        expectedReviewRevisionId: review.id,
        expectedReviewHash: review.contentHash,
        expectedContextRevision: 1,
        expectedPublicationRevision: null,
        identityAcknowledgement: { studentId: 7, expectedIdentityRevision: 1 },
      };
      return { ...f, review, item };
    }
    it('publishes one grade and replays an idempotent finalize without duplicating audit', async () => {
      const f = await reviewFixture();
      const request = { items: [f.item] };
      const first = await f.service.finalize(
        7,
        f.assessment.id,
        request,
        'test-finalize',
      );
      expect(first.items[0]).toMatchObject({
        outcome: 'finalized',
        score: 7.3,
      });
      expect(
        await f.service.finalize(7, f.assessment.id, request, 'test-finalize'),
      ).toEqual(first);
      expect(await runner.manager.count(GradeEntry)).toBe(1);
      expect(await runner.manager.count(E.AssessmentPublication)).toBe(1);
      expect(
        await runner.manager.count(E.AssessmentReviewEvent, {
          where: { eventType: 'finalized' },
        }),
      ).toBe(1);
    });
    it('rolls grade and publication back if the audit insert fails', async () => {
      const f = await reviewFixture();
      jest
        .spyOn(f.service as any, 'event')
        .mockRejectedValue(new Error('injected audit failure'));
      await expect(
        f.service.finalize(
          7,
          f.assessment.id,
          { items: [f.item] },
          'fail-audit',
        ),
      ).rejects.toThrow('injected audit failure');
      expect(await runner.manager.count(GradeEntry)).toBe(0);
      expect(await runner.manager.count(E.AssessmentPublication)).toBe(0);
    });
    it('reads a synthetic image, scores by rule and writes a revision-safe review with a keyed answer manifest', async () => {
      const f = await fixture();
      const image = await sharp({
        create: { width: 50, height: 50, channels: 3, background: 'white' },
      })
        .jpeg()
        .toBuffer();
      const objects = new Map<string, Buffer>([['sealed', image]]);
      const storage = {
        read: async (key: string) => objects.get(key)!,
        put: async (key: string, bytes: Buffer) => {
          objects.set(key, bytes);
          return null;
        },
      };
      await runner.manager.save(
        E.AssessmentAsset,
        runner.manager.create(E.AssessmentAsset, {
          schoolId: f.schoolId,
          assessmentId: f.assessment.id,
          submissionId: f.submission.id,
          purpose: 'student_work',
          originalName: 'synthetic.jpg',
          declaredMime: 'image/jpeg',
          verifiedMime: 'image/jpeg',
          byteSize: image.length,
          state: 'sealed',
          sealedKey: 'sealed',
          uploadExpiresAt: new Date(),
        }),
      );
      const cfg = {
        execution: { pauseBelowFreeDiskGiB: 0 },
        profiles: { reader: {} },
        agents: { image_reader: { primaryProfileId: 'reader' } },
        policy: {
          auditSeedRef: 'ASSESSMENT_TEST_AUDIT_SEED',
          auditSampleRate: 0,
        },
      };
      const job = await runner.manager.save(
        E.AssessmentJob,
        runner.manager.create(E.AssessmentJob, {
          schoolId: f.schoolId,
          assessmentId: f.assessment.id,
          submissionId: f.submission.id,
          stage: 'extract',
          scopeKey: f.submission.id,
          inputHash: 'test',
          data: { inputRevision: 1 },
          state: 'running',
          nextAttemptAt: new Date(),
          routingPolicyHash: 'test',
          producerAgent: 'test',
          leaseToken: randomUUID(),
          leaseUntil: new Date(Date.now() + 180000),
        }),
      );
      jest.spyOn(AssessmentModels.prototype, 'json').mockResolvedValue({
        pageRole: 'mixed',
        primaryPolygon: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        examCode: '101',
        studentName: null,
        questionFragments: [{ questionKey: 'I.1', text: 'Q' }],
        regions: [
          {
            regionKey: 'answer',
            role: 'student_choice',
            questionKey: 'I.1',
            polygon: [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ],
            text: 'A',
            content: { selectedOptionId: 'A' },
            observationState: 'readable',
          },
        ],
      });
      await new AssessmentProcessor(
        scoped,
        storage as any,
        cfg as any,
        '/tmp/assessment-integration-workspace',
      ).process(job);
      const current = await runner.manager.findOneByOrFail(
        E.AssessmentSubmission,
        { id: f.submission.id },
      );
      expect(current.currentAnswerRevisionIds['I.1']).toEqual(
        expect.any(String),
      );
      const review = await runner.manager.findOneByOrFail(
        E.AssessmentReviewRevision,
        { id: current.currentReviewRevisionId! },
      );
      expect(review.earnedUnits).toBe(1000);
      expect(review.ungradedMaxUnits).toBe(0);
    }, 30000);
    it('requeues submissions already attached to a newly approved draft of the same version', async () => {
      const f = await fixture();
      const draft = await runner.manager.save(
        E.AssessmentExamVersion,
        runner.manager.create(E.AssessmentExamVersion, {
          ...f.version,
          id: randomUUID(),
          versionNumber: 2,
          state: 'draft',
          approvedBy: null,
          approvedAt: null,
        }),
      );
      await runner.manager.update(E.AssessmentSubmission, f.submission.id, {
        examVersionId: draft.id,
      });
      const cfg = JSON.parse(
        readFileSync(
          'docs/assessment/contracts/agent-routing.example.json',
          'utf8',
        ),
      );
      jest.spyOn(routing, 'loadRouting').mockReturnValue(cfg);
      const result = await f.service.approveVersion(
        7,
        f.assessment.id,
        draft.id,
        { expectedVersionHash: draft.gradingSpecHash, applyTo: 'unpublished' },
        'approve-draft',
      );
      expect(result.jobIds).toHaveLength(1);
      expect(
        (
          await runner.manager.findOneByOrFail(E.AssessmentSubmission, {
            id: f.submission.id,
          })
        ).inputRevision,
      ).toBe(2);
    });
    it('invalidates the review immediately when another page upload starts', async () => {
      const f = await reviewFixture();
      const service = new AssessmentService(
        scoped,
        { assertAccess: async () => undefined } as any,
        { resolveSchoolIdForUser: async () => f.schoolId } as any,
        {
          createUpload: async () => ({
            url: 'https://storage.example/upload',
            fields: {},
            expiresAt: new Date().toISOString(),
          }),
          access: async () => ({
            url: 'https://storage.example/read',
            expiresAt: new Date().toISOString(),
          }),
        },
      );
      await service.upload(7, f.assessment.id, {
        submissionId: f.submission.id,
        purpose: 'student_work',
        name: 'new.jpg',
        mime: 'image/jpeg',
        byteSize: 100,
      });
      const current = await runner.manager.findOneByOrFail(
        E.AssessmentSubmission,
        { id: f.submission.id },
      );
      expect(current.inputRevision).toBe(2);
      expect(current.currentReviewRevisionId).toBeNull();
    });
    it('claims duplicate deliveries once and persists retry backoff using the real job schema', async () => {
      const f = await fixture();
      const job = await runner.manager.save(
        E.AssessmentJob,
        runner.manager.create(E.AssessmentJob, {
          schoolId: f.schoolId,
          assessmentId: f.assessment.id,
          submissionId: f.submission.id,
          stage: 'seal',
          scopeKey: 'queue-test',
          inputHash: 'test',
          data: { assetId: randomUUID() },
          state: 'pending',
          nextAttemptAt: new Date(0),
          routingPolicyHash: 'test',
          producerAgent: 'test',
        }),
      );
      const engine = Object.assign(Object.create(AssessmentEngine.prototype), {
        db: scoped,
        cfg: { execution: { admitFreeDiskGiB: 0 } },
        workspace: '/tmp/assessment-integration-workspace',
        storage: {},
        owner: 'integration-worker',
        stopping: false,
      });
      const process = jest
        .spyOn(AssessmentProcessor.prototype, 'process')
        .mockRejectedValue(new Error('provider_http_503'));
      await engine.execute(job.id);
      const retry = await runner.manager.findOneByOrFail(E.AssessmentJob, {
        id: job.id,
      });
      expect(retry.state).toBe('retry_wait');
      expect(retry.attemptCount).toBe(1);
      await engine.execute(job.id);
      expect(process).toHaveBeenCalledTimes(1);
      await runner.manager.update(E.AssessmentJob, job.id, {
        nextAttemptAt: new Date(0),
      });
      process.mockResolvedValue(undefined);
      await Promise.all([engine.execute(job.id), engine.execute(job.id)]);
      const finished = await runner.manager.findOneByOrFail(E.AssessmentJob, {
        id: job.id,
      });
      expect(finished.state).toBe('succeeded');
      expect(finished.attemptCount).toBe(2);
      expect(process).toHaveBeenCalledTimes(2);
    });
  },
);
