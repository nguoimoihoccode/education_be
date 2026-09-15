import { ConflictException, NotFoundException } from '@nestjs/common';
import { SchoolService } from './school.service';

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111';
const asPrincipalRepo = () =>
  createRepository({
    findOne: jest.fn().mockResolvedValue({ id: SCHOOL_ID, principalId: 7 }),
  });

const createRepository = (overrides: Record<string, unknown> = {}) => ({
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((value) => value),
  // chainable default: select().where().getRawOne() → null
  createQueryBuilder: jest.fn().mockImplementation(() => createQueryBuilder()),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  remove: jest.fn().mockResolvedValue(undefined),
  save: jest.fn((value) => Promise.resolve(value)),
  update: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createQueryBuilder = (raw: Record<string, unknown> | null = null) => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
  ]) {
    qb[method] = jest.fn().mockImplementation(() => qb);
  }
  qb.getRawOne = jest.fn().mockResolvedValue(raw);
  qb.getRawMany = jest.fn().mockResolvedValue([]);
  return qb;
};

const createService = (overrides: Record<string, any> = {}) => {
  const repos = {
    schoolRepository: createRepository(),
    yearRepository: createRepository(),
    subjectRepository: createRepository(),
    classRepository: createRepository(),
    assignmentRepository: createRepository(),
    membershipRepository: createRepository(),
    userRepository: createRepository(),
    gradeRepository: createRepository({
      // mặc định: chưa có điểm nào → AVG trả null
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(createQueryBuilder({ avg: null })),
    }),
    attendanceRepository: createRepository(),
    ...overrides,
  };
  const activityLog = {
    recordBestEffort: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SchoolService(
    repos.schoolRepository,
    repos.yearRepository,
    repos.subjectRepository,
    repos.classRepository,
    repos.assignmentRepository,
    repos.membershipRepository,
    repos.userRepository,
    repos.gradeRepository,
    repos.attendanceRepository,
    activityLog,
  );
  return { service, activityLog, ...repos };
};

describe('SchoolService#resolveSchoolIdForUser', () => {
  it('returns the school where the user is principal', async () => {
    const { service, schoolRepository } = createService({
      schoolRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: SCHOOL_ID, principalId: 7 }),
      }),
    });
    await expect(service.resolveSchoolIdForUser(7)).resolves.toBe(SCHOOL_ID);
  });

  it('falls back to the teacher assignment school', async () => {
    const { service, assignmentRepository } = createService({
      assignmentRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue({ schoolId: SCHOOL_ID, teacherId: 7 }),
      }),
    });
    await expect(service.resolveSchoolIdForUser(7)).resolves.toBe(SCHOOL_ID);
    expect(assignmentRepository.findOne).toHaveBeenCalledWith({
      where: { teacherId: 7 },
    });
  });

  it('falls back to the student membership school', async () => {
    const { service, membershipRepository } = createService({
      membershipRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ schoolId: SCHOOL_ID }),
      }),
    });
    await expect(service.resolveSchoolIdForUser(7)).resolves.toBe(SCHOOL_ID);
  });

  it('gives ADMIN the first school when they have no membership', async () => {
    const { service, userRepository, schoolRepository } = createService({
      userRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 1, roles: ['admin'] }),
      }),
      schoolRepository: createRepository({
        // 1st call: principal lookup → none; 2nd call: admin fallback
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: SCHOOL_ID }),
      }),
    });
    await expect(service.resolveSchoolIdForUser(1)).resolves.toBe(SCHOOL_ID);
    expect(schoolRepository.findOne).toHaveBeenLastCalledWith({
      order: { createdAt: 'ASC' },
    });
  });

  it('throws NotFoundException when the user belongs to no school', async () => {
    const { service } = createService();
    await expect(service.resolveSchoolIdForUser(99)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('SchoolService#createSchool', () => {
  it('rejects a duplicate school code', async () => {
    const { service, schoolRepository } = createService({
      schoolRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: SCHOOL_ID, code: 'ABC' }),
      }),
    });
    await expect(
      service.createSchool({ name: 'X', code: 'ABC' }, 7),
    ).rejects.toThrow(ConflictException);
    expect(schoolRepository.save).not.toHaveBeenCalled();
  });

  it('makes the calling user the principal and logs the activity', async () => {
    const { service, schoolRepository, activityLog } = createService();
    const school = await service.createSchool(
      { name: 'Lingua School', code: 'LINGUA' },
      7,
    );
    expect(schoolRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'LINGUA', principalId: 7 }),
    );
    expect(activityLog.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, action: 'school.create' }),
    );
  });
});

describe('SchoolService#setActiveAcademicYear', () => {
  it('404s when the year belongs to another school (tenant rule D1)', async () => {
    const { service } = createService(); // findOne → null
    await expect(
      service.setActiveAcademicYear(SCHOOL_ID, 'year-of-other-school'),
    ).rejects.toThrow(NotFoundException);
  });

  it('deactivates all years, activates the target, points the school at it', async () => {
    const year = { id: 'y1', schoolId: SCHOOL_ID, isActive: false };
    const { service, yearRepository, schoolRepository } = createService({
      yearRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(year),
      }),
    });
    await service.setActiveAcademicYear(SCHOOL_ID, 'y1');
    expect(yearRepository.update).toHaveBeenCalledWith(
      { schoolId: SCHOOL_ID },
      { isActive: false },
    );
    expect(yearRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'y1', isActive: true }),
    );
    expect(schoolRepository.update).toHaveBeenCalledWith(
      { id: SCHOOL_ID },
      { currentAcademicYearId: 'y1' },
    );
  });
});

describe('SchoolService#deleteSubject', () => {
  const subject = { id: 's1', schoolId: SCHOOL_ID, name: 'Toán', active: true };

  it('archives instead of deleting when teaching assignments still use it', async () => {
    const { service, subjectRepository, assignmentRepository } = createService({
      schoolRepository: asPrincipalRepo(),
      subjectRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ ...subject }),
      }),
      assignmentRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 'a1' }),
      }),
    });
    await service.deleteSubject(7, 's1');
    expect(subjectRepository.remove).not.toHaveBeenCalled();
    expect(subjectRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1', active: false }),
    );
  });

  it('hard-deletes an unused subject', async () => {
    const { service, subjectRepository } = createService({
      schoolRepository: asPrincipalRepo(),
      subjectRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ ...subject }),
      }),
    });
    await service.deleteSubject(7, 's1');
    expect(subjectRepository.remove).toHaveBeenCalled();
  });

  it('404s a subject from another school without touching it', async () => {
    const { service, subjectRepository } = createService({
      schoolRepository: asPrincipalRepo(), // findOne on subjects stays null
    });
    await expect(
      service.deleteSubject(7, 'other-school-subject'),
    ).rejects.toThrow(NotFoundException);
    expect(subjectRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'other-school-subject', schoolId: SCHOOL_ID },
    });
    expect(subjectRepository.remove).not.toHaveBeenCalled();
  });
});

describe('SchoolService#getStats', () => {
  it('aggregates classes, students, distinct teachers, subjects (+ Phase 4 fields)', async () => {
    const { service } = createService({
      schoolRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: SCHOOL_ID }),
      }),
      classRepository: createRepository({
        count: jest.fn().mockResolvedValue(4),
      }),
      membershipRepository: createRepository({
        count: jest.fn().mockResolvedValue(87),
      }),
      subjectRepository: createRepository({
        count: jest.fn().mockResolvedValue(9),
      }),
      assignmentRepository: createRepository({
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(createQueryBuilder({ count: '6' })),
      }),
    });
    await expect(service.getStats(7)).resolves.toEqual({
      classes: 4,
      students: 87,
      teachers: 6,
      subjects: 9,
      avgScore: null,
      attendanceRate: 0,
      attendanceSessions: 0,
    });
  });

  it('Phase 4: averages school grades + summarizes 30-day attendance', async () => {
    const { service, attendanceRepository } = createService({
      schoolRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: SCHOOL_ID }),
      }),
      gradeRepository: createRepository({
        createQueryBuilder: jest
          .fn()
          .mockReturnValue(createQueryBuilder({ avg: '7.45' })),
      }),
      attendanceRepository: createRepository({
        find: jest
          .fn()
          .mockResolvedValue([
            { status: 'present' },
            { status: 'present' },
            { status: 'late' },
            { status: 'absent' },
          ]),
      }),
    });
    const stats = await service.getStats(7);
    expect(stats.avgScore).toBe(7.5); // numeric → string → round 1 chữ số
    expect(stats.attendanceRate).toBe(75);
    expect(stats.attendanceSessions).toBe(4);
    expect(attendanceRepository.find.mock.calls[0][0].select).toEqual({
      status: true,
    });
  });
});

describe('SchoolService#listTeachers', () => {
  it('groups assignments under their teacher', async () => {
    const assignments = [
      {
        id: 'a1',
        teacherId: 3,
        subjectId: 's1',
        classId: 'c1',
        teacher: { id: 3, name: 'Cô A', email: 'a@x.vn' },
        subject: { name: 'Toán' },
        schoolClass: { name: '6A' },
      },
      {
        id: 'a2',
        teacherId: 3,
        subjectId: 's2',
        classId: 'c1',
        teacher: { id: 3, name: 'Cô A', email: 'a@x.vn' },
        subject: { name: 'Lý' },
        schoolClass: { name: '6A' },
      },
      {
        id: 'a3',
        teacherId: 4,
        subjectId: 's1',
        classId: 'c2',
        teacher: { id: 4, name: 'Thầy B', email: 'b@x.vn' },
        subject: { name: 'Toán' },
        schoolClass: { name: '7B' },
      },
    ];
    const { service, assignmentRepository } = createService({
      schoolRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: SCHOOL_ID }),
      }),
      assignmentRepository: createRepository({
        find: jest.fn().mockResolvedValue(assignments),
      }),
    });
    const teachers = await service.listTeachers(7);
    expect(teachers).toHaveLength(2);
    expect(teachers[0]).toMatchObject({ id: 3, name: 'Cô A' });
    expect(teachers[0].assignments).toHaveLength(2);
    expect(teachers[1].assignments[0]).toMatchObject({
      className: '7B',
      subjectName: 'Toán',
    });
  });
});

describe('SchoolService#updateSubject (tenant scoping)', () => {
  it('looks the subject up by {id, schoolId} — never by bare id', async () => {
    const { service, subjectRepository } = createService({
      schoolRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: SCHOOL_ID }),
      }),
    });
    await expect(
      service.updateSubject(7, 'nope', { name: 'X' }),
    ).rejects.toThrow(NotFoundException);
    expect(subjectRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'nope', schoolId: SCHOOL_ID },
    });
  });
});
