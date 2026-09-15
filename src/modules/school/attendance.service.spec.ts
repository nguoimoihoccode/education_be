import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceStatus } from './entities/attendance-record.entity';
import { ParentLinkStatus } from './entities/parent-link.entity';

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111';
const TEACHER_ID = 42; // homeroom of c1
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

const schoolRow = () => ({
  id: SCHOOL_ID,
  principalId: PRINCIPAL_ID,
  periodConfig: { periodsPerDay: 5, days: [2, 3, 4, 5, 6, 7] },
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

const studentRow = (id: number, name: string) => ({
  id,
  name,
  email: `${name}@school.vn`.toLowerCase(),
  passwordHash: 'secret-hash',
});

const membershipRow = (studentId: number) => ({
  id: `m${studentId}`,
  classId: 'c1',
  studentId,
  leftAt: null,
  student: studentRow(studentId, `hs${studentId}`),
});

const attendanceRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  schoolId: SCHOOL_ID,
  classId: 'c1',
  studentId: 5,
  date: '2026-09-14',
  periodNumber: 3,
  status: AttendanceStatus.PRESENT,
  note: null,
  ...over,
});

const createService = (overrides: Record<string, any> = {}) => {
  const repos = {
    attendanceRepository: createRepository(),
    classRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(classRow()),
    }),
    membershipRepository: createRepository({
      find: jest
        .fn()
        .mockResolvedValue([
          membershipRow(5),
          membershipRow(6),
          membershipRow(7),
        ]),
    }),
    slotRepository: createRepository(),
    assignmentRepository: createRepository(),
    linkRepository: createRepository(),
    schoolRepository: createRepository({
      findOne: jest.fn().mockResolvedValue(schoolRow()),
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
  const service = new AttendanceService(
    repos.attendanceRepository as any,
    repos.classRepository as any,
    repos.membershipRepository as any,
    repos.slotRepository as any,
    repos.assignmentRepository as any,
    repos.linkRepository as any,
    repos.schoolRepository as any,
    repos.userRepository as any,
    schoolService as any,
    activityLog as any,
  );
  return { service, activityLog, ...repos };
};

const takeDto = (
  records: Array<
    Partial<{ studentId: number; status: AttendanceStatus; note?: string }>
  >,
) =>
  ({
    classId: 'c1',
    date: '2026-09-14', // Monday → weekday 2
    periodNumber: 3,
    records,
  }) as any;

describe('AttendanceService — manage access (rule D1)', () => {
  it('scopes the class lookup by { id, schoolId }', async () => {
    const { service, classRepository } = createService();
    await expect(
      service.takeAttendance(
        TEACHER_ID,
        takeDto([{ studentId: 999, status: AttendanceStatus.PRESENT }]),
      ),
    ).rejects.toThrow(BadRequestException); // non-member — but the tenant lookup ran first
    expect(classRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'c1', schoolId: SCHOOL_ID },
    });
  });

  it('404s a teacher of a DIFFERENT class (not homeroom, no assignment)', async () => {
    const { service } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
    });
    await expect(
      service.takeAttendance(
        TEACHER_ID,
        takeDto([{ studentId: 5, status: AttendanceStatus.PRESENT }]),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('lets a teacher WITH a TeachingAssignment take attendance', async () => {
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
    const result = await service.takeAttendance(
      TEACHER_ID,
      takeDto([{ studentId: 5, status: AttendanceStatus.PRESENT }]),
    );
    expect(result.saved).toBe(1);
  });

  it('lets the principal manage any class of the school', async () => {
    const { service } = createService({
      classRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(classRow({ homeroomTeacherId: 777 })),
      }),
    });
    const result = await service.takeAttendance(
      PRINCIPAL_ID,
      takeDto([{ studentId: 5, status: AttendanceStatus.PRESENT }]),
    );
    expect(result.saved).toBe(1);
  });
});

describe('AttendanceService.takeAttendance', () => {
  it('rejects students outside the roster', async () => {
    const { service } = createService();
    await expect(
      service.takeAttendance(
        TEACHER_ID,
        takeDto([{ studentId: 999, status: AttendanceStatus.PRESENT }]),
      ),
    ).rejects.toThrow(/not an active member/);
  });

  it('rejects duplicate students in one submission', async () => {
    const { service } = createService();
    await expect(
      service.takeAttendance(
        TEACHER_ID,
        takeDto([
          { studentId: 5, status: AttendanceStatus.PRESENT },
          { studentId: 5, status: AttendanceStatus.ABSENT },
        ]),
      ),
    ).rejects.toThrow(/appears twice/);
  });

  it('creates a fresh session (upsert part 1) and audits it', async () => {
    const { service, attendanceRepository, activityLog } = createService();
    const result = await service.takeAttendance(
      TEACHER_ID,
      takeDto([
        { studentId: 5, status: AttendanceStatus.PRESENT },
        { studentId: 6, status: AttendanceStatus.LATE, note: '  ' },
      ]),
    );
    expect(result).toMatchObject({ saved: 2, created: 2, updated: 0 });
    const created = (attendanceRepository.create as jest.Mock).mock.calls.map(
      (c) => c[0],
    );
    expect(created[1].note).toBeNull(); // blank note normalized to null
    expect(created[0]).toMatchObject({
      schoolId: SCHOOL_ID,
      classId: 'c1',
      date: '2026-09-14',
      periodNumber: 3,
    });
    expect(activityLog.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'school.attendance.take' }),
    );
  });

  it('re-taking a session updates existing rows instead of duplicating', async () => {
    const existing = attendanceRow({
      studentId: 5,
      status: AttendanceStatus.ABSENT,
    });
    const { service, attendanceRepository } = createService({
      attendanceRepository: createRepository({
        find: jest.fn().mockResolvedValue([existing]),
      }),
    });
    const result = await service.takeAttendance(
      TEACHER_ID,
      takeDto([
        { studentId: 5, status: AttendanceStatus.PRESENT },
        { studentId: 6, status: AttendanceStatus.PRESENT },
      ]),
    );
    expect(result).toMatchObject({ saved: 2, created: 1, updated: 1 });
    // the found row is mutated in place and saved
    expect(existing.status).toBe(AttendanceStatus.PRESENT);
    expect(attendanceRepository.create as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed date before doing anything', async () => {
    const { service } = createService();
    await expect(
      service.getSession(TEACHER_ID, 'c1', '14/09/2026', 3),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('AttendanceService.getSession', () => {
  it('maps the date to plan weekday numbering (Mon 14/9 → 2) and merges statuses', async () => {
    const { service, slotRepository, attendanceRepository } = createService({
      slotRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({
          id: 't1',
          subject: { name: 'Toán', color: '#ef4444' },
          teacher: { id: TEACHER_ID, name: 'Thầy Hùng' },
        }),
      }),
      attendanceRepository: createRepository({
        find: jest.fn().mockResolvedValue([
          attendanceRow({
            studentId: 5,
            status: AttendanceStatus.LATE,
            note: 'mệt',
          }),
        ]),
      }),
    });
    const result = await service.getSession(TEACHER_ID, 'c1', '2026-09-14', 3);
    expect(result.weekday).toBe(2);
    expect(slotRepository.findOne).toHaveBeenCalledWith({
      where: { classId: 'c1', weekday: 2, periodNumber: 3 },
      relations: { subject: true, teacher: true },
    });
    expect(result.slot?.subjectName).toBe('Toán');
    const five = result.students.find((s) => s.studentId === 5);
    expect(five?.status).toBe(AttendanceStatus.LATE);
    expect(five?.note).toBe('mệt');
    const six = result.students.find((s) => s.studentId === 6);
    expect(six?.status).toBeNull();
    // staff roster keeps emails but never password hashes
    const raw = JSON.stringify(result);
    expect(raw).not.toContain('secret-hash');
    expect(raw).toContain('hs5@school.vn');
  });
});

describe('AttendanceService.getClassHistory', () => {
  it('rejects from > to', async () => {
    const { service } = createService();
    await expect(
      service.getClassHistory(TEACHER_ID, 'c1', '2026-09-20', '2026-09-01'),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns rows + a summary computed by the pure policy', async () => {
    const rec = (id: string, studentId: number, status: AttendanceStatus) =>
      attendanceRow({
        id,
        studentId,
        status,
        student: studentRow(studentId, `hs${studentId}`),
      });
    const records = [
      rec('r1', 5, AttendanceStatus.PRESENT),
      rec('r2', 6, AttendanceStatus.PRESENT),
      rec('r3', 7, AttendanceStatus.ABSENT),
      rec('r4', 5, AttendanceStatus.EXCUSED),
    ];
    const { service, attendanceRepository } = createService({
      attendanceRepository: createRepository({
        find: jest.fn().mockResolvedValue(records),
      }),
    });
    const result = await service.getClassHistory(
      TEACHER_ID,
      'c1',
      '2026-09-01',
      '2026-09-30',
    );
    expect(result.records).toHaveLength(4);
    expect(result.records[0].studentName).toBe('hs5');
    expect(result.summary).toMatchObject({
      totalSessions: 4,
      present: 2,
      absent: 1,
      excused: 1,
      attendanceRate: 50,
      unexcusedAbsences: 1,
    });
  });
});

describe('AttendanceService.getChildAttendance (privacy gate)', () => {
  const link = (over: Record<string, unknown> = {}) => ({
    id: 'l1',
    parentId: 50,
    studentId: 5,
    schoolId: SCHOOL_ID,
    status: ParentLinkStatus.APPROVED,
    ...over,
  });

  it('404s without a link, 400s while pending', async () => {
    const { service } = createService();
    await expect(service.getChildAttendance(50, 5)).rejects.toThrow(
      NotFoundException,
    );
    const { service: service2 } = createService({
      linkRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue(link({ status: ParentLinkStatus.PENDING })),
      }),
    });
    await expect(service2.getChildAttendance(50, 5)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('summarizes over the FULL history, returns at most 50 rows, no emails', async () => {
    const many = Array.from({ length: 55 }, (_, i) =>
      attendanceRow({
        id: `r${i}`,
        studentId: 5,
        status: i % 2 === 0 ? AttendanceStatus.PRESENT : AttendanceStatus.LATE,
      }),
    );
    const { service, attendanceRepository } = createService({
      linkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(link()),
      }),
      attendanceRepository: createRepository({
        find: jest.fn().mockResolvedValue(many),
      }),
    });
    const result = await service.getChildAttendance(50, 5);
    expect(result.summary.totalSessions).toBe(55);
    expect(result.summary.attendanceRate).toBe(100);
    expect(result.records).toHaveLength(50);
    // parents see date/period/status/note only — never identity extras
    expect(JSON.stringify(result)).not.toContain('school.vn');
    expect(attendanceRepository.find).toHaveBeenCalledWith({
      where: { schoolId: SCHOOL_ID, studentId: 5 },
      order: { date: 'DESC', periodNumber: 'DESC' },
    });
  });
});
