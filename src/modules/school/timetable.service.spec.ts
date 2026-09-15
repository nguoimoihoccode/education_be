import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TimetableService } from './timetable.service';
import { ParentLinkStatus } from './entities/parent-link.entity';

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111';
const TEACHER_ID = 42; // homeroom teacher of c1
const PRINCIPAL_ID = 99;

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

const schoolRow = (over: Record<string, unknown> = {}) => ({
  id: SCHOOL_ID,
  principalId: PRINCIPAL_ID,
  periodConfig: { periodsPerDay: 5, days: [2, 3, 4, 5, 6, 7] },
  ...over,
});

const classRow = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  schoolId: SCHOOL_ID,
  name: '6A',
  grade: 6,
  academicYearId: 'y1',
  homeroomTeacherId: TEACHER_ID,
  active: true,
  academicYear: { id: 'y1', name: '2026-2027' },
  ...over,
});

const subjectRow = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Toán',
  code: 'TOAN',
  color: '#ef4444',
  active: true,
  ...over,
});

/** Full slot row with a (dirty) teacher relation to assert redaction. */
const slotRow = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  schoolId: SCHOOL_ID,
  classId: 'c1',
  subjectId: 's1',
  teacherId: TEACHER_ID,
  weekday: 2,
  periodNumber: 3,
  room: 'A2-104',
  subject: subjectRow(),
  teacher: {
    id: TEACHER_ID,
    name: 'Thầy Hùng',
    email: 'hung@school.vn',
    passwordHash: 'super-secret',
  },
  ...over,
});

const createService = (overrides: Record<string, any> = {}) => {
  const repos = {
    slotRepository: createRepository(),
    classRepository: createRepository(),
    subjectRepository: createRepository(),
    membershipRepository: createRepository(),
    assignmentRepository: createRepository(),
    linkRepository: createRepository(),
    schoolRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(schoolRow()),
    }),
    userRepository: createRepository({
      findOne: jest.fn().mockResolvedValue({
        id: PRINCIPAL_ID,
        roles: ['principal'],
      }),
    }),
    ...overrides,
  };
  const schoolService = {
    resolveSchoolIdForUser: jest.fn().mockResolvedValue(SCHOOL_ID),
  };
  const activityLog = {
    recordBestEffort: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TimetableService(
    repos.slotRepository as any,
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
  return { service, schoolService, activityLog, ...repos };
};

const SLOT_DTO = {
  classId: 'c1',
  subjectId: 's1',
  teacherId: TEACHER_ID,
  weekday: 2,
  periodNumber: 3,
  room: 'A2-104',
};

describe('TimetableService.getTimetableForClass — access (rule D1)', () => {
  it('scopes the class lookup by { id, schoolId } and 404s cross-tenant', async () => {
    const { service, classRepository } = createService();
    await expect(
      service.getTimetableForClass(TEACHER_ID, 'c-other'),
    ).rejects.toThrow(NotFoundException);
    expect(classRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'c-other', schoolId: SCHOOL_ID },
      relations: { academicYear: true },
    });
  });

  it('lets the homeroom teacher read the grid with periodConfig', async () => {
    const { service, slotRepository } = createService({
      classRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(classRow()),
      }),
      slotRepository: createRepository({
        find: jest.fn().mockResolvedValue([slotRow()]),
      }),
    });
    const result = await service.getTimetableForClass(TEACHER_ID, 'c1');
    expect(result.className).toBe('6A');
    expect(result.periodConfig).toEqual({
      periodsPerDay: 5,
      days: [2, 3, 4, 5, 6, 7],
    });
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].teacher.name).toBe('Thầy Hùng');
    // redaction: no email/hash leaves the service
    expect(JSON.stringify(result)).not.toContain('super-secret');
    expect(JSON.stringify(result)).not.toContain('hung@school.vn');
  });

  it('404s (not 403) a teacher with no link to the class', async () => {
    const { service } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
    });
    await expect(
      service.getTimetableForClass(TEACHER_ID, 'c1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('lets a teacher with a TeachingAssignment read the class grid', async () => {
    const { service } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
      assignmentRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 'a1' }),
      }),
    });
    const result = await service.getTimetableForClass(TEACHER_ID, 'c1');
    expect(result.className).toBe('6A');
  });
});

describe('TimetableService.createSlot', () => {
  const adminRepos = () => ({
    schoolRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(schoolRow()),
    }),
    classRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(classRow()),
    }),
    subjectRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(subjectRow()),
    }),
    assignmentRepository: createRepository({
      findOne: jest.fn().mockResolvedValue({ id: 'a1' }),
    }),
  });

  it('rejects a homeroom teacher who is not school admin (404, D1)', async () => {
    const { service, userRepository } = createService({
      ...adminRepos(),
      userRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue({ id: TEACHER_ID, roles: ['teacher'] }),
      }),
    });
    await expect(
      service.createSlot(TEACHER_ID, SLOT_DTO as any),
    ).rejects.toThrow(NotFoundException);
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: TEACHER_ID },
    });
  });

  it('requires an existing TeachingAssignment for teacher x subject x class', async () => {
    const { service } = createService({
      ...adminRepos(),
      assignmentRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    });
    await expect(
      service.createSlot(PRINCIPAL_ID, SLOT_DTO as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('409s when the class already has a slot in that cell', async () => {
    const { service } = createService({
      ...adminRepos(),
      slotRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(slotRow()), // sameCell exists
      }),
    });
    await expect(
      service.createSlot(PRINCIPAL_ID, SLOT_DTO as any),
    ).rejects.toThrow(/already has a slot/i);
  });

  it('409s a teacher double-booking ACROSS classes via the conflict policy', async () => {
    const { service } = createService({
      ...adminRepos(),
      slotRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(null), // this class cell is free
        find: jest
          .fn()
          .mockResolvedValue([
            slotRow({ id: 't9', classId: 'c2', teacherId: TEACHER_ID }),
          ]),
      }),
    });
    await expect(
      service.createSlot(PRINCIPAL_ID, SLOT_DTO as any),
    ).rejects.toThrow(ConflictException);
  });

  it('persists + audits a clean slot; response is redacted', async () => {
    const { service, slotRepository, activityLog } = createService({
      ...adminRepos(),
      slotRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null) // sameCell check
          .mockResolvedValueOnce(slotRow()), // reload with relations
        find: jest.fn().mockResolvedValue([]), // empty cell
      }),
    });
    const result = await service.createSlot(PRINCIPAL_ID, SLOT_DTO as any);
    expect(slotRepository.save).toHaveBeenCalled();
    expect((slotRepository.create as jest.Mock).mock.calls[0][0]).toMatchObject(
      {
        schoolId: SCHOOL_ID,
        classId: 'c1',
        academicYearId: 'y1', // denormalized from the class, never from client
        weekday: 2,
        periodNumber: 3,
      },
    );
    expect(result.subject.name).toBe('Toán');
    expect(JSON.stringify(result)).not.toContain('super-secret');
    expect(activityLog.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'school.timetable.slot_add' }),
    );
  });
});

describe('TimetableService.deleteSlot / validate', () => {
  it('404s a slot from another school', async () => {
    const { service } = createService();
    await expect(service.deleteSlot(PRINCIPAL_ID, 't-x')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('removes + audits its own slot', async () => {
    const { service, slotRepository, activityLog } = createService({
      slotRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(slotRow()),
      }),
    });
    await service.deleteSlot(PRINCIPAL_ID, 't1');
    expect(slotRepository.remove).toHaveBeenCalled();
    expect(activityLog.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'school.timetable.slot_remove' }),
    );
  });

  it('validate reports conflicts without touching the DB', async () => {
    const { service } = createService();
    const { conflicts } = await service.validate(PRINCIPAL_ID, {
      slots: [
        { classId: 'c1', teacherId: 7, weekday: 2, periodNumber: 1 },
        { classId: 'c2', teacherId: 7, weekday: 2, periodNumber: 1 },
      ],
    } as any);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].dimension).toBe('teacher');
    expect(conflicts[0].indices).toEqual([0, 1]);
  });
});

describe('TimetableService.getMyTimetable', () => {
  it('teachers get their own slots across classes (with className)', async () => {
    const { service } = createService({
      userRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue({ id: TEACHER_ID, roles: ['teacher'] }),
      }),
      slotRepository: createRepository({
        find: jest
          .fn()
          .mockResolvedValue([
            slotRow({ schoolClass: { id: 'c1', name: '6A' } }),
          ]),
      }),
    });
    const result = await service.getMyTimetable(TEACHER_ID);
    expect(result.as).toBe('teacher');
    expect(result.slots[0].className).toBe('6A');
  });

  it('students get the grid of their active class', async () => {
    const { service } = createService({
      userRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 5, roles: ['student'] }),
      }),
      membershipRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({
          studentId: 5,
          schoolId: SCHOOL_ID,
          leftAt: null,
          class: classRow(),
        }),
      }),
      slotRepository: createRepository({
        find: jest.fn().mockResolvedValue([slotRow()]),
      }),
    });
    const result = await service.getMyTimetable(5);
    expect(result.as).toBe('student');
    if (result.as === 'student') {
      expect(result.class?.name).toBe('6A');
    }
    expect(result.slots).toHaveLength(1);
  });

  it('404s an account with no teaching and no class', async () => {
    const { service } = createService({
      userRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({ id: 8, roles: ['user'] }),
      }),
    });
    await expect(service.getMyTimetable(8)).rejects.toThrow(NotFoundException);
  });
});

describe('TimetableService.getChildTimetable (privacy gate)', () => {
  const approvedLink = {
    id: 'l1',
    parentId: 50,
    studentId: 5,
    schoolId: SCHOOL_ID,
    status: ParentLinkStatus.APPROVED,
    student: { id: 5, name: 'Bé An', email: 'an@school.vn', passwordHash: 'x' },
  };

  it('404s when no link exists for this parent+child', async () => {
    const { service } = createService();
    await expect(service.getChildTimetable(50, 5)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('400s a pending link (same gate as the child profile)', async () => {
    const { service, linkRepository } = createService({
      linkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({
          ...approvedLink,
          status: ParentLinkStatus.PENDING,
        }),
      }),
    });
    await expect(service.getChildTimetable(50, 5)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns slots WITHOUT any email (teacher or student)', async () => {
    const { service } = createService({
      linkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(approvedLink),
      }),
      membershipRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({
          studentId: 5,
          class: classRow(),
          leftAt: null,
        }),
      }),
      slotRepository: createRepository({
        find: jest.fn().mockResolvedValue([slotRow()]),
      }),
    });
    const result = await service.getChildTimetable(50, 5);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].teacher.name).toBe('Thầy Hùng');
    const raw = JSON.stringify(result);
    expect(raw).not.toContain('hung@school.vn');
    expect(raw).not.toContain('an@school.vn');
    expect(raw).not.toContain('super-secret');
  });
});
