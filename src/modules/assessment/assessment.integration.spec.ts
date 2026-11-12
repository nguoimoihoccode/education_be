import * as externalText from './runtime/external-text';
import { gradeReleasedText } from './runtime/external-text-worker';
import * as inference from './runtime/inference';
import { DOCX_MIME } from './runtime/storage';
import * as routing from './runtime/routing';
import { readFileSync } from 'node:fs';
import { DataSource, QueryRunner } from 'typeorm';
import { createHash, randomUUID } from 'node:crypto';
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
    it('imports official Word once per content and code, with a durable draft and provenance', async () => {
      const { service, schoolId, assessment, version } = await fixture();
      const bytes = Buffer.from('fixture input');
      const upload = () =>
        runner.manager.save(
          E.AssessmentAsset,
          runner.manager.create(E.AssessmentAsset, {
            schoolId,
            assessmentId: assessment.id,
            purpose: 'marking_guide',
            originalName: 'guide.docx',
            declaredMime: DOCX_MIME,
            verifiedMime: DOCX_MIME,
            byteSize: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            state: 'sealed',
            sealedKey: 'test-sealed-docx',
            uploadExpiresAt: new Date(),
          }),
        );
      const first = await upload();
      const second = await upload();
      await expect(
        service.assetStatus(7, assessment.id, first.id),
      ).resolves.toMatchObject({ state: 'sealed' });
      const command = await service.importExam(
        7,
        assessment.id,
        { assetId: first.id, examCode: '101' },
        'first',
      );
      await expect(
        service.importExam(
          7,
          assessment.id,
          { assetId: second.id, examCode: '101' },
          'second',
        ),
      ).resolves.toEqual(command);
      const other = await service.importExam(
        7,
        assessment.id,
        { assetId: second.id, examCode: '102' },
        'other-code',
      );
      expect(other.jobId).not.toBe(command.jobId);
      const parser = jest
        .spyOn(inference, 'importOfficialExam')
        .mockResolvedValue({
          document: version.document,
          warnings: ['Chưa thấy mã in'],
          source: { 'docx-I.1': 'Đáp án: A' },
        });
      const job = await runner.manager.findOneByOrFail(E.AssessmentJob, {
        id: command.jobId,
      });
      job.state = 'running';
      job.leaseToken = randomUUID();
      job.leaseUntil = new Date(Date.now() + 60000);
      await runner.manager.save(job);
      const storage = { read: jest.fn().mockResolvedValue(bytes) };
      const processor = new AssessmentProcessor(
        scoped,
        storage as any,
        {} as any,
        '/tmp',
      );
      await processor.process(job);
      const replay = await runner.manager.findOneByOrFail(E.AssessmentJob, {
        id: job.id,
      });
      await processor.process(replay);
      expect(parser).toHaveBeenCalledTimes(1);
      const result = await service.getExamImport(7, assessment.id, job.id);
      expect(result).toMatchObject({
        versionId: expect.any(String),
        source: { 'docx-I.1': 'Đáp án: A' },
      });
      const draft = await service.version(7, assessment.id, result.versionId);
      expect(draft).toMatchObject({
        state: 'draft',
        draftSource: 'official',
        versionNumber: 2,
      });
      const revision = await service.createVersion(7, assessment.id, {
        examCode: '101',
        document: draft.document,
        sourceVersionId: draft.id,
      });
      expect(revision).toMatchObject({
        draftSource: 'official',
        versionNumber: 3,
      });
      const detail = await service.detail(7, assessment.id);
      expect(
        detail.examVersions.find((item) => item.id === revision.id)
          ?.sourceImportJobId,
      ).toBe(job.id);
    });

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
    it.each([false, true])(
      'checks the exact released text and revocation before provider access (revoked=%s)',
      async (revoked) => {
        const f = await reviewFixture();
        jest.replaceProperty(process, 'env', {
          ...process.env,
          ASSESSMENT_EXTERNAL_GRADING_ENABLED: 'true',
          ASSESSMENT_EXTERNAL_GRADING_POLICY: 'pilot-v1',
          ASSESSMENT_EXTERNAL_GRADING_ASSESSMENT_IDS: f.assessment.id,
        });
        jest
          .spyOn(routing, 'loadRouting')
          .mockReturnValue(
            JSON.parse(
              readFileSync(
                'docs/assessment/contracts/agent-routing.example.json',
                'utf8',
              ),
            ),
          );
        const question = {
          questionKey: 'I.1',
          text: 'Đề bài',
          kind: 'rubric_text',
          maxUnits: 1000,
          criteria: [
            {
              id: 'original',
              maxUnits: 1000,
              description: 'Đúng nguyên lý',
              levels: [
                { pointsUnits: 0, description: 'Sai' },
                { pointsUnits: 1000, description: 'Đúng' },
              ],
            },
          ],
        };
        const m = runner.manager;
        const document = { ...f.version.document, questions: [question] };
        const version = await m.save(
          E.AssessmentExamVersion,
          m.create(E.AssessmentExamVersion, {
            ...f.version,
            id: randomUUID(),
            versionNumber: 2,
            document,
            gradingSpecHash: hash(document),
            questionContentHash: hash(document.questions),
          }),
        );
        const review = await m.save(
          E.AssessmentReviewRevision,
          m.create(E.AssessmentReviewRevision, {
            ...f.review,
            id: randomUUID(),
            revisionNumber: 2,
            examVersionId: version.id,
            createdBy: null,
            inputManifest: {
              ...f.review.inputManifest,
              examVersionId: version.id,
            },
          }),
        );
        await m.update(E.AssessmentSubmission, f.submission.id, {
          examVersionId: version.id,
          currentReviewRevisionId: review.id,
        });
        const answer = await m.save(
          E.AssessmentAnswerRevision,
          m.create(E.AssessmentAnswerRevision, {
            id: f.submission.currentAnswerRevisionIds[question.questionKey],
            schoolId: f.schoolId,
            assessmentId: f.assessment.id,
            submissionId: f.submission.id,
            examVersionId: version.id,
            questionKey: question.questionKey,
            revisionNumber: 1,
            observationState: 'readable',
            content: { text: 'Cơ cấu truyền chuyển động.' },
            sourceRegionIds: ['local-region'],
            origin: 'reader',
            contentHash: hash('Cơ cấu truyền chuyển động.'),
          }),
        );
        const outbound = jest
          .spyOn(externalText, 'requestExternalTextGrade')
          .mockResolvedValue({
            criteria: [
              { id: 'c1', earnedUnits: 1000, reason: 'Đúng nguyên lý.' },
            ],
          });
        const preview = await f.service.externalTextPreview(
          7,
          f.assessment.id,
          f.submission.id,
        );
        expect(preview.items).toHaveLength(1);
        await expect(
          f.service.releaseExternalText(
            7,
            f.assessment.id,
            f.submission.id,
            {
              expectedInputRevision: 1,
              hashes: { 'I.1': 'different' },
            },
            'invalid-payload',
          ),
        ).rejects.toThrow();
        const { jobId } = await f.service.releaseExternalText(
          7,
          f.assessment.id,
          f.submission.id,
          {
            expectedInputRevision: 1,
            hashes: { 'I.1': preview.items[0].hash },
          },
          'valid-payload',
        );
        const job = await m.findOneByOrFail(E.AssessmentJob, { id: jobId });
        job.state = 'running';
        job.leaseToken = randomUUID();
        job.leaseUntil = new Date(Date.now() + 60000);
        await m.save(job);
        if (revoked)
          await f.service.revokeExternalText(
            7,
            f.assessment.id,
            f.submission.id,
            { expectedInputRevision: 1 },
            'revoke',
          );
        const objects = new Map<string, Buffer>();
        const storage = {
          put: async (key: string, bytes: Buffer) => objects.set(key, bytes),
          read: async (key: string) => objects.get(key)!,
        };
        const grade = () =>
          gradeReleasedText(scoped, storage as any, job, answer, question);
        if (revoked) {
          await expect(grade()).resolves.toBeNull();
          expect(outbound).not.toHaveBeenCalled();
        } else {
          await expect(grade()).resolves.toEqual([
            {
              criterionId: 'original',
              pointsUnits: 1000,
              reason: 'Đúng nguyên lý.',
              evidenceRegionIds: ['local-region'],
            },
          ]);
          await expect(grade()).resolves.toHaveLength(1);
          expect(outbound).toHaveBeenCalledTimes(1);
          expect(outbound).toHaveBeenCalledWith(
            preview.items[0].payload,
            'pilot-v1',
          );
        }
      },
    );

    it('preserves a valid earlier external score when a later run has no release for that question', async () => {
      const f = await fixture();
      jest.replaceProperty(process, 'env', {
        ...process.env,
        ASSESSMENT_EXTERNAL_GRADING_ENABLED: 'true',
        ASSESSMENT_EXTERNAL_GRADING_POLICY: 'pilot-v1',
        ASSESSMENT_EXTERNAL_GRADING_ASSESSMENT_IDS: f.assessment.id,
      });
      const m = runner.manager;
      const scope = { schoolId: f.schoolId, assessmentId: f.assessment.id };
      const questions = ['I.1', 'II.1'].map((questionKey) => ({
        questionKey,
        kind: 'rubric_text',
        text: 'Nêu nguyên lý',
        maxUnits: 500,
        sourceRegionIds: [],
        acceptedAnswerForms: ['text'],
        criteria: [
          {
            id: 'criterion',
            description: 'Đúng nguyên lý',
            maxUnits: 500,
            levels: [
              { pointsUnits: 0, description: 'Sai' },
              { pointsUnits: 500, description: 'Đúng' },
            ],
          },
        ],
      }));
      const document = { ...f.version.document, questions };
      const version = await m.save(
        E.AssessmentExamVersion,
        m.create(E.AssessmentExamVersion, {
          ...f.version,
          id: randomUUID(),
          versionNumber: 2,
          document,
          gradingSpecHash: hash(document),
          questionContentHash: hash(questions),
        }),
      );
      const answers = await Promise.all(
        questions.map((question) =>
          m.save(
            E.AssessmentAnswerRevision,
            m.create(E.AssessmentAnswerRevision, {
              ...scope,
              submissionId: f.submission.id,
              examVersionId: version.id,
              questionKey: question.questionKey,
              revisionNumber: 1,
              observationState: 'readable',
              content: { text: 'Truyền chuyển động.' },
              sourceRegionIds: ['region'],
              origin: 'reader',
              contentHash: hash(question.questionKey),
            }),
          ),
        ),
      );
      const manifest = {
        inputRevision: 1,
        examVersionId: version.id,
        answerRevisionIds: Object.fromEntries(
          answers.map((answer) => [answer.questionKey, answer.id]),
        ),
      };
      const oldResult = {
        questionKey: 'I.1',
        earnedUnits: 500,
        maxUnits: 500,
        source: 'ai',
        externalTextPolicy: 'pilot-v1',
        answerRevisionId: answers[0].id,
        sourceRegionIds: ['region'],
      };
      const previous = await m.save(
        E.AssessmentReviewRevision,
        m.create(E.AssessmentReviewRevision, {
          ...scope,
          submissionId: f.submission.id,
          revisionNumber: 1,
          examVersionId: version.id,
          inputManifest: manifest,
          effectiveResults: [oldResult],
          flags: [],
          earnedUnits: 500,
          ungradedMaxUnits: 500,
          contentHash: hash(oldResult),
          createdBy: null,
        }),
      );
      const asset = await m.save(
        E.AssessmentAsset,
        m.create(E.AssessmentAsset, {
          ...scope,
          submissionId: f.submission.id,
          purpose: 'student_work',
          originalName: 'synthetic.jpg',
          declaredMime: 'image/jpeg',
          verifiedMime: 'image/jpeg',
          byteSize: 10,
          state: 'sealed',
          sealedKey: 'synthetic',
          uploadExpiresAt: new Date(),
        }),
      );
      const primaryPolygon = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      const page = await m.save(
        E.AssessmentPage,
        m.create(E.AssessmentPage, {
          ...scope,
          submissionId: f.submission.id,
          assetId: asset.id,
          sourcePageNumber: 1,
          analysisRevision: 1,
          widthPx: 100,
          heightPx: 100,
          analysisObjectKey: 'synthetic',
          pageRole: 'mixed',
          primaryPolygon,
          transformToOriginal: {},
          quality: {
            privacyRevision: 1,
            reader: {
              pageRole: 'mixed',
              primaryPolygon,
              examCode: version.examCode,
              questionFragments: questions,
              regions: [],
            },
          },
        }),
      );
      await m.update(E.AssessmentSubmission, f.submission.id, {
        examVersionId: version.id,
        currentPageIds: [page.id],
        currentAnswerRevisionIds: manifest.answerRevisionIds,
        currentReviewRevisionId: previous.id,
      });
      const job = await m.save(
        E.AssessmentJob,
        m.create(E.AssessmentJob, {
          ...scope,
          submissionId: f.submission.id,
          stage: 'grade',
          scopeKey: f.submission.id,
          inputHash: hash('subset'),
          data: { inputRevision: 1 },
          state: 'running',
          nextAttemptAt: new Date(),
          routingPolicyHash: 'local',
          producerAgent: 'test',
          leaseToken: randomUUID(),
          leaseUntil: new Date(Date.now() + 60000),
        }),
      );
      const provider = jest.spyOn(AssessmentModels.prototype, 'json');
      await new AssessmentProcessor(
        scoped,
        {} as any,
        {
          execution: { pauseBelowFreeDiskGiB: 0 },
        } as any,
        '/tmp/assessment-integration-workspace',
      ).process(job);
      expect(provider).not.toHaveBeenCalled();
      const current = await m.findOneByOrFail(E.AssessmentSubmission, {
        id: f.submission.id,
      });
      const review = await m.findOneByOrFail(E.AssessmentReviewRevision, {
        id: current.currentReviewRevisionId!,
      });
      expect(review.effectiveResults[0]).toEqual(oldResult);
      expect(review.flags).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            questionKey: 'I.1',
            code: 'insufficient_evidence',
          }),
        ]),
      );
    });

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
    it.each([
      'existing',
      'appears',
      'missing',
      'official match',
      'official conflict',
      'official manual',
      'official manual conflict',
    ])(
      'processes a synthetic image with the exam draft %s and only pays for a new draft',
      async (versionState) => {
        const f = await fixture();
        if (versionState.startsWith('official')) {
          await runner.manager.update(E.AssessmentExamVersion, f.version.id, {
            draftSource: 'official',
          });
        }
        if (
          versionState !== 'existing' &&
          !versionState.startsWith('official manual')
        ) {
          await runner.manager.update(E.AssessmentSubmission, f.submission.id, {
            examVersionId: null,
          });
        }
        if (versionState === 'appears') {
          // Reproduce the first lookup missing a version published before the worker owns drafting.
          const findOne = runner.manager.findOne.bind(runner.manager);
          let missed = false;
          jest
            .spyOn(runner.manager, 'findOne')
            .mockImplementation((entity, options) => {
              if (entity === E.AssessmentExamVersion && !missed) {
                missed = true;
                return Promise.resolve(null);
              }
              return findOne(entity, options);
            });
        }
        if (versionState === 'missing') {
          await runner.manager.delete(E.AssessmentExamVersion, f.version.id);
        }
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
            data: {
              inputRevision: 1,
              ...(versionState.startsWith('official manual')
                ? { manualExamVersionId: f.version.id }
                : {}),
            },
            state: 'running',
            nextAttemptAt: new Date(),
            routingPolicyHash: 'test',
            producerAgent: 'test',
            leaseToken: randomUUID(),
            leaseUntil: new Date(Date.now() + 180000),
          }),
        );
        const readerOutput = {
          pageRole: 'mixed',
          primaryPolygon: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
          examCode: '101',
          questionFragments:
            versionState === 'official manual'
              ? []
              : [
                  {
                    questionKey: 'I.1',
                    text: versionState.endsWith('conflict')
                      ? 'Khác đề đã phát'
                      : 'Q',
                    ...(versionState.startsWith('official')
                      ? { options: f.version.document.questions[0].options }
                      : {}),
                  },
                ],
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
        };
        const draftScope = `assessment-template:${f.schoolId}:${f.assessment.id}:101`;
        const models = jest
          .spyOn(AssessmentModels.prototype, 'json')
          .mockImplementation(async (_job, role) => {
            if (role === 'privacy_layout')
              return {
                safeToRead: true,
                primaryPolygon: readerOutput.primaryPolygon,
                redactions: [],
              };
            if (role === 'image_reader') return readerOutput;
            if (role !== 'key_builder' || versionState !== 'missing')
              throw new Error('duplicate_provider_call');
            const otherWorker = db.createQueryRunner();
            try {
              const [{ acquired }] = await otherWorker.query(
                'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
                [draftScope],
              );
              if (acquired) {
                await otherWorker.query(
                  'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
                  [draftScope],
                );
              }
              expect(acquired).toBe(false);
            } finally {
              await otherWorker.release();
            }
            return f.version.document;
          });
        const work = new AssessmentProcessor(
          scoped,
          storage as any,
          cfg as any,
          '/tmp/assessment-integration-workspace',
        ).process(job);
        if (versionState.endsWith('conflict')) {
          await expect(work).rejects.toThrow('exam_code_conflict');
          const blocked = await runner.manager.findOneByOrFail(
            E.AssessmentSubmission,
            { id: f.submission.id },
          );
          expect(blocked.currentReviewRevisionId).toBeNull();
          expect(blocked.currentPageIds).toHaveLength(1);
          expect(models.mock.calls.map((call) => call[1])).toEqual([
            'privacy_layout',
            'image_reader',
          ]);
          return;
        }
        await work;
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
        expect(models.mock.calls.map((call) => call[1])).toEqual(
          versionState === 'missing'
            ? ['privacy_layout', 'image_reader', 'key_builder']
            : ['privacy_layout', 'image_reader'],
        );
        if (versionState === 'missing') {
          expect(review.effectiveResults).toEqual([
            expect.objectContaining({ questionKey: 'I.1', earnedUnits: null }),
          ]);
          expect(review.ungradedMaxUnits).toBe(1000);
          const [{ acquired }] = await runner.query(
            'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
            [draftScope],
          );
          expect(acquired).toBe(true);
          const [{ released }] = await runner.query(
            'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released',
            [draftScope],
          );
          expect(released).toBe(true);
          const locks = await runner.query(
            "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()",
          );
          expect(locks).toHaveLength(0);
        } else {
          expect(review.earnedUnits).toBe(1000);
          expect(review.ungradedMaxUnits).toBe(0);
        }
      },
      30000,
    );
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
