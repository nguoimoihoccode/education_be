import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HomeworkService } from './homework.service';
import { HomeworkTargetType } from './entities/homework-assignment.entity';
import { GradeTestType } from './entities/grade-entry.entity';
import { ParentLinkStatus } from './entities/parent-link.entity';
import { In } from 'typeorm';

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111';
const TEACHER_ID = 42; // homeroom of c1
const PRINCIPAL_ID = 99;
const SUBJECT_ID = '22222222-2222-2222-2222-222222222222';
const QUIZ_ID = '33333333-3333-3333-3333-333333333333';

const createRepository = (overrides: Record<string, unknown> = {}) => ({
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((value) => value),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  remove: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  save: jest.fn((value: any) => Promise.resolve({ id: 'h1', ...value })),
  update: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const classRow = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  schoolId: SCHOOL_ID,
  name: '6A',
  homeroomTeacherId: TEACHER_ID,
  active: true,
  ...over,
});

const subjectRow = () => ({
  id: SUBJECT_ID,
  schoolId: SCHOOL_ID,
  name: 'Toán',
});

const membershipRow = (studentId = 5, over: Record<string, unknown> = {}) => ({
  id: `m${studentId}`,
  classId: 'c1',
  studentId,
  leftAt: null,
  ...over,
});

const homeworkRow = (over: Record<string, unknown> = {}) => ({
  id: 'h1',
  schoolId: SCHOOL_ID,
  classId: 'c1',
  subjectId: SUBJECT_ID,
  teacherId: TEACHER_ID,
  title: 'Trắc nghiệm Chương I',
  dueDate: new Date('2026-09-20T19:00:00Z'),
  targetType: HomeworkTargetType.QUIZ,
  targetId: QUIZ_ID,
  countsAsGrade: true,
  subject: { id: SUBJECT_ID, name: 'Toán' },
  schoolClass: { id: 'c1', name: '6A' },
  teacher: {
    id: TEACHER_ID,
    name: 'Thầy Hùng',
    email: 'h@school.vn',
    passwordHash: 'hash',
  },
  ...over,
});

const createService = (overrides: Record<string, any> = {}) => {
  const repos = {
    homeworkRepository: createRepository(),
    gradeRepository: createRepository(),
    classRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(classRow()),
    }),
    subjectRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(subjectRow()),
    }),
    membershipRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(membershipRow()),
      find: jest.fn().mockResolvedValue([membershipRow()]),
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
    quizRepository: createRepository({
      findOne: jest.fn().mockResolvedValue({ id: QUIZ_ID }),
    }),
    deckRepository: createRepository(),
    ...overrides,
  };
  const schoolService = {
    resolveSchoolIdForUser: jest.fn().mockResolvedValue(SCHOOL_ID),
  };
  const activityLog = {
    recordBestEffort: jest.fn().mockResolvedValue(undefined),
  };
  const service = new HomeworkService(
    repos.homeworkRepository as any,
    repos.gradeRepository as any,
    repos.classRepository as any,
    repos.subjectRepository as any,
    repos.membershipRepository as any,
    repos.assignmentRepository as any,
    repos.linkRepository as any,
    repos.schoolRepository as any,
    repos.userRepository as any,
    repos.quizRepository as any,
    repos.deckRepository as any,
    schoolService as any,
    activityLog as any,
  );
  return { service, activityLog, ...repos };
};

const homeworkDto = (over: Record<string, unknown> = {}) =>
  ({
    classId: 'c1',
    subjectId: SUBJECT_ID,
    title: 'Trắc nghiệm Chương I',
    dueDate: '2026-09-20T19:00:00.000Z',
    targetType: HomeworkTargetType.QUIZ,
    targetId: QUIZ_ID,
    countsAsGrade: true,
    ...over,
  }) as any;

describe('HomeworkService.create', () => {
  it('persists a quiz homework + audits the assignment', async () => {
    const { service, homeworkRepository, activityLog } = createService();
    const view = await service.create(TEACHER_ID, homeworkDto());
    expect(homeworkRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        classId: 'c1',
        teacherId: TEACHER_ID,
        countsAsGrade: true,
      }),
    );
    expect(view.subjectName).toBe('Toán');
    expect(activityLog.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'school.homework.assign' }),
    );
  });

  it('countsAsGrade only ever means something for quizzes — forced false for decks', async () => {
    const { service, homeworkRepository } = createService({
      deckRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 'd1' }),
      }),
    });
    await service.create(
      TEACHER_ID,
      homeworkDto({
        targetType: HomeworkTargetType.DECK,
        targetId: 'd1',
        countsAsGrade: true,
      }),
    );
    expect(homeworkRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ countsAsGrade: false }),
    );
  });

  it('rejects a quiz id that does not exist', async () => {
    const { service } = createService({
      quizRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    });
    await expect(service.create(TEACHER_ID, homeworkDto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('404s a teacher who neither homerooms nor teaches that subject', async () => {
    const { service } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
    });
    await expect(service.create(TEACHER_ID, homeworkDto())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lets the principal assign to any class', async () => {
    const { service } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
    });
    await expect(
      service.create(PRINCIPAL_ID, homeworkDto()),
    ).resolves.toMatchObject({ title: 'Trắc nghiệm Chương I' });
  });
});

describe('HomeworkService.listForStaff', () => {
  it('teacher is scoped to their own classes', async () => {
    const { service, homeworkRepository, classRepository } = createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(classRow()),
        find: jest.fn().mockResolvedValue([{ id: 'c1' }]),
      }),
    });
    await service.listForStaff(TEACHER_ID);
    const where = homeworkRepository.find.mock.calls[0][0].where;
    expect(where.classId).toEqual(In(['c1']));
  });

  it('principal reads the whole school', async () => {
    const { service, homeworkRepository } = createService({
      userRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue({ id: PRINCIPAL_ID, roles: ['principal'] }),
      }),
    });
    await service.listForStaff(PRINCIPAL_ID);
    const where = homeworkRepository.find.mock.calls[0][0].where;
    expect(where).toEqual({ schoolId: SCHOOL_ID });
  });

  it('teacher reading another class → 404', async () => {
    const { service } = createService();
    await expect(service.listForStaff(TEACHER_ID, 'other')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('HomeworkService.remove', () => {
  it('the creator may delete their own even without class access anymore', async () => {
    const { service, homeworkRepository } = createService({
      homeworkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(homeworkRow()),
      }),
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
    });
    await expect(service.remove(TEACHER_ID, 'h1')).resolves.toEqual({
      deleted: true,
    });
    expect(homeworkRepository.delete).toHaveBeenCalledWith({ id: 'h1' });
  });

  it('404s for another school homework', async () => {
    const { service, homeworkRepository } = createService({
      homeworkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    });
    await expect(service.remove(TEACHER_ID, 'h1')).rejects.toThrow(
      NotFoundException,
    );
    expect(homeworkRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'h1', schoolId: SCHOOL_ID },
    });
  });
});

describe('HomeworkService.listForStudent', () => {
  it('empty when not enrolled anywhere', async () => {
    const { service } = createService({
      membershipRepository: createRepository({
        find: jest.fn().mockResolvedValue([]),
      }),
    });
    await expect(service.listForStudent(5)).resolves.toEqual({
      homework: [],
      graded: [],
    });
  });

  it('joins auto-generated grades so the FE can mark homework done', async () => {
    const { service, gradeRepository } = createService({
      homeworkRepository: createRepository({
        find: jest.fn().mockResolvedValue([homeworkRow()]),
      }),
      gradeRepository: createRepository({
        find: jest.fn().mockResolvedValue([
          {
            homeworkId: 'h1',
            quizSessionId: 's1',
            score: 8.7,
          },
        ]),
      }),
    });
    const result = await service.listForStudent(5);
    expect(result.homework).toHaveLength(1);
    expect(result.homework[0].teacherName).toBe('Thầy Hùng');
    expect(result.graded).toEqual([
      { homeworkId: 'h1', quizSessionId: 's1', score: 8.7 },
    ]);
    const where = gradeRepository.find.mock.calls[0][0].where;
    expect(where.studentId).toBe(5);
    // password hash never serializes
    expect(JSON.stringify(result)).not.toContain('hash');
  });
});

describe('HomeworkService.getChildHomework (parent gate)', () => {
  it('404 without a link, 400 while pending', async () => {
    const { service } = createService();
    await expect(service.getChildHomework(50, 5)).rejects.toThrow(
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
    await expect(s2.getChildHomework(50, 5)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('approved link → rows for the child classes of THAT school', async () => {
    const { service, homeworkRepository } = createService({
      linkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({
          id: 'l1',
          parentId: 50,
          studentId: 5,
          schoolId: SCHOOL_ID,
          status: ParentLinkStatus.APPROVED,
        }),
      }),
      homeworkRepository: createRepository({
        find: jest.fn().mockResolvedValue([homeworkRow()]),
      }),
    });
    const rows = await service.getChildHomework(50, 5);
    expect(homeworkRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ schoolId: SCHOOL_ID }),
      }),
    );
    expect(rows[0]).toMatchObject({ title: 'Trắc nghiệm Chương I' });
    expect(JSON.stringify(rows)).not.toContain('school.vn'); // no teacher emails
  });
});

describe('HomeworkService.recordQuizGrade — quiz→grade bridge', () => {
  const facts = (over: Record<string, unknown> = {}) =>
    ({
      userId: 5,
      sessionId: 's1',
      quizId: QUIZ_ID,
      scorePercent: 87,
      ...over,
    }) as any;

  it('null when the student has no active class', async () => {
    const { service } = createService({
      membershipRepository: createRepository({
        find: jest.fn().mockResolvedValue([]),
      }),
    });
    await expect(service.recordQuizGrade(facts())).resolves.toBeNull();
  });

  it('null when the quiz is not assigned with countsAsGrade', async () => {
    const { service, homeworkRepository } = createService();
    await expect(service.recordQuizGrade(facts())).resolves.toBeNull();
    expect(homeworkRepository.find.mock.calls[0][0].where).toMatchObject({
      targetId: QUIZ_ID,
      countsAsGrade: true,
    });
  });

  it('creates a 15-minute entry: 87/100 → 8.7, term by month', async () => {
    const { service, gradeRepository, activityLog } = createService({
      homeworkRepository: createRepository({
        find: jest.fn().mockResolvedValue([homeworkRow()]),
      }),
    });
    const saved = await service.recordQuizGrade(facts());
    const created = (gradeRepository.create as jest.Mock).mock.calls[0][0];
    expect(created).toMatchObject({
      schoolId: SCHOOL_ID,
      classId: 'c1',
      subjectId: SUBJECT_ID,
      studentId: 5,
      testType: GradeTestType.MIN15,
      coefficient: 1,
      score: 8.7,
      quizSessionId: 's1',
      homeworkId: 'h1',
    });
    expect(saved).toHaveLength(1);
    expect(activityLog.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'school.grade.auto' }),
    );
  });

  it('latest attempt wins: existing entry is updated, not duplicated', async () => {
    const existing = {
      id: 'g1',
      studentId: 5,
      homeworkId: 'h1',
      score: 4,
      quizSessionId: 'old-session',
      date: '2026-09-01',
      testType: GradeTestType.MIN15,
      coefficient: 1,
    };
    const { service, gradeRepository } = createService({
      homeworkRepository: createRepository({
        find: jest.fn().mockResolvedValue([homeworkRow()]),
      }),
      gradeRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(existing),
      }),
    });
    await service.recordQuizGrade(
      facts({ sessionId: 's2', scorePercent: 100 }),
    );
    expect(gradeRepository.create).not.toHaveBeenCalled();
    const saved = (gradeRepository.save as jest.Mock).mock.calls[0][0];
    expect(saved).toBe(existing);
    expect(saved.score).toBe(10);
    expect(saved.quizSessionId).toBe('s2');
  });
});
