import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ClassService } from './school-class.service';

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111';

const createRepository = (overrides: Record<string, unknown> = {}) => ({
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((value) => value),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  remove: jest.fn().mockResolvedValue(undefined),
  save: jest.fn((value: any) => Promise.resolve({ id: 'gen-1', ...value })),
  update: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const classRow = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  schoolId: SCHOOL_ID,
  name: '6A',
  grade: 6,
  academicYearId: 'y1',
  active: true,
  maxStudents: null,
  ...over,
});

const createService = (overrides: Record<string, any> = {}) => {
  const repos = {
    classRepository: createRepository(),
    yearRepository: createRepository(),
    assignmentRepository: createRepository(),
    membershipRepository: createRepository(),
    schoolRepository: createRepository(),
    subjectRepository: createRepository(),
    userRepository: createRepository(),
    ...overrides,
  };
  const schoolService = {
    resolveSchoolIdForUser: jest.fn().mockResolvedValue(SCHOOL_ID),
  };
  const activityLog = {
    recordBestEffort: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ClassService(
    repos.classRepository,
    repos.yearRepository,
    repos.assignmentRepository,
    repos.membershipRepository,
    repos.schoolRepository,
    repos.subjectRepository,
    repos.userRepository,
    schoolService as any,
    activityLog as any,
  );
  return { service, schoolService, activityLog, ...repos };
};

describe('ClassService#createClass', () => {
  it('404s when the academic year belongs to another school (D1)', async () => {
    const { service, yearRepository } = createService();
    await expect(
      service.createClass(7, {
        name: '6A',
        grade: 6,
        academicYearId: 'y-other',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(yearRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'y-other', schoolId: SCHOOL_ID },
    });
  });

  it('rejects a name clash within the same school + year', async () => {
    const { service, yearRepository, classRepository } = createService({
      yearRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 'y1', name: '2026-2027' }),
      }),
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(classRow({ name: '6A' })),
      }),
    });
    await expect(
      service.createClass(7, { name: '6A', grade: 6, academicYearId: 'y1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('promotes the homeroom teacher to TEACHER role', async () => {
    const teacher = { id: 3, roles: ['user'], isTeacher: false };
    const { service, yearRepository, userRepository } = createService({
      yearRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 'y1', name: '2026-2027' }),
      }),
      userRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(teacher),
      }),
    });
    await service.createClass(7, {
      name: '6A',
      grade: 6,
      academicYearId: 'y1',
      homeroomTeacherId: 3,
    });
    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 3,
        roles: expect.arrayContaining(['teacher']),
        isTeacher: true,
      }),
    );
  });
});

describe('ClassService#createAssignment', () => {
  it('404s a subject outside the caller school', async () => {
    const { service, userRepository, subjectRepository } = createService({
      userRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 3, roles: ['teacher'] }),
      }),
    });
    await expect(
      service.createAssignment(7, {
        teacherId: 3,
        subjectId: 's-other',
        classId: 'c1',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(subjectRepository.findOne).toHaveBeenCalledWith({
      where: { id: 's-other', schoolId: SCHOOL_ID },
    });
    expect(userRepository.save).not.toHaveBeenCalled(); // teacher already had role
  });
});

describe('ClassService#deleteAssignment', () => {
  it('looks up by {id, schoolId} and 404s cross-tenant ids', async () => {
    const { service } = createService();
    await expect(
      service.deleteAssignment(7, 'a-of-other-school'),
    ).rejects.toThrow(NotFoundException);
  });

  it('removes an assignment owned by the school', async () => {
    const { service, assignmentRepository } = createService({
      assignmentRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 'a1', schoolId: SCHOOL_ID }),
      }),
    });
    await service.deleteAssignment(7, 'a1');
    expect(assignmentRepository.remove).toHaveBeenCalled();
  });
});

describe('ClassService#addStudents', () => {
  const setup = (over: Record<string, any> = {}) =>
    createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(classRow()),
        ...over.classRepository,
      }),
      ...over,
    });

  it('attaches an existing user with a membership', async () => {
    const { service, membershipRepository, userRepository } = setup({
      userRepository: createRepository({
        find: jest
          .fn()
          .mockResolvedValue([
            { id: 5, email: 'a@x.vn', name: 'An', roles: ['student'] },
          ]),
      }),
    });
    const res = await service.addStudents(7, 'c1', {
      students: [{ email: 'a@x.vn' }],
    });
    expect(res.added).toEqual([{ email: 'a@x.vn', studentId: 5 }]);
    expect(res.created).toEqual([]);
    expect(userRepository.save).not.toHaveBeenCalled();
    expect(membershipRepository.save).toHaveBeenCalled();
  });

  it('creates a STUDENT account for an unknown email and returns the temp password once', async () => {
    const { service, userRepository } = setup();
    const res = await service.addStudents(7, 'c1', {
      students: [{ email: 'new@x.vn', name: 'Mới' }],
    });
    expect(res.created).toHaveLength(1);
    expect(res.created[0].temporaryPassword).toEqual(expect.any(String));
    expect(res.added).toEqual([]); // new students surface via `created` only
    const createArg = (userRepository.create as jest.Mock).mock.calls[0][0];
    expect(createArg.roles).toEqual(['user', 'student']);
    expect(createArg.passwordHash).toEqual(expect.any(String));
    expect(createArg.passwordHash).not.toBe(res.created[0].temporaryPassword);
  });

  it('skips unknown emails when existingOnly is set', async () => {
    const { service } = setup();
    const res = await service.addStudents(7, 'c1', {
      students: [{ email: 'ghost@x.vn' }],
      existingOnly: true,
    });
    expect(res.skipped).toEqual([
      { email: 'ghost@x.vn', reason: 'user_not_found' },
    ]);
  });

  it('enforces class capacity up front', async () => {
    const { service, membershipRepository } = createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(classRow({ maxStudents: 2 })),
      }),
      membershipRepository: createRepository({
        count: jest.fn().mockResolvedValue(1),
      }),
    });
    await expect(
      service.addStudents(7, 'c1', {
        students: [{ email: 'a@x.vn' }, { email: 'b@x.vn' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('skips a student already active in another class of the school', async () => {
    const { service, membershipRepository, classRepository } = setup({
      userRepository: createRepository({
        find: jest
          .fn()
          .mockResolvedValue([
            { id: 5, email: 'a@x.vn', name: 'An', roles: ['student'] },
          ]),
      }),
      membershipRepository: createRepository({
        // 1st findOne: active membership in class c9; 2nd never reached
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ classId: 'c9', studentId: 5 }),
      }),
      classRepository: createRepository({
        // getClass returns c1; the "other class" lookup returns c9
        findOne: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(
              where.id === 'c1'
                ? classRow()
                : classRow({ id: 'c9', name: '9Z' }),
            ),
          ),
      }),
    });
    const res = await service.addStudents(7, 'c1', {
      students: [{ email: 'a@x.vn' }],
    });
    expect(res.skipped).toEqual([
      { email: 'a@x.vn', reason: 'already_in_class:9Z' },
    ]);
    expect(membershipRepository.save).not.toHaveBeenCalled();
  });

  it('reactivates a lapsed membership instead of creating a duplicate', async () => {
    const lapsed = {
      id: 'm1',
      classId: 'c1',
      studentId: 5,
      leftAt: new Date('2025-01-01'),
    };
    const { service, membershipRepository } = setup({
      userRepository: createRepository({
        find: jest
          .fn()
          .mockResolvedValue([
            { id: 5, email: 'a@x.vn', name: 'An', roles: ['student'] },
          ]),
      }),
      membershipRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null) // no active membership in the school
          .mockResolvedValueOnce(lapsed), // but a lapsed one in this class
      }),
    });
    const res = await service.addStudents(7, 'c1', {
      students: [{ email: 'a@x.vn' }],
    });
    expect(res.added).toEqual([{ email: 'a@x.vn', studentId: 5 }]);
    expect(lapsed.leftAt).toBeNull();
    expect(membershipRepository.save).toHaveBeenCalledWith(lapsed);
  });

  it('404s for a class belonging to another school', async () => {
    const { service } = createService(); // classRepository.findOne → null
    await expect(
      service.addStudents(7, 'c-other', { students: [{ email: 'a@x.vn' }] }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ClassService#removeStudent', () => {
  it('soft-leave: sets leftAt instead of deleting', async () => {
    const membership = { id: 'm1', classId: 'c1', studentId: 5, leftAt: null };
    const { service, classRepository, membershipRepository } = createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(classRow()),
      }),
      membershipRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(membership),
      }),
    });
    await service.removeStudent(7, 'c1', 5);
    expect(membership.leftAt).toBeInstanceOf(Date);
    expect(membershipRepository.remove).not.toHaveBeenCalled();
  });

  it('404s when the student has no active membership', async () => {
    const { service, classRepository } = createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(classRow()),
      }),
    });
    await expect(service.removeStudent(7, 'c1', 5)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ClassService#listStudents', () => {
  it('maps active memberships to a flattened student shape', async () => {
    const { service, classRepository, membershipRepository } = createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(classRow()),
      }),
      membershipRepository: createRepository({
        find: jest.fn().mockResolvedValue([
          {
            id: 'm1',
            joinedAt: new Date('2026-09-05'),
            student: { id: 5, name: 'An', email: 'a@x.vn' },
          },
        ]),
      }),
    });
    const students = await service.listStudents(7, 'c1');
    expect(students).toEqual([
      {
        membershipId: 'm1',
        joinedAt: new Date('2026-09-05'),
        student: { id: 5, name: 'An', email: 'a@x.vn' },
      },
    ]);
  });
});
