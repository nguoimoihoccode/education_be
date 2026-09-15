import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { In, IsNull, Repository } from 'typeorm';
import {
  ParentLink,
  ParentLinkStatus,
  ParentRelation,
} from './entities/parent-link.entity';
import { SchoolClass } from './entities/school-class.entity';
import { ClassMembership } from './entities/class-membership.entity';
import { School } from './entities/school.entity';
import { User } from '../users/entities/user.entity';
import { SchoolService } from './school.service';
import { redactUserSecrets } from './school-sanitize.util';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { UserRole } from '../../common/enums/roles.enum';
import { InviteParentDto } from './dto/parent-link.dto';

/** Shape returned to the parent portal (never raw entities — students'
 *  emails/passwords stay private from parents in MVP). */
export interface MyChildSummary {
  linkId: string;
  studentId: number;
  childName: string | null;
  relation: ParentRelation;
  status: ParentLinkStatus;
  classId: string | null;
  className: string | null;
  grade: number | null;
  academicYear: string | null;
}

/**
 * Phase 2 (docs/SCHOOL_PLATFORM_PLAN.md): GVCN ↔ phụ huynh invite flow.
 *
 * Access rule for the staff side: homeroom teacher of THAT class, the school
 * principal, or ADMIN. Every failure is a 404 — a wrong id or a class you
 * don't manage look identical (rule D1, no existence leaks).
 */
@Injectable()
export class ParentLinkService {
  constructor(
    @InjectRepository(ParentLink)
    private readonly linkRepository: Repository<ParentLink>,
    @InjectRepository(SchoolClass)
    private readonly classRepository: Repository<SchoolClass>,
    @InjectRepository(ClassMembership)
    private readonly membershipRepository: Repository<ClassMembership>,
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly schoolService: SchoolService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ---------- GVCN hub ----------

  /** Classes the user is homeroom teacher of (active), with roster size. */
  async listMyHomeroomClasses(userId: number) {
    const classes = await this.classRepository.find({
      where: { homeroomTeacherId: userId, active: true },
      relations: { academicYear: true },
      order: { grade: 'ASC', name: 'ASC' },
    });
    if (classes.length === 0) return [];
    const counts = await this.membershipRepository
      .createQueryBuilder('m')
      .select('m.class_id', 'classId')
      .addSelect('COUNT(*)', 'count')
      .where('m.class_id IN (:...ids)', { ids: classes.map((c) => c.id) })
      .andWhere('m.left_at IS NULL')
      .groupBy('m.class_id')
      .getRawMany<{ classId: string; count: string }>();
    const countByClass = new Map(
      counts.map((r) => [r.classId, Number.parseInt(r.count, 10)]),
    );
    return classes.map((cls) => ({
      ...cls,
      studentCount: countByClass.get(cls.id) ?? 0,
    }));
  }

  /**
   * Load a class the user may manage as GVCN (or principal/ADMIN).
   * Tenant-safe by construction: school comes from the JWT user, never the request.
   */
  private async assertClassAccess(userId: number, classId: string) {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const cls = await this.classRepository.findOne({
      where: { id: classId, schoolId },
      relations: { academicYear: true },
    });
    if (!cls) throw new NotFoundException('Class not found');
    if (cls.homeroomTeacherId === userId) return cls;
    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
    });
    if (school?.principalId === userId) return cls;
    const actor = await this.userRepository.findOne({ where: { id: userId } });
    if (actor?.roles?.includes(UserRole.ADMIN)) return cls;
    // Same 404 as a nonexistent class — do not reveal that the class exists.
    throw new NotFoundException('Class not found');
  }

  private async getActiveMembership(cls: SchoolClass, studentId: number) {
    const membership = await this.membershipRepository.findOne({
      where: { classId: cls.id, studentId, leftAt: IsNull() },
    });
    if (!membership) {
      throw new NotFoundException(
        'Student is not an active member of this class',
      );
    }
    return membership;
  }

  /** Roster for the teaching hub (GVCN-scoped variant of the principal one). */
  async listClassRoster(userId: number, classId: string) {
    const cls = await this.assertClassAccess(userId, classId);
    const memberships = await this.membershipRepository.find({
      where: { classId: cls.id, leftAt: IsNull() },
      relations: { student: true },
      order: { joinedAt: 'ASC' },
    });
    return memberships.map((m) => {
      redactUserSecrets(m.student);
      return {
        membershipId: m.id,
        joinedAt: m.joinedAt,
        student: {
          id: m.student?.id ?? m.studentId,
          name: m.student?.name ?? null,
          email: m.student?.email ?? '',
        },
      };
    });
  }

  // ---------- invite flow (staff side) ----------

  async inviteParent(
    userId: number,
    classId: string,
    dto: InviteParentDto,
  ): Promise<ParentLink> {
    const cls = await this.assertClassAccess(userId, classId);
    await this.getActiveMembership(cls, dto.studentId);
    const link = await this.linkRepository.save(
      this.linkRepository.create({
        schoolId: cls.schoolId,
        studentId: dto.studentId,
        relation: dto.relation,
        parentName: dto.parentName ?? null,
        parentPhone: dto.parentPhone ?? null,
        inviteCode: await this.generateInviteCode(),
        status: ParentLinkStatus.PENDING,
      }),
    );
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.parent.invite',
      detail: `Sinh mã mời phụ huynh cho HS ${dto.studentId} lớp ${cls.name}`,
      metadata: {
        schoolId: cls.schoolId,
        classId: cls.id,
        linkId: link.id,
        studentId: dto.studentId,
      },
    });
    const withStudent = await this.linkRepository.findOne({
      where: { id: link.id },
      relations: { student: true },
    });
    redactUserSecrets(withStudent?.student);
    return withStudent ?? link;
  }

  async listClassParents(userId: number, classId: string) {
    const cls = await this.assertClassAccess(userId, classId);
    const memberships = await this.membershipRepository.find({
      where: { classId: cls.id, leftAt: IsNull() },
    });
    const studentIds = memberships.map((m) => m.studentId);
    if (studentIds.length === 0) return [];
    const links = await this.linkRepository.find({
      where: { schoolId: cls.schoolId, studentId: In(studentIds) },
      relations: { student: true, parent: true },
      order: { createdAt: 'DESC' },
    });
    return links.map((l) => {
      redactUserSecrets(l.student);
      redactUserSecrets(l.parent);
      return {
        linkId: l.id,
        inviteCode: l.inviteCode,
        status: l.status,
        relation: l.relation,
        parentName: l.parentName ?? null,
        parentPhone: l.parentPhone ?? null,
        student: {
          id: l.studentId,
          name: l.student?.name ?? null,
          email: l.student?.email ?? '',
        },
        parent: l.parent
          ? {
              id: l.parentId!,
              name: l.parent.name ?? null,
              email: l.parent.email,
            }
          : null,
        createdAt: l.createdAt,
      };
    });
  }

  async approveLink(
    userId: number,
    classId: string,
    linkId: string,
  ): Promise<ParentLink> {
    const link = await this.findManagedLink(userId, classId, linkId);
    if (link.status === ParentLinkStatus.APPROVED) return link; // idempotent
    if (link.status === ParentLinkStatus.REVOKED) {
      throw new BadRequestException('Cannot approve a revoked invitation');
    }
    if (!link.parentId) {
      throw new BadRequestException(
        'Parent has not used the invite code yet — nothing to approve',
      );
    }
    link.status = ParentLinkStatus.APPROVED;
    link.approvedById = userId;
    const saved = await this.linkRepository.save(link);
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.parent.approve',
      detail: `Duyệt phụ huynh ${link.parentId} cho HS ${link.studentId}`,
      metadata: { schoolId: link.schoolId, linkId: link.id },
    });
    return saved;
  }

  async revokeLink(
    userId: number,
    classId: string,
    linkId: string,
  ): Promise<ParentLink> {
    const link = await this.findManagedLink(userId, classId, linkId);
    if (link.status === ParentLinkStatus.REVOKED) return link; // idempotent
    link.status = ParentLinkStatus.REVOKED;
    link.approvedById = userId;
    const saved = await this.linkRepository.save(link);
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.parent.revoke',
      detail: `Thu hồi liên kết phụ huynh ${link.parentId ?? link.inviteCode}`,
      metadata: { schoolId: link.schoolId, linkId: link.id },
    });
    return saved;
  }

  /** Link must exist in this school AND belong to a student of this class. */
  private async findManagedLink(
    userId: number,
    classId: string,
    linkId: string,
  ): Promise<ParentLink> {
    const cls = await this.assertClassAccess(userId, classId);
    const link = await this.linkRepository.findOne({
      where: { id: linkId, schoolId: cls.schoolId },
    });
    if (!link) throw new NotFoundException('Invitation not found');
    await this.getActiveMembership(cls, link.studentId);
    return link;
  }

  // ---------- parent side ----------

  /**
   * Redeem an invite code. The code itself is the authorization, so this is
   * open to any authenticated account; a successful claim grants PARENT.
   * Status stays `pending` — the GVCN has the final say (design D5).
   */
  async claimInvite(userId: number, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    const link = await this.linkRepository.findOne({
      where: { inviteCode: code },
      relations: { student: true },
    });
    // A claimed code (parentId set) or non-pending code can't be redeemed again.
    if (!link || link.status !== ParentLinkStatus.PENDING || link.parentId) {
      throw new NotFoundException('Invite code not found or already used');
    }
    const duplicate = await this.linkRepository.findOne({
      where: {
        parentId: userId,
        studentId: link.studentId,
        status: In([ParentLinkStatus.PENDING, ParentLinkStatus.APPROVED]),
      },
    });
    if (duplicate) {
      throw new ConflictException('You are already linked to this student');
    }
    const parent = await this.userRepository.findOne({ where: { id: userId } });
    if (!parent) throw new NotFoundException('Account not found');
    if (!parent.roles?.includes(UserRole.PARENT)) {
      parent.roles = [...(parent.roles ?? []), UserRole.PARENT];
      await this.userRepository.save(parent);
    }
    link.parentId = userId;
    const saved = await this.linkRepository.save(link);
    redactUserSecrets(saved.student);
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.parent.claim',
      detail: `Nhập mã mời liên kết với HS ${saved.studentId}`,
      metadata: { schoolId: saved.schoolId, linkId: saved.id },
    });
    return {
      linkId: saved.id,
      status: saved.status,
      childName: saved.student?.name ?? null,
      roles: parent.roles,
    };
  }

  /** Everything the claimer can see — pending rows included, revoked hidden. */
  async listMyChildren(parentUserId: number): Promise<MyChildSummary[]> {
    const links = await this.linkRepository.find({
      where: {
        parentId: parentUserId,
        status: In([ParentLinkStatus.PENDING, ParentLinkStatus.APPROVED]),
      },
      relations: { student: true },
      order: { createdAt: 'ASC' },
    });
    if (links.length === 0) return [];
    const memberships = await this.membershipRepository.find({
      where: {
        studentId: In(links.map((l) => l.studentId)),
        leftAt: IsNull(),
      },
      relations: { class: { academicYear: true } },
    });
    const classByStudent = new Map(
      memberships.map((m) => [m.studentId, m.class]),
    );
    return links.map((l) => {
      const cls = classByStudent.get(l.studentId);
      return {
        linkId: l.id,
        studentId: l.studentId,
        childName: l.student?.name ?? null,
        relation: l.relation,
        status: l.status,
        classId: cls?.id ?? null,
        className: cls?.name ?? null,
        grade: cls?.grade ?? null,
        academicYear: cls?.academicYear?.name ?? null,
      };
    });
  }

  /** Child profile for the parent portal. APPROVED links only. */
  async getMyChildProfile(parentUserId: number, studentId: number) {
    const link = await this.linkRepository.findOne({
      where: {
        parentId: parentUserId,
        studentId,
        status: In([ParentLinkStatus.PENDING, ParentLinkStatus.APPROVED]),
      },
      relations: { student: true },
    });
    if (!link) throw new NotFoundException('Child not found');
    if (link.status !== ParentLinkStatus.APPROVED) {
      throw new BadRequestException(
        'Waiting for the class teacher to approve this link',
      );
    }
    const membership = await this.membershipRepository.findOne({
      where: { studentId, leftAt: IsNull() },
      relations: {
        class: { academicYear: true, homeroomTeacher: true, school: true },
      },
    });
    const cls = membership?.class;
    redactUserSecrets(link.student);
    redactUserSecrets(cls?.homeroomTeacher);
    return {
      child: {
        id: link.studentId,
        name: link.student?.name ?? null,
      },
      relation: link.relation,
      class: cls
        ? {
            id: cls.id,
            name: cls.name,
            grade: cls.grade,
            room: cls.room ?? null,
            academicYear: cls.academicYear?.name ?? null,
            schoolName: cls.school?.name ?? null,
            homeroomTeacher: cls.homeroomTeacher
              ? {
                  id: cls.homeroomTeacher.id,
                  name: cls.homeroomTeacher.name ?? null,
                  email: cls.homeroomTeacher.email,
                }
              : null,
          }
        : null,
    };
  }

  // ---------- helpers ----------

  /** Human-shareable code (no confusable chars), e.g. "K7M2-QX9D". */
  private async generateInviteCode(): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 5; attempt++) {
      const raw = Array.from(randomBytes(8))
        .map((b) => alphabet[b % alphabet.length])
        .join('');
      const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
      const clash = await this.linkRepository.findOne({
        where: { inviteCode: code },
      });
      if (!clash) return code;
    }
    throw new ConflictException('Could not generate a unique invite code');
  }
}
