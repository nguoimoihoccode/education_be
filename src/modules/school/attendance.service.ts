import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, Repository } from 'typeorm';
import {
  AttendanceRecord,
  AttendanceStatus,
} from './entities/attendance-record.entity';
import { SchoolClass } from './entities/school-class.entity';
import { ClassMembership } from './entities/class-membership.entity';
import { TimeSlot } from './entities/time-slot.entity';
import { TeachingAssignment } from './entities/teaching-assignment.entity';
import { ParentLink, ParentLinkStatus } from './entities/parent-link.entity';
import { School, DEFAULT_PERIOD_CONFIG } from './entities/school.entity';
import { User } from '../users/entities/user.entity';
import { SchoolService } from './school.service';
import { redactUserSecrets } from './school-sanitize.util';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { UserRole } from '../../common/enums/roles.enum';
import {
  summarizeAttendance,
  AttendanceSummary,
} from './domain/attendance-rate.policy';
import { TakeAttendanceDto } from './dto/timetable.dto';

/**
 * Phase 3 (docs/SCHOOL_PLATFORM_PLAN.md): attendance (điểm danh).
 * Write access = who may TEACH that class: its GVCN, any teacher holding a
 * TeachingAssignment there, the principal, or ADMIN. Every denial is a 404
 * that matches a nonexistent class (rule D1).
 */
@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepository: Repository<AttendanceRecord>,
    @InjectRepository(SchoolClass)
    private readonly classRepository: Repository<SchoolClass>,
    @InjectRepository(ClassMembership)
    private readonly membershipRepository: Repository<ClassMembership>,
    @InjectRepository(TimeSlot)
    private readonly slotRepository: Repository<TimeSlot>,
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

  // ---------- teacher / staff side ----------

  /**
   * Data for the quick attendance screen (one tiết): roster pre-loaded with
   * any existing statuses so re-opening a session never starts from blank.
   */
  async getSession(
    userId: number,
    classId: string,
    date: string,
    periodNumber: number,
  ) {
    this.assertDate(date);
    const cls = await this.assertManageAccess(userId, classId);
    const weekday = this.weekdayOf(date);

    const slot = await this.slotRepository.findOne({
      where: { classId: cls.id, weekday, periodNumber },
      relations: { subject: true, teacher: true },
    });
    const memberships = await this.membershipRepository.find({
      where: { classId: cls.id, leftAt: IsNull() },
      relations: { student: true },
      order: { joinedAt: 'ASC' },
    });
    const existing = await this.attendanceRepository.find({
      where: { classId: cls.id, date, periodNumber },
    });
    const byStudent = new Map(existing.map((r) => [r.studentId, r]));

    return {
      classId: cls.id,
      className: cls.name,
      date,
      weekday,
      periodNumber,
      // null = no scheduled slot at this time — manual sessions are allowed
      slot: slot
        ? {
            subjectName: slot.subject?.name ?? null,
            color: slot.subject?.color ?? null,
            teacherName: slot.teacher?.name ?? null,
          }
        : null,
      students: memberships.map((m) => {
        redactUserSecrets(m.student);
        const record = byStudent.get(m.studentId);
        return {
          studentId: m.studentId,
          name: m.student?.name ?? null,
          email: m.student?.email ?? '',
          status: record?.status ?? null,
          note: record?.note ?? null,
        };
      }),
    };
  }

  /** Bulk upsert one session = the whole class (docs §3.4). */
  async takeAttendance(userId: number, dto: TakeAttendanceDto) {
    const cls = await this.assertManageAccess(userId, dto.classId);

    const memberships = await this.membershipRepository.find({
      where: { classId: cls.id, leftAt: IsNull() },
    });
    const memberIds = new Set(memberships.map((m) => m.studentId));

    const seen = new Set<number>();
    for (const record of dto.records) {
      if (seen.has(record.studentId)) {
        throw new BadRequestException(
          `Student ${record.studentId} appears twice in the submission`,
        );
      }
      seen.add(record.studentId);
      if (!memberIds.has(record.studentId)) {
        throw new BadRequestException(
          `Student ${record.studentId} is not an active member of this class`,
        );
      }
    }

    const existing = await this.attendanceRepository.find({
      where: {
        classId: cls.id,
        date: dto.date,
        periodNumber: dto.periodNumber,
      },
    });
    const byStudent = new Map(existing.map((r) => [r.studentId, r]));

    const toSave = dto.records.map((record) => {
      const found = byStudent.get(record.studentId);
      if (found) {
        found.status = record.status;
        found.note = record.note?.trim() || null;
        return found;
      }
      return this.attendanceRepository.create({
        schoolId: cls.schoolId,
        classId: cls.id,
        studentId: record.studentId,
        date: dto.date,
        periodNumber: dto.periodNumber,
        status: record.status,
        note: record.note?.trim() || null,
      });
    });

    const updated = toSave.filter((r) => byStudent.has(r.studentId)).length;
    await this.attendanceRepository.save(toSave);

    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.attendance.take',
      detail: `Điểm danh lớp ${cls.name} ngày ${dto.date} tiết ${dto.periodNumber} (${toSave.length} HS)`,
      metadata: {
        schoolId: cls.schoolId,
        classId: cls.id,
        date: dto.date,
        periodNumber: dto.periodNumber,
        saved: toSave.length,
      },
    });

    return {
      classId: cls.id,
      date: dto.date,
      periodNumber: dto.periodNumber,
      saved: toSave.length,
      created: toSave.length - updated,
      updated,
    };
  }

  /** Attendance rows + rate summary for a class over a date range. */
  async getClassHistory(
    userId: number,
    classId: string,
    from: string,
    to: string,
  ) {
    this.assertDate(from);
    this.assertDate(to);
    if (from > to) throw new BadRequestException('from must be <= to');
    const cls = await this.assertManageAccess(userId, classId);

    const records = await this.attendanceRepository.find({
      where: { classId: cls.id, date: Between(from, to) },
      relations: { student: true },
      order: { date: 'DESC', periodNumber: 'ASC' },
    });
    return {
      records: records.map((r) => {
        redactUserSecrets(r.student);
        return {
          recordId: r.id,
          studentId: r.studentId,
          studentName: r.student?.name ?? null,
          date: r.date,
          periodNumber: r.periodNumber,
          status: r.status,
          note: r.note ?? null,
        };
      }),
      summary: this.summarize(records),
    };
  }

  // ---------- parent side ----------

  /** A parent's view of one child's attendance. APPROVED links only. */
  async getChildAttendance(parentUserId: number, studentId: number) {
    const link = await this.linkRepository.findOne({
      where: {
        parentId: parentUserId,
        studentId,
        status: In([ParentLinkStatus.PENDING, ParentLinkStatus.APPROVED]),
      },
    });
    if (!link) throw new NotFoundException('Child not found');
    if (link.status !== ParentLinkStatus.APPROVED) {
      throw new BadRequestException(
        'Waiting for the class teacher to approve this link',
      );
    }
    const all = await this.attendanceRepository.find({
      where: { schoolId: link.schoolId, studentId },
      order: { date: 'DESC', periodNumber: 'DESC' },
    });
    return {
      // Full-range summary + the 50 most recent rows (MVP data size).
      summary: this.summarize(all),
      records: all.slice(0, 50).map((r) => ({
        date: r.date,
        periodNumber: r.periodNumber,
        status: r.status,
        note: r.note ?? null,
      })),
    };
  }

  // ---------- helpers ----------

  /** 'YYYY-MM-DD' → plan weekday numbering: 1=CN, 2..7 = Thứ 2..7. */
  private weekdayOf(date: string): number {
    const jsDay = new Date(`${date}T00:00:00`).getDay();
    return jsDay === 0 ? 1 : jsDay + 1;
  }

  private assertDate(value: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
  }

  private summarize(records: AttendanceRecord[]): AttendanceSummary {
    return summarizeAttendance(records.map((r) => ({ status: r.status })));
  }

  /** GVCN of this class, assigned teacher, principal, or ADMIN — else 404. */
  private async assertManageAccess(
    userId: number,
    classId: string,
  ): Promise<SchoolClass> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const cls = await this.classRepository.findOne({
      where: { id: classId, schoolId },
    });
    if (!cls) throw new NotFoundException('Class not found');
    if (cls.homeroomTeacherId === userId) return cls;

    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
    });
    if (school?.principalId === userId) return cls;

    const assignment = await this.assignmentRepository.findOne({
      where: { teacherId: userId, classId: cls.id, schoolId },
    });
    if (assignment) return cls;

    const actor = await this.userRepository.findOne({ where: { id: userId } });
    if (actor?.roles?.includes(UserRole.ADMIN)) return cls;

    // Same 404 as a nonexistent class — never confirm it exists (D1).
    throw new NotFoundException('Class not found');
  }
}

export { AttendanceStatus };
