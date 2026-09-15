import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GradesService } from './grades.service';
import { GradeTestType } from './entities/grade-entry.entity';
import { ParentLinkStatus } from './entities/parent-link.entity';
import { In } from 'typeorm';

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111';
const TEACHER_ID = 42; // homeroom of c1
const PRINCIPAL_ID = 99;
const SUBJECT_ID = '22222222-2222-2222-2222-222222222222';

const createRepository = (overrides: Record<string, unknown> = {}) => ({
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((value) => value),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  remove: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  save: jest.fn((value: any) => Promise.resolve({ id: 'g1', ...value })),
  update: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const classRow = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  schoolId: SCHOOL_ID,
  name: '6A',
  grade: 6,
  homeroomTeacherId: TEACHER_ID,
  active: true,
  ...over,
});

const subjectRow = () => ({
  id: SUBJECT_ID,
  schoolId: SCHOOL_ID,
  name: 'Toán',
});

const membershipRow = (studentId: number) => ({
  id: `m${studentId}`,
  classId: 'c1',
  studentId,
  leftAt: null,
  student: { id: studentId, name: `hs${studentId}`, passwordHash: 'hash' },
});

const gradeRow = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  schoolId: SCHOOL_ID,
  classId: 'c1',
  subjectId: SUBJECT_ID,
  studentId: 5,
  testType: GradeTestType.MIN15,
  coefficient: 1,
  score: 8.5,
  date: '2026-09-14',
  term: 1,
  quizSessionId: null,
  homeworkId: null,
  subject: { id: SUBJECT_ID, name: 'Toán' },
  student: { id: 5, name: 'hs5', passwordHash: 'hash' },
  ...over,
});

const createService = (overrides: Record<string, any> = {}) => {
  const repos = {
    gradeRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(gradeRow()),
    }),
    classRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(classRow()),
    }),
    subjectRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(subjectRow()),
    }),
    membershipRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(membershipRow(5)),
    }),
    assignmentRepository: createRepository(),
    linkRepository: createRepository(),
    schoolRepository: createRepository({
      findOne: jest.fn().mockResolvedValue({
        id: SCHOOL_ID,
        principalId: PRINCIPAL_ID,
      }),
    }),
    userRepository: createRepository({
      findOne: jest
        .fn()
        .mockResolvedValue({ id: TEACHER_ID, roles: ['teacher'] }),
    }),
    ...overrides,
  };
  const schoolService = {
    resolveSchoolIdForUser: jest.fn().mockResolvedValue(SCHOOL_ID),
  };
  const activityLog = {
    recordBestEffort: jest.fn().mockResolvedValue(undefined),
  };
  const service = new GradesService(
    repos.gradeRepository as any,
    repos.classRepository as any,
    repos.subjectRepository as any,
    repos.membershipRepository as any,
    repos.assignmentRepository as any,
    repos.linkRepository as any,
    repos.schoolRepository as any,
    repos.userRepository as any,
    schoolService as any,
    activityLog as any,
  );
  return { service, activityLog, schoolService, ...repos };
};

const gradeDto = (over: Record<string, unknown> = {}) =>
  ({
    classId: 'c1',
    subjectId: SUBJECT_ID,
    studentId: 5,
    testType: GradeTestType.MIN15,
    score: 8.5,
    date: '2026-09-14',
    ...over,
  }) as any;

describe('GradesService.create — access (rule D1)', () => {
  it('404s a teacher without homeroom/assignment for that subject', async () => {
    const { service } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
    });
    await expect(service.create(TEACHER_ID, gradeDto())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lets the assigned teacher of THAT subject in THAT class grade', async () => {
    const { service, gradeRepository } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
      assignmentRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 'a1' }),
      }),
    });
    const view = await service.create(TEACHER_ID, gradeDto());
    expect(view.id).toBe('g1');
    expect(gradeRepository.create).toHaveBeenCalled();
  });

  it('lets the principal create on any class', async () => {
    const { service } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
    });
    await expect(
      service.create(PRINCIPAL_ID, gradeDto()),
    ).resolves.toMatchObject({ score: 8.5 });
  });

  it('404s a class outside the resolved school', async () => {
    const { service, classRepository } = createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    });
    await expect(service.create(TEACHER_ID, gradeDto())).rejects.toThrow(
      NotFoundException,
    );
    expect(classRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'c1', schoolId: SCHOOL_ID },
    });
  });

  it('rejects a student outside the roster', async () => {
    const { service } = createService({
      membershipRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    });
    await expect(service.create(TEACHER_ID, gradeDto())).rejects.toThrow(
      /not an active member/,
    );
  });
});

describe('GradesService.create — coefficients & defaults', () => {
  it('derives the default coefficient from the test type', async () => {
    const { service, gradeRepository } = createService();
    await service.create(
      TEACHER_ID,
      gradeDto({ testType: GradeTestType.MIN45 }),
    );
    expect(gradeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        testType: GradeTestType.MIN45,
        coefficient: 2,
      }),
    );
  });

  it('honors an explicit coefficient override', async () => {
    const { service, gradeRepository } = createService();
    await service.create(
      TEACHER_ID,
      gradeDto({ testType: GradeTestType.MIN45, coefficient: 1 }),
    );
    expect(gradeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ coefficient: 1 }),
    );
  });

  it('audits the insert', async () => {
    const { service, activityLog } = createService();
    await service.create(TEACHER_ID, gradeDto());
    expect(activityLog.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'school.grade.add' }),
    );
  });
});

describe('GradesService.update / remove', () => {
  it('404s a grade id from another school', async () => {
    const { service } = createService({
      gradeRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    });
    await expect(
      service.update(TEACHER_ID, 'nope', { score: 9 }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.remove(TEACHER_ID, 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('changing test type re-derives the coefficient unless set explicitly', async () => {
    const { service, gradeRepository } = createService();
    await service.update(TEACHER_ID, 'g1', { testType: GradeTestType.FINAL });
    const saved = (gradeRepository.save as jest.Mock).mock.calls[0][0];
    expect(saved.testType).toBe(GradeTestType.FINAL);
    expect(saved.coefficient).toBe(2);
  });

  it('keeps a manual coefficient when the type also changes', async () => {
    const { service, gradeRepository } = createService();
    await service.update(TEACHER_ID, 'g1', {
      testType: GradeTestType.FINAL,
      coefficient: 1,
    });
    const saved = (gradeRepository.save as jest.Mock).mock.calls[0][0];
    expect(saved.coefficient).toBe(1);
  });

  it('remove deletes and audits', async () => {
    const { service, gradeRepository, activityLog } = createService();
    const result = await service.remove(TEACHER_ID, 'g1');
    expect(result).toEqual({ deleted: true });
    expect(gradeRepository.delete).toHaveBeenCalledWith({ id: 'g1' });
    expect(activityLog.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'school.grade.delete' }),
    );
  });
});

describe('GradesService.list — scoping', () => {
  it('principal reads the whole school without a class filter', async () => {
    const { service, gradeRepository } = createService({
      userRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue({ id: PRINCIPAL_ID, roles: ['principal'] }),
      }),
    });
    await service.list(PRINCIPAL_ID, {});
    expect(gradeRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: SCHOOL_ID },
      }),
    );
  });

  it('a plain teacher is limited to their own classes', async () => {
    const { service, gradeRepository, classRepository } = createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(classRow()),
        find: jest.fn().mockResolvedValue([{ id: 'c1' }]),
      }),
    });
    await service.list(TEACHER_ID, {});
    const where = gradeRepository.find.mock.calls[0][0].where;
    expect(where.classId).toEqual(In(['c1']));
  });

  it('teacher reading a class they do not teach → 404', async () => {
    const { service } = createService();
    await expect(
      service.list(TEACHER_ID, { classId: 'other' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('a student cannot read another student via query.studentId', async () => {
    const STUDENT_ID = 7;
    const { service, gradeRepository } = createService({
      userRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue({ id: STUDENT_ID, roles: ['student'] }),
      }),
    });
    await service.list(STUDENT_ID, { studentId: 123 });
    const where = gradeRepository.find.mock.calls[0][0].where;
    expect(where.studentId).toBe(STUDENT_ID);
  });
});

describe('GradesService.getReport', () => {
  it('one row per roster student with policy averages', async () => {
    const { service, gradeRepository } = createService({
      gradeRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(gradeRow()),
        find: jest.fn().mockResolvedValue([
          gradeRow({ id: 'g1', studentId: 5, coefficient: 1 }),
          gradeRow({
            id: 'g2',
            studentId: 5,
            testType: GradeTestType.MIN45,
            coefficient: 2,
            score: 6,
          }),
        ]),
      }),
      membershipRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(membershipRow(5)),
        find: jest.fn().mockResolvedValue([membershipRow(5), membershipRow(6)]),
      }),
    });
    const report = await service.getReport(TEACHER_ID, 'c1', SUBJECT_ID, 1);
    expect(report.className).toBe('6A');
    expect(report.rows).toHaveLength(2);
    const five = report.rows.find((r) => r.studentId === 5);
    // midterm = (8.5×1 + 6×2)/3 = 20.5/3 = 6.833… → 6.8
    expect(five?.midterm).toBe(6.8);
    expect(five?.year).toBeNull();
    const six = report.rows.find((r) => r.studentId === 6);
    expect(six?.midterm).toBeNull();
    expect(six?.entries).toHaveLength(0);
  });

  it('includes a grade owner who already left the roster', async () => {
    const { service, gradeRepository } = createService({
      gradeRepository: createRepository({
        find: jest.fn().mockResolvedValue([gradeRow({ studentId: 88 })]),
      }),
      membershipRepository: createRepository({
        find: jest.fn().mockResolvedValue([membershipRow(5)]),
      }),
    });
    const report = await service.getReport(TEACHER_ID, 'c1', SUBJECT_ID);
    expect(report.rows.map((r) => r.studentId)).toEqual([5, 88]);
  });
});

describe('GradesService student/parent views', () => {
  it('getMyGrades groups by subject × term with averages', async () => {
    const { service } = createService({
      gradeRepository: createRepository({
        find: jest.fn().mockResolvedValue([
          gradeRow({ studentId: 5, testType: GradeTestType.MIN15 }),
          gradeRow({
            id: 'g2',
            studentId: 5,
            testType: GradeTestType.FINAL,
            coefficient: 2,
            score: 9,
          }),
        ]),
      }),
    });
    const result = await service.getMyGrades(5);
    expect(result.subjects).toHaveLength(1);
    const s = result.subjects[0];
    expect(s.subjectName).toBe('Toán');
    expect(s.midterm).toBe(8.5);
    expect(s.final).toBe(9);
    expect(s.year).toBe(8.7); // (8.5×2 + 9)/3 = 26/3 = 8.666 → 8.7
    // peer query trả đúng điểm của em — tự xếp hạng 1/1
    expect(s.rank).toBe(1);
    expect(s.rankedCount).toBe(1);
  });

  it('getMyGrades ranks the student against classmates in the same subject+term', async () => {
    const own = [gradeRow({ id: 'g1', studentId: 5, score: 8 })];
    // bạn 6 điểm 9 → hạng nhất; em 8 → hạng nhì; bạn 7 chưa có điểm HK này
    const peers = [...own, gradeRow({ id: 'g2', studentId: 6, score: 9 })];
    const { service, gradeRepository } = createService({
      gradeRepository: createRepository({
        find: jest
          .fn()
          .mockResolvedValueOnce(own) // GET /grades/me entries of student 5
          .mockResolvedValueOnce(peers), // rankWithinClass peers
      }),
    });
    const result = await service.getMyGrades(5);
    const s = result.subjects[0];
    expect(s.rank).toBe(2);
    expect(s.rankedCount).toBe(2);
    // peer lookup được tenant-scope đầy đủ (rule D1)
    const peerWhere = gradeRepository.find.mock.calls[1][0].where;
    expect(peerWhere).toEqual({
      schoolId: SCHOOL_ID,
      classId: 'c1',
      subjectId: SUBJECT_ID,
      term: 1,
    });
  });

  it('parent gate: 404 without a link, 400 while pending', async () => {
    const { service } = createService();
    await expect(service.getChildGrades(50, 5)).rejects.toThrow(
      NotFoundException,
    );
    const { service: s2 } = createService({
      linkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({
          id: 'l1',
          parentId: 50,
          studentId: 5,
          schoolId: SCHOOL_ID,
          status: ParentLinkStatus.PENDING,
        }),
      }),
    });
    await expect(s2.getChildGrades(50, 5)).rejects.toThrow(BadRequestException);
  });

  it('parent reads approved child grades scoped to the link school', async () => {
    const { service, gradeRepository } = createService({
      linkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({
          id: 'l1',
          parentId: 50,
          studentId: 5,
          schoolId: SCHOOL_ID,
          status: ParentLinkStatus.APPROVED,
        }),
      }),
      gradeRepository: createRepository({
        find: jest.fn().mockResolvedValue([gradeRow()]),
      }),
    });
    const result = await service.getChildGrades(50, 5);
    expect(gradeRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: SCHOOL_ID, studentId: 5 },
      }),
    );
    expect(result.subjects[0].entries[0].studentName).toBe('hs5');
    // password hashes never serialize
    expect(JSON.stringify(result)).not.toContain('hash');
  });
});

describe('GradesService.getClassRanking', () => {
  const rankingFixtures = (
    entries: Record<string, unknown>[],
    members: number[] = [5, 6, 7],
    classOver: Record<string, unknown> = {},
  ) =>
    createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(classRow(classOver)),
      }),
      gradeRepository: createRepository({
        find: jest.fn().mockResolvedValue(entries.map((e) => gradeRow(e))),
      }),
      membershipRepository: createRepository({
        find: jest
          .fn()
          .mockResolvedValue(members.map((id) => membershipRow(id))),
      }),
    });

  it('ranks a subject by scoreFor with competition ties (1,1,3) and sinks ungraded students', async () => {
    const { service } = rankingFixtures(
      [
        { id: 'g1', studentId: 5, score: 9 },
        { id: 'g2', studentId: 6, score: 9 },
        { id: 'g3', studentId: 7, score: 7 },
      ],
      [5, 6, 7, 8],
    );
    const result = await service.getClassRanking(TEACHER_ID, {
      classId: 'c1',
      subjectId: SUBJECT_ID,
    });
    expect(result.subjectName).toBe('Toán');
    expect(result.term).toBeNull();
    expect(result.rankedCount).toBe(3);
    expect(result.unrankedCount).toBe(1); // HS 8 trong roster, chưa có điểm
    expect(result.rows).toHaveLength(4);
    expect(result.rows.map((r) => [r.studentId, r.rank])).toEqual([
      [5, 1],
      [6, 1],
      [7, 3],
      [8, null],
    ]);
    const tail = result.rows[3];
    expect(tail.average).toBeNull();
  });

  it('prefers the year average and includes students who left the roster', async () => {
    const { service, membershipRepository } = createService({
      gradeRepository: createRepository({
        find: jest.fn().mockResolvedValue([
          // s5: midterm 9 + final 7 → year 8.3 ; s6: chỉ midterm 8.5
          gradeRow({ id: 'g1', studentId: 5, score: 9 }),
          gradeRow({
            id: 'g2',
            studentId: 5,
            testType: GradeTestType.FINAL,
            coefficient: 2,
            score: 7,
          }),
          gradeRow({ id: 'g3', studentId: 6, score: 8.5 }),
        ]),
      }),
      membershipRepository: createRepository({
        find: jest.fn().mockResolvedValue([membershipRow(5)]),
      }),
    });
    const result = await service.getClassRanking(TEACHER_ID, {
      classId: 'c1',
      subjectId: SUBJECT_ID,
    });
    // s5 dùng YEAR 8.3 < giữa kỳ 8.5 của s6 → s6 hạng 1 (không phải 9!1)
    expect(result.rows.map((r) => [r.studentId, r.average, r.rank])).toEqual([
      [6, 8.5, 1],
      [5, 8.3, 2],
    ]);
    expect(membershipRepository.find).toHaveBeenCalled();
  });

  it('class-wide ranking averages each subject score, rounded to 1 decimal', async () => {
    const { service } = rankingFixtures([
      // s5: Toán 9 + Hóa 7 → trung bình môn 8.0
      gradeRow({ id: 'g1', studentId: 5, score: 9 }),
      gradeRow({
        id: 'g2',
        studentId: 5,
        subjectId: 'subj-hoa',
        subject: { id: 'subj-hoa', name: 'Hóa' },
        score: 7,
      }),
      // s6: chỉ có Toán 8 → 8.0 (đồng hạng với s5)
      gradeRow({ id: 'g3', studentId: 6, score: 8 }),
    ]);
    const result = await service.getClassRanking(TEACHER_ID, {
      classId: 'c1',
    });
    expect(result.subjectId).toBeNull();
    expect(result.subjectName).toBeNull();
    expect(result.rows.map((r) => [r.studentId, r.average, r.rank])).toEqual([
      [5, 8, 1],
      [6, 8, 1],
      [7, null, null],
    ]);
    expect(result.rankedCount).toBe(2);
  });

  it('pushes term down into the grade query', async () => {
    const { service, gradeRepository } = rankingFixtures([]);
    await service.getClassRanking(TEACHER_ID, {
      classId: 'c1',
      subjectId: SUBJECT_ID,
      term: 2,
    });
    expect(gradeRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: SCHOOL_ID,
          classId: 'c1',
          subjectId: SUBJECT_ID,
          term: 2,
        },
      }),
    );
  });

  it('404s a subject-scoped ranking the teacher has no write access to (D1)', async () => {
    const { service } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
    });
    await expect(
      service.getClassRanking(TEACHER_ID, {
        classId: 'c1',
        subjectId: SUBJECT_ID,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('class-wide ranking is homeroom/principal/ADMIN only — a subject teacher is 404', async () => {
    const { service } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
      assignmentRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 'a1' }), // có dạy môn ở lớp
      }),
    });
    await expect(
      service.getClassRanking(TEACHER_ID, { classId: 'c1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('principal and ADMIN may read the class-wide ranking', async () => {
    const { service } = rankingFixtures(
      [{ id: 'g1', studentId: 5, score: 9 }],
      undefined,
      { homeroomTeacherId: 777 },
    );
    await expect(
      service.getClassRanking(PRINCIPAL_ID, { classId: 'c1' }),
    ).resolves.toMatchObject({ className: '6A', rankedCount: 1 });

    const adminView = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
      userRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 3, roles: ['admin'] }),
      }),
    });
    await expect(
      adminView.service.getClassRanking(3, { classId: 'c1' }),
    ).resolves.toMatchObject({ rankedCount: 0 });
  });

  it('404s a class outside the resolved school for class-wide ranking (D1)', async () => {
    const { service, classRepository } = createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    });
    await expect(
      service.getClassRanking(TEACHER_ID, { classId: 'c1' }),
    ).rejects.toThrow(NotFoundException);
    expect(classRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'c1', schoolId: SCHOOL_ID },
    });
  });
});
