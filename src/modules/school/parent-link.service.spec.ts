import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ParentLinkService } from './parent-link.service';
import {
  ParentLinkStatus,
  ParentRelation,
} from './entities/parent-link.entity';

const SCHOOL_ID = '11111111-1111-1111-1111-111111111111';
const TEACHER_ID = 42; // homeroom teacher of class c1
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

const homeroomClass = (over: Record<string, unknown> = {}) => ({
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

const membership = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  classId: 'c1',
  studentId: 5,
  leftAt: null,
  ...over,
});

const linkRow = (over: Record<string, unknown> = {}) => ({
  id: 'l1',
  schoolId: SCHOOL_ID,
  parentId: null,
  studentId: 5,
  relation: ParentRelation.MOTHER,
  parentName: 'Trần Thị Bình',
  parentPhone: null,
  inviteCode: 'K7M2-QX9D',
  status: ParentLinkStatus.PENDING,
  approvedById: null,
  ...over,
});

const createService = (overrides: Record<string, any> = {}) => {
  const repos = {
    linkRepository: createRepository(),
    classRepository: createRepository(),
    membershipRepository: createRepository(),
    schoolRepository: createRepository(),
    userRepository: createRepository(),
    ...overrides,
  };
  const schoolService = {
    resolveSchoolIdForUser: jest.fn().mockResolvedValue(SCHOOL_ID),
  };
  const activityLog = {
    recordBestEffort: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ParentLinkService(
    repos.linkRepository,
    repos.classRepository,
    repos.membershipRepository,
    repos.schoolRepository,
    repos.userRepository,
    schoolService as any,
    activityLog as any,
  );
  return { service, schoolService, activityLog, ...repos };
};

/** class/membership/school/user repos already letting TEACHER_ID manage c1 */
const managerSetup = (over: Record<string, any> = {}) => ({
  classRepository: createRepository({
    findOne: jest.fn().mockResolvedValue(homeroomClass()),
    ...over.classRepository,
  }),
  membershipRepository: createRepository({
    findOne: jest.fn().mockResolvedValue(membership()),
    ...over.membershipRepository,
  }),
  ...over,
});

describe('ParentLinkService — class access (rule D1)', () => {
  it('404s a class from another school (lookup is { id, schoolId })', async () => {
    const { service, classRepository } = createService();
    await expect(
      service.inviteParent(TEACHER_ID, 'c-other', {
        studentId: 5,
        relation: ParentRelation.MOTHER,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(classRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'c-other', schoolId: SCHOOL_ID },
      relations: { academicYear: true },
    });
  });

  it('404s (never 403) for a teacher who is not the homeroom teacher', async () => {
    const { service, schoolRepository, userRepository } = createService(
      managerSetup({
        schoolRepository: createRepository({
          findOne: jest
            .fn()
            .mockResolvedValue({ id: SCHOOL_ID, principalId: PRINCIPAL_ID }),
        }),
        userRepository: createRepository({
          findOne: jest.fn().mockResolvedValue({ id: 77, roles: ['teacher'] }),
        }),
      }),
    );
    await expect(
      service.inviteParent(77, 'c1', {
        studentId: 5,
        relation: ParentRelation.FATHER,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('lets the school principal manage any class of their school', async () => {
    const { service, schoolRepository, linkRepository } = createService(
      managerSetup({
        schoolRepository: createRepository({
          findOne: jest
            .fn()
            .mockResolvedValue({ id: SCHOOL_ID, principalId: PRINCIPAL_ID }),
        }),
        linkRepository: createRepository({
          findOne: jest.fn().mockResolvedValue(null),
        }),
      }),
    );
    await expect(
      service.inviteParent(PRINCIPAL_ID, 'c1', {
        studentId: 5,
        relation: ParentRelation.GUARDIAN,
      }),
    ).resolves.toBeTruthy();
    expect(linkRepository.save).toHaveBeenCalled();
  });

  it('404s inviting for a student who is not active in the class', async () => {
    const { service, membershipRepository } = createService(
      managerSetup({
        membershipRepository: createRepository({
          findOne: jest.fn().mockResolvedValue(null),
        }),
      }),
    );
    await expect(
      service.inviteParent(TEACHER_ID, 'c1', {
        studentId: 555,
        relation: ParentRelation.MOTHER,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ParentLinkService#inviteParent', () => {
  it('creates a pending link with a shareable unique code', async () => {
    const { service, linkRepository, activityLog } =
      createService(managerSetup());
    const result = await service.inviteParent(TEACHER_ID, 'c1', {
      studentId: 5,
      relation: ParentRelation.MOTHER,
      parentName: 'Trần Thị Bình',
    });
    expect(linkRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        studentId: 5,
        relation: ParentRelation.MOTHER,
        parentName: 'Trần Thị Bình',
        status: ParentLinkStatus.PENDING,
        inviteCode: expect.stringMatching(
          /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/,
        ),
      }),
    );
    expect(activityLog.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'school.parent.invite' }),
    );
    expect(result).toBeDefined();
  });

  it('retries when the generated code clashes with an existing one', async () => {
    let first = true;
    const { service, linkRepository } = createService(
      managerSetup({
        linkRepository: createRepository({
          findOne: jest.fn().mockImplementation(async (opts: any) => {
            if (opts?.where?.inviteCode) {
              if (first) {
                first = false;
                return linkRow(); // clash on the first attempt
              }
              return null; // free on the second
            }
            return null;
          }),
        }),
      }),
    );
    await service.inviteParent(TEACHER_ID, 'c1', {
      studentId: 5,
      relation: ParentRelation.FATHER,
    });
    expect(linkRepository.findOne).toHaveBeenCalledWith({
      where: { inviteCode: expect.stringMatching(/^[A-HJ-NP-Z2-9]{4}-/) },
    });
    expect(linkRepository.save).toHaveBeenCalled();
  });
});

describe('ParentLinkService#approveLink / #revokeLink', () => {
  const approveSetup = (link: Record<string, unknown>) =>
    managerSetup({
      linkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(link),
        save: jest.fn((value: any) => Promise.resolve(value)),
      }),
    });

  it('rejects approving before the parent has used the code', async () => {
    const { service } = createService(
      approveSetup(
        linkRow({ parentId: null, status: ParentLinkStatus.PENDING }),
      ),
    );
    await expect(service.approveLink(TEACHER_ID, 'c1', 'l1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('approves a claimed link and records the approver', async () => {
    const { service, linkRepository } = createService(
      approveSetup(linkRow({ parentId: 7, status: ParentLinkStatus.PENDING })),
    );
    const saved = await service.approveLink(TEACHER_ID, 'c1', 'l1');
    expect(saved.status).toBe(ParentLinkStatus.APPROVED);
    expect(saved.approvedById).toBe(TEACHER_ID);
    expect(linkRepository.save).toHaveBeenCalled();
  });

  it('idempotently returns an already-approved link without saving', async () => {
    const { service, linkRepository } = createService(
      approveSetup(linkRow({ parentId: 7, status: ParentLinkStatus.APPROVED })),
    );
    const result = await service.approveLink(TEACHER_ID, 'c1', 'l1');
    expect(result.status).toBe(ParentLinkStatus.APPROVED);
    expect(linkRepository.save).not.toHaveBeenCalled();
  });

  it('cannot approve a revoked link', async () => {
    const { service } = createService(
      approveSetup(linkRow({ parentId: 7, status: ParentLinkStatus.REVOKED })),
    );
    await expect(service.approveLink(TEACHER_ID, 'c1', 'l1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('404s a link outside the school (D1)', async () => {
    const { service, linkRepository } = createService(managerSetup());
    await expect(
      service.revokeLink(TEACHER_ID, 'c1', 'l-other'),
    ).rejects.toThrow(NotFoundException);
    expect(linkRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'l-other', schoolId: SCHOOL_ID },
    });
  });

  it('revokes an approved link', async () => {
    const { service } = createService(
      approveSetup(linkRow({ parentId: 7, status: ParentLinkStatus.APPROVED })),
    );
    const saved = await service.revokeLink(TEACHER_ID, 'c1', 'l1');
    expect(saved.status).toBe(ParentLinkStatus.REVOKED);
    expect(saved.approvedById).toBe(TEACHER_ID);
  });
});

describe('ParentLinkService#claimInvite', () => {
  const claimSetup = (
    link: Record<string, unknown> | null,
    duplicate: unknown = null,
  ) => ({
    linkRepository: createRepository({
      findOne: jest.fn(async (opts: any) => {
        if (opts?.where?.inviteCode)
          return link
            ? {
                ...link,
                student: {
                  id: 5,
                  name: 'Nguyễn Văn An',
                  email: 'hs@x.vn',
                  passwordHash: 'secret',
                },
              }
            : null;
        if (opts?.where?.parentId) return duplicate;
        return null;
      }),
      save: jest.fn((value: any) => Promise.resolve(value)),
    }),
  });

  it('normalizes the code and rejects unknown or already-claimed ones', async () => {
    const { service, linkRepository } = createService(claimSetup(null));
    await expect(service.claimInvite(7, ' nope1 ')).rejects.toThrow(
      NotFoundException,
    );
    expect(linkRepository.findOne).toHaveBeenCalledWith({
      where: { inviteCode: 'NOPE1' },
      relations: { student: true },
    });

    const claimed = createService(claimSetup(linkRow({ parentId: 123 })));
    await expect(claimed.service.claimInvite(7, 'K7M2-QX9D')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects revoked codes', async () => {
    const { service } = createService(
      claimSetup(linkRow({ status: ParentLinkStatus.REVOKED })),
    );
    await expect(service.claimInvite(7, 'K7M2-QX9D')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('blocks double-linking the same parent to the same student', async () => {
    const { service } = createService(
      claimSetup(linkRow(), linkRow({ id: 'l-old', parentId: 7 })),
    );
    await expect(service.claimInvite(7, 'K7M2-QX9D')).rejects.toThrow(
      ConflictException,
    );
  });

  it('attaches the parent, grants PARENT role, and keeps status pending for approval', async () => {
    const parent = { id: 7, roles: ['user'], email: 'ph@x.vn' };
    const { service, linkRepository, userRepository } = createService(
      claimSetup(linkRow()),
    );
    userRepository.findOne.mockResolvedValue(parent);
    const result = await service.claimInvite(7, 'k7m2-qx9d');
    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 7,
        roles: expect.arrayContaining(['parent']),
      }),
    );
    expect(linkRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 7,
        status: ParentLinkStatus.PENDING,
      }),
    );
    expect(result).toMatchObject({
      status: ParentLinkStatus.PENDING,
      childName: 'Nguyễn Văn An',
    });
    // the response must never carry student secrets
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('hs@x.vn');
  });
});

describe('ParentLinkService — parent portal reads', () => {
  it('lists children with class info and hides revoked links', async () => {
    const { service, linkRepository } = createService({
      linkRepository: createRepository({
        find: jest.fn().mockResolvedValue([
          linkRow({
            id: 'l1',
            parentId: 7,
            studentId: 5,
            status: ParentLinkStatus.APPROVED,
            student: { id: 5, name: 'An' },
          }),
          linkRow({
            id: 'l2',
            parentId: 7,
            studentId: 6,
            status: ParentLinkStatus.PENDING,
            student: { id: 6, name: 'Bình' },
          }),
        ]),
      }),
      membershipRepository: createRepository({
        find: jest.fn().mockResolvedValue([
          {
            studentId: 5,
            class: {
              id: 'c1',
              name: '6A',
              grade: 6,
              academicYear: { name: '2026-2027' },
            },
          },
        ]),
      }),
    });
    const children = await service.listMyChildren(7);
    expect(linkRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ parentId: 7 }),
      }),
    );
    expect(children).toHaveLength(2);
    expect(children[0]).toMatchObject({
      studentId: 5,
      childName: 'An',
      status: ParentLinkStatus.APPROVED,
      className: '6A',
      academicYear: '2026-2027',
    });
    expect(children[1]).toMatchObject({ studentId: 6, classId: null });
  });

  it('404s a profile for a student not linked to the caller', async () => {
    const { service } = createService();
    await expect(service.getMyChildProfile(7, 5)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('tells the caller to wait while the link is still pending', async () => {
    const { service, linkRepository } = createService({
      linkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(
          linkRow({
            parentId: 7,
            status: ParentLinkStatus.PENDING,
            student: { id: 5, name: 'An' },
          }),
        ),
      }),
    });
    await expect(service.getMyChildProfile(7, 5)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns the approved profile without student or teacher secrets', async () => {
    const { service, linkRepository, membershipRepository } = createService({
      linkRepository: createRepository({
        findOne: jest.fn().mockResolvedValue(
          linkRow({
            parentId: 7,
            status: ParentLinkStatus.APPROVED,
            student: {
              id: 5,
              name: 'An',
              email: 'hs@x.vn',
              passwordHash: 'secret',
            },
          }),
        ),
      }),
      membershipRepository: createRepository({
        findOne: jest.fn().mockResolvedValue({
          studentId: 5,
          leftAt: null,
          class: {
            id: 'c1',
            name: '6A',
            grade: 6,
            room: 'A2-104',
            academicYear: { name: '2026-2027' },
            school: { name: 'Trường Xanh' },
            homeroomTeacher: {
              id: 42,
              name: 'Cô Hòa',
              email: 'hoa@x.vn',
              passwordHash: 'secret',
            },
          },
        }),
      }),
    });
    const profile = await service.getMyChildProfile(7, 5);
    expect(profile).toMatchObject({
      child: { id: 5, name: 'An' },
      class: {
        name: '6A',
        room: 'A2-104',
        schoolName: 'Trường Xanh',
        homeroomTeacher: { id: 42, name: 'Cô Hòa', email: 'hoa@x.vn' },
      },
    });
    expect(JSON.stringify(profile)).not.toContain('secret');
    expect(JSON.stringify(profile)).not.toContain('hs@x.vn');
  });
});

describe('ParentLinkService#listMyHomeroomClasses', () => {
  it('scopes to homeroomTeacherId and attaches live roster counts', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ classId: 'c1', count: '23' }]),
    };
    const { service, classRepository, membershipRepository } = createService({
      classRepository: createRepository({
        find: jest.fn().mockResolvedValue([homeroomClass()]),
      }),
      membershipRepository: createRepository({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      }),
    });
    const classes = await service.listMyHomeroomClasses(TEACHER_ID);
    expect(classRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { homeroomTeacherId: TEACHER_ID, active: true },
      }),
    );
    expect(classes).toHaveLength(1);
    expect(classes[0]).toMatchObject({ id: 'c1', studentCount: 23 });
  });
});
