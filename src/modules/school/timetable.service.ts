import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { TimeSlot } from './entities/time-slot.entity';
import { SchoolClass } from './entities/school-class.entity';
import { Subject } from './entities/subject.entity';
import { School, DEFAULT_PERIOD_CONFIG } from './entities/school.entity';
import { TeachingAssignment } from './entities/teaching-assignment.entity';
import { ClassMembership } from './entities/class-membership.entity';
import { ParentLink, ParentLinkStatus } from './entities/parent-link.entity';
import { User } from '../users/entities/user.entity';
import { SchoolService } from './school.service';
import { redactUserSecrets } from './school-sanitize.util';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { UserRole } from '../../common/enums/roles.enum';
import {
  findTimetableConflicts,
  ConflictSlot,
  TimetableConflict,
} from './domain/timetable-conflict.policy';
import {
  CreateTimetableSlotDto,
  ValidateTimetableDto,
} from './dto/timetable.dto';

/** What the FE grid renders per cell (no user secrets — name only). */
export interface TimetableSlotView {
  id: string;
  weekday: number;
  periodNumber: number;
  room: string | null;
  subject: { id: string; name: string; code: string; color: string | null };
  teacher: { id: number; name: string | null };
  className?: string; // present on "my timetable" (teacher crosses classes)
}

/**
 * Phase 3 (docs/SCHOOL_PLATFORM_PLAN.md): time table.
 * Writes are principal/ADMIN (MVP per plan §3.3); conflicts are blocked
 * BEFORE write by the pure policy. Reads are tenant-scoped — every denial
 * is a 404 that looks identical to a nonexistent row (rule D1).
 */
@Injectable()
export class TimetableService {
  constructor(
    @InjectRepository(TimeSlot)
    private readonly slotRepository: Repository<TimeSlot>,
    @InjectRepository(SchoolClass)
    private readonly classRepository: Repository<SchoolClass>,
    @InjectRepository(Subject)
    private readonly subjectRepository: Repository<Subject>,
    @InjectRepository(ClassMembership)
    private readonly membershipRepository: Repository<ClassMembership>,
    @InjectRepository(TeachingAssignment)
    private readonly assignmentRepository: Repository<TeachingAssignment>,
    @InjectRepository(ParentLink)
    private readonly linkRepository: Repository<ParentLink>,
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly schoolService: SchoolService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ---------- reads ----------

  /** Weekly grid of one class, for staff who touch that class. */
  async getTimetableForClass(userId: number, classId: string) {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const cls = await this.classRepository.findOne({
      where: { id: classId, schoolId },
      relations: { academicYear: true },
    });
    if (!cls) throw new NotFoundException('Class not found');

    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
    });
    const allowed =
      cls.homeroomTeacherId === userId ||
      school?.principalId === userId ||
      (await this.isTeacherOfThisClass(userId, cls.id, schoolId)) ||
      (await this.hasAdminRole(userId));
    if (!allowed) throw new NotFoundException('Class not found');

    const slots = await this.slotRepository.find({
      where: { classId: cls.id },
      relations: { subject: true, teacher: true },
      order: { weekday: 'ASC', periodNumber: 'ASC' },
    });
    return {
      classId: cls.id,
      className: cls.name,
      grade: cls.grade,
      academicYear: cls.academicYear?.name ?? null,
      periodConfig: school?.periodConfig ?? DEFAULT_PERIOD_CONFIG,
      slots: slots.map((s) => this.toView(s)),
    };
  }

  /**
   * "TKK của tôi": TEACHER sees their own slots across classes;
   * STUDENT sees the grid of their active class.
   */
  async getMyTimetable(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const roles = user?.roles ?? [];

    if (roles.includes(UserRole.TEACHER)) {
      const slots = await this.slotRepository.find({
        where: { teacherId: userId },
        relations: { subject: true, schoolClass: true },
        order: { weekday: 'ASC', periodNumber: 'ASC' },
      });
      let periodConfig = DEFAULT_PERIOD_CONFIG;
      try {
        const schoolId =
          await this.schoolService.resolveSchoolIdForUser(userId);
        const school = await this.schoolRepository.findOne({
          where: { id: schoolId },
        });
        periodConfig = school?.periodConfig ?? DEFAULT_PERIOD_CONFIG;
      } catch {
        // A teacher without a resolvable school still gets the default grid.
      }
      return {
        as: 'teacher' as const,
        periodConfig,
        slots: slots.map((s) =>
          this.toView(s, { className: s.schoolClass?.name ?? '' }),
        ),
      };
    }

    const membership = await this.membershipRepository.findOne({
      where: { studentId: userId, leftAt: IsNull() },
      relations: { class: { academicYear: true } },
    });
    if (!membership?.class) {
      throw new NotFoundException(
        'No timetable available for your account yet',
      );
    }
    const cls = membership.class;
    const school = await this.schoolRepository.findOne({
      where: { id: membership.schoolId },
    });
    const slots = await this.slotRepository.find({
      where: { classId: cls.id },
      relations: { subject: true, teacher: true },
      order: { weekday: 'ASC', periodNumber: 'ASC' },
    });
    return {
      as: 'student' as const,
      class: {
        id: cls.id,
        name: cls.name,
        grade: cls.grade,
        academicYear: cls.academicYear?.name ?? null,
      },
      periodConfig: school?.periodConfig ?? DEFAULT_PERIOD_CONFIG,
      slots: slots.map((s) => this.toView(s)),
    };
  }

  // ---------- writes (principal / ADMIN — plan §3.3) ----------

  async createSlot(userId: number, dto: CreateTimetableSlotDto) {
    const schoolId = await this.assertSchoolAdmin(userId);
    const cls = await this.classRepository.findOne({
      where: { id: dto.classId, schoolId },
    });
    if (!cls) throw new NotFoundException('Class not found');
    const subject = await this.subjectRepository.findOne({
      where: { id: dto.subjectId, schoolId, active: true },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    // Timetable integrity: only assign a teacher the principal already
    // published via TeachingAssignment (Phase 1).
    const assignment = await this.assignmentRepository.findOne({
      where: {
        teacherId: dto.teacherId,
        subjectId: dto.subjectId,
        classId: cls.id,
        schoolId,
      },
    });
    if (!assignment) {
      throw new BadRequestException(
        'This teacher is not assigned to teach this subject to this class',
      );
    }

    const room = dto.room?.trim() || null;

    // The DB unique guards the class cell; the policy guards teacher/room
    // across classes BEFORE the write so the error is human-readable.
    const sameCell = await this.slotRepository.findOne({
      where: {
        classId: cls.id,
        weekday: dto.weekday,
        periodNumber: dto.periodNumber,
      },
    });
    if (sameCell) {
      throw new ConflictException(
        `Class ${cls.name} already has a slot on weekday ${dto.weekday} period ${dto.periodNumber}`,
      );
    }
    const cellSlots = await this.slotRepository.find({
      where: { schoolId, weekday: dto.weekday, periodNumber: dto.periodNumber },
    });
    const conflicts = findTimetableConflicts([
      ...cellSlots.map((s, i) => this.toConflictSlot(s, i)),
      {
        index: cellSlots.length,
        id: undefined,
        classId: cls.id,
        teacherId: dto.teacherId,
        room,
        weekday: dto.weekday,
        periodNumber: dto.periodNumber,
      } satisfies ConflictSlot,
    ]);
    if (conflicts.length > 0) {
      throw new ConflictException(conflicts[0].message);
    }

    const saved = await this.slotRepository.save(
      this.slotRepository.create({
        schoolId,
        classId: cls.id,
        subjectId: subject.id,
        teacherId: dto.teacherId,
        academicYearId: cls.academicYearId,
        weekday: dto.weekday,
        periodNumber: dto.periodNumber,
        room,
      }),
    );
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.timetable.slot_add',
      detail: `Xếp ${subject.name} vào lớp ${cls.name} (thứ ${dto.weekday}, tiết ${dto.periodNumber})`,
      metadata: {
        schoolId,
        classId: cls.id,
        subjectId: subject.id,
        slotId: saved.id,
      },
    });
    const withRelations = await this.slotRepository.findOne({
      where: { id: saved.id },
      relations: { subject: true, teacher: true },
    });
    return this.toView(withRelations ?? saved);
  }

  async deleteSlot(userId: number, slotId: string): Promise<void> {
    const schoolId = await this.assertSchoolAdmin(userId);
    const slot = await this.slotRepository.findOne({
      where: { id: slotId, schoolId },
    });
    if (!slot) throw new NotFoundException('Slot not found');
    await this.slotRepository.remove(slot);
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.timetable.slot_remove',
      detail: `Xóa tiết thứ ${slot.weekday} tiết ${slot.periodNumber} khỏi lịch`,
      metadata: { schoolId, slotId: slot.id, classId: slot.classId },
    });
  }

  /** What-if check over a proposed grid (FE highlights before save). */
  async validate(
    userId: number,
    dto: ValidateTimetableDto,
  ): Promise<{ conflicts: TimetableConflict[] }> {
    await this.assertSchoolAdmin(userId);
    const conflicts = findTimetableConflicts(
      dto.slots.map((s, i) => ({
        index: i,
        classId: s.classId,
        teacherId: s.teacherId,
        room: s.room ?? null,
        weekday: s.weekday,
        periodNumber: s.periodNumber,
      })),
    );
    return { conflicts };
  }

  // ---------- parent side ----------

  /** Child's class timetable — APPROVED links only (same gate as profile). */
  async getChildTimetable(parentUserId: number, studentId: number) {
    const link = await this.findApprovedLink(parentUserId, studentId);
    const membership = await this.membershipRepository.findOne({
      where: { studentId, leftAt: IsNull() },
      relations: { class: true },
    });
    const cls = membership?.class;
    const school = await this.schoolRepository.findOne({
      where: { id: link.schoolId },
    });
    const slots = cls
      ? await this.slotRepository.find({
          where: { classId: cls.id },
          relations: { subject: true, teacher: true },
          order: { weekday: 'ASC', periodNumber: 'ASC' },
        })
      : [];
    return {
      child: { id: studentId, name: link.student?.name ?? null },
      class: cls ? { id: cls.id, name: cls.name, grade: cls.grade } : null,
      periodConfig: school?.periodConfig ?? DEFAULT_PERIOD_CONFIG,
      // Parents never see emails — teacher id/name only (privacy, Phase 2 rule).
      slots: slots.map((s) => this.toView(s, { includeEmail: false })),
    };
  }

  // ---------- helpers ----------

  /** Principal of the caller's school or ADMIN; denial looks like 404 (D1). */
  private async assertSchoolAdmin(userId: number): Promise<string> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
    });
    if (!school) throw new NotFoundException('School not found');
    if (school.principalId === userId) return schoolId;
    if (await this.hasAdminRole(userId)) return schoolId;
    throw new NotFoundException('School not found');
  }

  private async findApprovedLink(
    parentUserId: number,
    studentId: number,
  ): Promise<ParentLink> {
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
    redactUserSecrets(link.student);
    return link;
  }

  private async isTeacherOfThisClass(
    userId: number,
    classId: string,
    schoolId: string,
  ): Promise<boolean> {
    const assignment = await this.assignmentRepository.findOne({
      where: { teacherId: userId, classId, schoolId },
    });
    return Boolean(assignment);
  }

  private async hasAdminRole(userId: number): Promise<boolean> {
    const actor = await this.userRepository.findOne({ where: { id: userId } });
    return Boolean(actor?.roles?.includes(UserRole.ADMIN));
  }

  private toConflictSlot(slot: TimeSlot, index: number): ConflictSlot {
    return {
      index,
      id: slot.id,
      classId: slot.classId,
      teacherId: slot.teacherId,
      room: slot.room ?? null,
      weekday: slot.weekday,
      periodNumber: slot.periodNumber,
    };
  }

  private toView(
    slot: TimeSlot,
    extra?: { className?: string; includeEmail?: boolean },
  ): TimetableSlotView {
    redactUserSecrets(slot.teacher);
    return {
      id: slot.id,
      weekday: slot.weekday,
      periodNumber: slot.periodNumber,
      room: slot.room ?? null,
      subject: {
        id: slot.subject?.id ?? slot.subjectId,
        name: slot.subject?.name ?? '',
        code: slot.subject?.code ?? '',
        color: slot.subject?.color ?? null,
      },
      teacher: {
        id: slot.teacherId,
        name: slot.teacher?.name ?? null,
      },
      className: extra?.className,
    };
  }
}
