import { AssessmentService } from './assessment.service';
import * as E from './entities/assessment.entities';

describe('authenticated assessment artifact reads', () => {
  const previousEnabled = process.env.ASSESSMENT_ENABLED;
  const scope = { schoolId: 'school', assessmentId: 'exam' };
  const assessment = {
    id: 'exam',
    schoolId: 'school',
    classId: 'class',
    subjectId: 'subject',
  };
  let service: AssessmentService;
  let rows: Map<unknown, any>;
  let read: jest.Mock;
  let access: jest.Mock;
  let authorize: jest.Mock;

  beforeEach(() => {
    process.env.ASSESSMENT_ENABLED = 'true';
    rows = new Map<unknown, any>([
      [E.Assessment, assessment],
      [E.AssessmentSubmission, { ...scope, id: 'submission' }],
      [
        E.AssessmentAsset,
        {
          ...scope,
          id: 'asset',
          submissionId: 'submission',
          state: 'sealed',
          sealedKey: 'assessment/school/exam/sealed/asset/hash',
          verifiedMime: 'image/jpeg',
          byteSize: 5,
        },
      ],
      [
        E.AssessmentPage,
        {
          ...scope,
          id: 'page',
          assetId: 'asset',
          submissionId: 'submission',
          analysisObjectKey: 'assessment/school/exam/analysis/page.jpg',
          quality: {
            originalAnalysisKey:
              'assessment/school/exam/analysis-source/page.jpg',
          },
        },
      ],
      [
        E.AssessmentExport,
        {
          ...scope,
          id: 'report',
          format: 'pdf',
          state: 'completed',
          outputObjectKey: 'assessment/school/exam/exports/report.pdf',
          expiresAt: new Date(Date.now() + 60000),
          snapshotManifest: {
            publications: [{ publicationId: 'publication' }],
          },
        },
      ],
    ]);
    read = jest.fn().mockResolvedValue(Buffer.from('paper'));
    access = jest.fn();
    authorize = jest.fn();
    service = new AssessmentService(
      {
        manager: {
          findOne: jest.fn(async (entity) => rows.get(entity) ?? null),
          findBy: jest.fn(async () => [
            { id: 'publication', submissionId: 'submission' },
          ]),
          countBy: jest.fn(async () =>
            rows.has(E.AssessmentSubmission) ? 1 : 0,
          ),
        },
      } as any,
      { assertAccess: authorize } as any,
      { resolveSchoolIdForUser: async () => 'school' } as any,
      { read, access } as any,
    );
  });

  afterEach(() => {
    if (previousEnabled === undefined) delete process.env.ASSESSMENT_ENABLED;
    else process.env.ASSESSMENT_ENABLED = previousEnabled;
  });

  it('keeps legacy access descriptors authenticated and returns bytes only through content reads', async () => {
    await expect(
      service.assetAccess(7, 'exam', 'asset'),
    ).resolves.toMatchObject({
      url: '/assessments/exam/assets/asset/content',
      requiresAuth: true,
    });
    await expect(
      service.pageAccess(7, 'exam', 'page', true),
    ).resolves.toMatchObject({
      url: '/assessments/exam/pages/page/content?source=original',
      requiresAuth: true,
    });
    await expect(
      service.exportAccess(7, 'exam', 'report'),
    ).resolves.toMatchObject({
      url: '/assessments/exam/exports/report/content',
      requiresAuth: true,
    });
    expect(access).not.toHaveBeenCalled();
    const content = await service.assetContent(7, 'exam', 'asset');
    expect(content.bytes).toEqual(Buffer.from('paper'));
    expect(content.mime).toBe('image/jpeg');
    expect(read).toHaveBeenCalledWith(
      'assessment/school/exam/sealed/asset/hash',
      5,
    );
    expect(authorize).toHaveBeenCalledTimes(4);
  });

  it('rechecks authorization and deleted submissions before reading originals or derivatives', async () => {
    authorize.mockRejectedValueOnce(new Error('permission revoked'));
    await expect(service.assetContent(7, 'exam', 'asset')).rejects.toThrow(
      'permission revoked',
    );
    rows.delete(E.AssessmentSubmission);
    await expect(service.assetContent(7, 'exam', 'asset')).rejects.toThrow();
    await expect(service.pageContent(7, 'exam', 'page')).rejects.toThrow();
    await expect(service.exportContent(7, 'exam', 'report')).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses expired reports, unsealed sources and keys outside the current assessment', async () => {
    rows.get(E.AssessmentExport).expiresAt = new Date(Date.now() - 1000);
    await expect(service.exportContent(7, 'exam', 'report')).rejects.toThrow();
    rows.get(E.AssessmentAsset).state = 'purged';
    await expect(service.pageContent(7, 'exam', 'page')).rejects.toThrow();
    rows.get(E.AssessmentAsset).state = 'sealed';
    rows.get(E.AssessmentAsset).sealedKey =
      'assessment/school/other-exam/sealed/asset';
    await expect(service.assetContent(7, 'exam', 'asset')).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
