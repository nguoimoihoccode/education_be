import * as routing from './runtime/routing';
import { readFileSync } from 'node:fs';
import { DataSource, QueryRunner } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import baseline from '../../database/data-source';
import { AddAssessmentFoundation1910000000000 } from '../../database/migrations/1910000000000-AddAssessmentFoundation';
import { AddAssessmentProcessing1910000000001 } from '../../database/migrations/1910000000001-AddAssessmentProcessing';
import { AddAssessmentPublications1910000000002 } from '../../database/migrations/1910000000002-AddAssessmentPublications';
import * as E from './entities/assessment.entities';
import { GradeEntry } from '../school/entities';
import { AssessmentService } from './assessment.service';
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
        createQueryRunner: () => ({
          manager: runner.manager,
          query: runner.query.bind(runner),
          release: async () => undefined,
        }),
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

    it('keeps a submission assigned to a different printed version when approving a reused code', async () => {
      const { service, assessment, version, submission } = await fixture();
      const official = await service.createVersion(7, assessment.id, {
        examCode: version.examCode,
        document: {
          ...version.document,
          questions: version.document.questions.map((q: any) => ({
            ...q,
            text: 'Đề khác nội dung',
          })),
        },
      });
      await runner.manager.update(E.AssessmentExamVersion, official.id, {
        draftSource: 'official',
      });
      const approval = await service.approveVersion(
        7,
        assessment.id,
        official.id,
        {
          expectedVersionHash: official.gradingSpecHash,
          applyTo: 'unpublished',
        },
        'approve-different-version',
      );
      expect(approval.jobIds).toEqual([]);
      await expect(
        runner.manager.findOneByOrFail(E.AssessmentSubmission, {
          id: submission.id,
        }),
      ).resolves.toMatchObject({
        examVersionId: version.id,
        inputRevision: submission.inputRevision,
      });
    });

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

    function approvalRequest(
      item: Awaited<ReturnType<typeof reviewFixture>>['item'],
    ) {
      return {
        expectedInputRevision: item.expectedInputRevision,
        expectedIdentityRevision:
          item.identityAcknowledgement.expectedIdentityRevision,
        expectedReviewRevisionId: item.expectedReviewRevisionId,
        expectedReviewHash: item.expectedReviewHash,
        expectedContextRevision: item.expectedContextRevision,
      };
    }
    it('blocks finalization until the teacher approves the current review', async () => {
      const f = await reviewFixture();
      const result = await f.service.finalize(
        7,
        f.assessment.id,
        { items: [f.item] },
        'no-teacher-approval',
      );
      expect(result.items[0]).toMatchObject({
        outcome: 'blocked',
        errorCode: 'ASSESSMENT_FINALIZATION_BLOCKED',
      });
      expect(await runner.manager.count(GradeEntry)).toBe(0);
    });
    it('publishes one grade and replays an idempotent finalize without duplicating audit', async () => {
      const f = await reviewFixture();
      const approval = approvalRequest(f.item);
      await f.service.approveReview(
        7,
        f.assessment.id,
        f.submission.id,
        approval,
      );
      await f.service.approveReview(
        7,
        f.assessment.id,
        f.submission.id,
        approval,
      );
      expect(
        await runner.manager.count(E.AssessmentReviewEvent, {
          where: { eventType: 'review_approved' },
        }),
      ).toBe(1);
      expect(
        await f.service.submissionDetail(7, f.assessment.id, f.submission.id),
      ).toMatchObject({ reviewApproved: true });
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
    it('invalidates a prior approval after the assessment context changes', async () => {
      const f = await reviewFixture();
      await f.service.approveReview(
        7,
        f.assessment.id,
        f.submission.id,
        approvalRequest(f.item),
      );
      await runner.manager.update(E.Assessment, f.assessment.id, {
        contextRevision: 2,
      });
      expect(
        await f.service.submissionDetail(7, f.assessment.id, f.submission.id),
      ).toMatchObject({ reviewApproved: false });
      const result = await f.service.finalize(
        7,
        f.assessment.id,
        {
          items: [{ ...f.item, expectedContextRevision: 2 }],
        },
        'stale-approval',
      );
      expect(result.items[0]).toMatchObject({ outcome: 'blocked' });
      expect(await runner.manager.count(GradeEntry)).toBe(0);
    });
    it('blocks approval and finalization during a queued regrade', async () => {
      const f = await reviewFixture();
      const approval = approvalRequest(f.item);
      await f.service.approveReview(
        7,
        f.assessment.id,
        f.submission.id,
        approval,
      );
      await runner.manager.update(E.AssessmentSubmission, f.submission.id, {
        processingState: 'queued',
      });
      await expect(
        f.service.approveReview(7, f.assessment.id, f.submission.id, approval),
      ).rejects.toMatchObject({ status: 409 });
      const result = await f.service.finalize(
        7,
        f.assessment.id,
        {
          items: [f.item],
        },
        'pending-regrade',
      );
      expect(result.items[0]).toMatchObject({ outcome: 'blocked' });
      expect(await runner.manager.count(GradeEntry)).toBe(0);
    });
    it('creates a manual review from sealed evidence without an extraction run', async () => {
      const f = await fixture();
      const asset = await runner.manager.save(
        E.AssessmentAsset,
        runner.manager.create(E.AssessmentAsset, {
          schoolId: f.schoolId,
          assessmentId: f.assessment.id,
          submissionId: f.submission.id,
          purpose: 'student_work',
          originalName: 'synthetic.jpg',
          declaredMime: 'image/jpeg',
          verifiedMime: 'image/jpeg',
          byteSize: 100,
          state: 'sealed',
          sealedKey: 'sealed',
          uploadExpiresAt: new Date(),
        }),
      );
      const manual = {
        expectedInputRevision: f.submission.inputRevision,
        expectedIdentityRevision: f.submission.identityRevision,
        examVersionId: f.version.id,
        expectedVersionHash: f.version.gradingSpecHash,
        reason: 'Đối chiếu ảnh gốc',
        scores: [{ questionKey: 'I.1', earnedUnits: 500 }],
      };
      await runner.manager.update(E.AssessmentSubmission, f.submission.id, {
        processingState: 'queued',
      });
      const review = await f.service.manualReview(
        7,
        f.assessment.id,
        f.submission.id,
        manual,
      );
      expect(review.effectiveResults).toEqual([
        expect.objectContaining({
          questionKey: 'I.1',
          earnedUnits: 500,
          source: 'teacher',
          sourceAssetIds: [asset.id],
        }),
      ]);
      expect(review.inputManifest.inputRevision).toBe(
        f.submission.inputRevision + 1,
      );
      expect(await runner.manager.count(E.AssessmentJob)).toBe(0);
      expect(
        await f.service.submissionDetail(7, f.assessment.id, f.submission.id),
      ).toMatchObject({
        uploadReady: true,
        reviewApproved: false,
        currentReviewRevisionId: review.id,
      });
    });
    it('rolls grade and publication back if the audit insert fails', async () => {
      const f = await reviewFixture();
      await f.service.approveReview(
        7,
        f.assessment.id,
        f.submission.id,
        approvalRequest(f.item),
      );
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
    it('reserves every file in a class upload group and refreshes a retry without duplicating the asset', async () => {
      const f = await fixture();
      const service = new AssessmentService(
        scoped,
        { assertAccess: async () => undefined } as any,
        { resolveSchoolIdForUser: async () => f.schoolId } as any,
        {
          createUpload: async () => ({
            url: 'https://storage.example/upload',
            fields: {},
            expiresAt: new Date(Date.now() + 900000).toISOString(),
          }),
          access: async () => ({
            url: 'https://storage.example/read',
            expiresAt: '',
          }),
        },
      );
      const file = {
        clientFileId: randomUUID(),
        name: 'a.jpg',
        mime: 'image/jpeg',
        byteSize: 100,
      };
      const second = { ...file, clientFileId: randomUUID(), name: 'b.jpg' };
      const group = {
        clientGroupId: randomUUID(),
        studentId: 7,
        files: [file, second],
      };
      await runner.manager.update(E.AssessmentSubmission, f.submission.id, {
        studentId: null,
      });
      const submission = await service.createSubmission(
        7,
        f.assessment.id,
        group,
      );
      const replay = await service.createSubmission(7, f.assessment.id, group);
      expect(replay.id).toBe(submission.id);
      const pending = await runner.manager.findBy(E.AssessmentAsset, {
        submissionId: submission.id,
      });
      expect(pending.map((asset) => asset.id)).toEqual(
        expect.arrayContaining([file.clientFileId, second.clientFileId]),
      );
      expect(pending).toHaveLength(2);

      const input = {
        ...file,
        submissionId: submission.id,
        purpose: 'student_work',
      };
      const firstUpload = await service.upload(7, f.assessment.id, input);
      const retry = await service.upload(7, f.assessment.id, input);
      expect(firstUpload.assetId).toBe(file.clientFileId);
      expect(retry).toMatchObject({
        assetId: firstUpload.assetId,
        state: 'uploading',
      });
      await expect(
        service.upload(7, f.assessment.id, { ...input, byteSize: 99 }),
      ).rejects.toThrow();
      await runner.manager.update(E.AssessmentAsset, file.clientFileId, {
        state: 'sealed',
      });
      await expect(
        service.upload(7, f.assessment.id, input),
      ).resolves.toMatchObject({
        assetId: file.clientFileId,
        state: 'sealed',
        upload: null,
      });
      const otherInput = {
        ...second,
        submissionId: submission.id,
        purpose: 'student_work',
      };
      await service.upload(7, f.assessment.id, otherInput);
      const complete = await service.complete(
        7,
        f.assessment.id,
        second.clientFileId,
        'first-transfer',
      );
      await runner.manager.update(E.AssessmentJob, complete.jobId, {
        state: 'failed',
        attemptCount: 3,
        lastErrorCode: 'document_mime_mismatch',
      });
      const failed = await service.submissionDetail(
        7,
        f.assessment.id,
        submission.id,
      );
      expect(failed.uploads).toContainEqual(
        expect.objectContaining({
          id: second.clientFileId,
          verificationFailed: true,
        }),
      );
      await expect(
        service.upload(7, f.assessment.id, otherInput),
      ).resolves.toMatchObject({
        assetId: second.clientFileId,
        state: 'uploading',
      });
      const retried = await service.complete(
        7,
        f.assessment.id,
        second.clientFileId,
        'second-transfer',
      );
      expect(retried.jobId).toBe(complete.jobId);
      await expect(
        runner.manager.findOneByOrFail(E.AssessmentJob, { id: complete.jobId }),
      ).resolves.toMatchObject({
        state: 'pending',
        attemptCount: 0,
      });
      await runner.manager.update(E.AssessmentAsset, second.clientFileId, {
        state: 'uploading',
      });
      const summary = await service.submissionDetail(
        7,
        f.assessment.id,
        submission.id,
      );
      expect(summary).toMatchObject({
        uploadReady: false,
        inputRevision: 1,
        uploads: expect.arrayContaining([
          expect.objectContaining({
            id: second.clientFileId,
            state: 'uploading',
          }),
        ]),
      });
      const ready = await service.upload(7, f.assessment.id, {
        submissionId: f.submission.id,
        purpose: 'student_work',
        name: 'ready.jpg',
        mime: 'image/jpeg',
        byteSize: 100,
      });
      await runner.manager.update(E.AssessmentAsset, ready.assetId, {
        state: 'sealed',
        sealedKey: 'assessment/test/ready.jpg',
      });
      const cfg = JSON.parse(
        readFileSync(
          'docs/assessment/contracts/agent-routing.example.json',
          'utf8',
        ),
      );
      jest.spyOn(routing, 'loadRouting').mockReturnValue(cfg);
      const result = await service.process(
        7,
        f.assessment.id,
        {
          readyOnly: true,
          submissionIds: [submission.id, f.submission.id],
          expectedInputRevisions: { [submission.id]: 1, [f.submission.id]: 2 },
        },
        'ready-class',
      );
      expect(result.jobIds).toHaveLength(1);
      expect(result.skipped).toEqual([submission.id]);
    });
  },
);
