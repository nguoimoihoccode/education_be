import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { School } from './entities/school.entity';
import { AcademicYear } from './entities/academic-year.entity';
import { Subject } from './entities/subject.entity';
import { SchoolClass } from './entities/school-class.entity';
import { TeachingAssignment } from './entities/teaching-assignment.entity';
import { ClassMembership } from './entities/class-membership.entity';
import { GradeEntry } from './entities/grade-entry.entity';
import { AttendanceRecord } from './entities/attendance-record.entity';
import { User } from '../users/entities/user.entity';
import { summarizeAttendance } from './domain/attendance-rate.policy';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { UserRole } from '../../common/enums/roles.enum';
import { redactUserSecrets } from './school-sanitize.util';
import {
  CreateSchoolDto,
  UpdateSchoolDto,
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
  CreateSubjectDto,
  UpdateSubjectDto,
  UpdatePeriodConfigDto,
} from './dto/school-config.dto';

/**
 * School-level configuration: the school itself, academic years, subjects,
 * plus the tenant-scoping helper every school endpoint must use.
 *
 * Multi-tenant rule (docs/SCHOOL_PLATFORM_PLAN.md D1): every by-id lookup
 * goes through findOne({ id, schoolId }) so a wrong-tenant id is a 404,
 * never a leak. Never trust a schoolId from the request body/query.
 */
@Injectable()
export class SchoolService {
  constructor(
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    @InjectRepository(AcademicYear)
    private readonly yearRepository: Repository<AcademicYear>,
    @InjectRepository(Subject)
    private readonly subjectRepository: Repository<Subject>,
    @InjectRepository(SchoolClass)
    private readonly classRepository: Repository<SchoolClass>,
    @InjectRepository(TeachingAssignment)
    private readonly assignmentRepository: Repository<TeachingAssignment>,
    @InjectRepository(ClassMembership)
    private readonly membershipRepository: Repository<ClassMembership>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(GradeEntry)
    private readonly gradeRepository: Repository<GradeEntry>,
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepository: Repository<AttendanceRecord>,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Resolve the school the acting user belongs to.
   * Order: principal → teacher (assignment) → homeroom teacher → student →
   * (ADMIN only) first school.
   * MVP: single-school context per user; multi-school switch is a later phase.
   */
  async resolveSchoolIdForUser(userId: number): Promise<string> {
    const asPrincipal = await this.schoolRepository.findOne({
      where: { principalId: userId },
    });
    if (asPrincipal) return asPrincipal.id;

    const asTeacher = await this.assignmentRepository.findOne({
      where: { teacherId: userId },
    });
    if (asTeacher) return asTeacher.schoolId;

    // GVCN without any subject assignment still belongs to the school (Phase 2)
    const asHomeroom = await this.classRepository.findOne({
      where: { homeroomTeacherId: userId },
    });
    if (asHomeroom) return asHomeroom.schoolId;

    const asStudent = await this.membershipRepository.findOne({
      where: { studentId: userId },
    });
    if (asStudent) return asStudent.schoolId;

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user?.roles?.includes(UserRole.ADMIN)) {
      const first = await this.schoolRepository.findOne({
        order: { createdAt: 'ASC' },
      });
      if (first) return first.id;
    }

    throw new NotFoundException(
      'You are not a member of any school. Ask an administrator to add you or bootstrap a school first.',
    );
  }

  // ---------- school ----------

  async createSchool(dto: CreateSchoolDto, actorId: number): Promise<School> {
    const existing = await this.schoolRepository.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`School code "${dto.code}" already exists`);
    }
    const school = await this.schoolRepository.save(
      this.schoolRepository.create({
        name: dto.name,
        code: dto.code,
        address: dto.address,
        phone: dto.phone,
        principalId: actorId,
      }),
    );
    await this.activityLog.recordBestEffort({
      userId: actorId,
      type: EducationActivityType.SCHOOL,
      action: 'school.create',
      detail: `Tạo trường ${school.name}`,
      metadata: { schoolId: school.id, code: school.code },
    });
    return school;
  }

  async getMySchool(userId: number): Promise<School> {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
      relations: { principal: true },
    });
    if (!school) throw new NotFoundException('School not found');
    redactUserSecrets(school.principal);
    return school;
  }

  async updateSchool(userId: number, dto: UpdateSchoolDto): Promise<School> {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
    });
    if (!school) throw new NotFoundException('School not found');
    if (dto.code && dto.code !== school.code) {
      const clash = await this.schoolRepository.findOne({
        where: { code: dto.code },
      });
      if (clash) throw new ConflictException('School code already exists');
    }
    Object.assign(school, dto);
    return this.schoolRepository.save(school);
  }

  /** Timetable grid shape (Phase 3): periods/day + working days. */
  async updatePeriodConfig(
    userId: number,
    dto: UpdatePeriodConfigDto,
  ): Promise<School> {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
    });
    if (!school) throw new NotFoundException('School not found');
    const days = [...new Set(dto.days)].sort((a, b) => a - b);
    school.periodConfig = { periodsPerDay: dto.periodsPerDay, days };
    const saved = await this.schoolRepository.save(school);
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.period_config.update',
      detail: `Đặt lịch học ${dto.periodsPerDay} tiết/ngày, ${days.length} ngày/tuần`,
      metadata: { schoolId, periodConfig: saved.periodConfig },
    });
    return saved;
  }

  // ---------- academic years ----------

  async createAcademicYear(
    userId: number,
    dto: CreateAcademicYearDto,
  ): Promise<AcademicYear> {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    const year = await this.yearRepository.save(
      this.yearRepository.create({
        schoolId,
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
      }),
    );
    if (dto.makeActive) {
      await this.setActiveAcademicYear(schoolId, year.id);
    }
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.academic_year.create',
      detail: `Tạo năm học ${year.name}`,
      metadata: { schoolId, academicYearId: year.id },
    });
    return year;
  }

  async listAcademicYears(userId: number): Promise<AcademicYear[]> {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    return this.yearRepository.find({
      where: { schoolId },
      order: { startDate: 'DESC' },
    });
  }

  async setActiveAcademicYear(schoolId: string, yearId: string): Promise<void> {
    const year = await this.yearRepository.findOne({
      where: { id: yearId, schoolId },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    await this.yearRepository.update({ schoolId }, { isActive: false });
    year.isActive = true;
    await this.yearRepository.save(year);
    await this.schoolRepository.update(
      { id: schoolId },
      { currentAcademicYearId: yearId },
    );
  }

  async updateAcademicYear(
    userId: number,
    yearId: string,
    dto: UpdateAcademicYearDto,
  ): Promise<AcademicYear> {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    const year = await this.yearRepository.findOne({
      where: { id: yearId, schoolId },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    const { makeActive, ...rest } = dto;
    Object.assign(year, rest);
    const saved = await this.yearRepository.save(year);
    if (makeActive) {
      await this.setActiveAcademicYear(schoolId, yearId);
    }
    return saved;
  }

  // ---------- subjects ----------

  async createSubject(userId: number, dto: CreateSubjectDto): Promise<Subject> {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    const subject = await this.subjectRepository.save(
      this.subjectRepository.create({ schoolId, ...dto }),
    );
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.subject.create',
      detail: `Thêm môn học ${subject.name}`,
      metadata: { schoolId, subjectId: subject.id },
    });
    return subject;
  }

  async listSubjects(userId: number): Promise<Subject[]> {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    return this.subjectRepository.find({
      where: { schoolId },
      order: { name: 'ASC' },
    });
  }

  async updateSubject(
    userId: number,
    subjectId: string,
    dto: UpdateSubjectDto,
  ): Promise<Subject> {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    const subject = await this.subjectRepository.findOne({
      where: { id: subjectId, schoolId },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    Object.assign(subject, dto);
    return this.subjectRepository.save(subject);
  }

  /** Hard delete only when nothing references it; otherwise deactivate. */
  async deleteSubject(userId: number, subjectId: string): Promise<void> {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    const subject = await this.subjectRepository.findOne({
      where: { id: subjectId, schoolId },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    const used = await this.assignmentRepository.findOne({
      where: { subjectId },
    });
    if (used) {
      subject.active = false;
      await this.subjectRepository.save(subject);
      return;
    }
    await this.subjectRepository.remove(subject);
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.subject.delete',
      detail: `Xóa môn học ${subject.name}`,
      metadata: { schoolId, subjectId },
    });
  }

  // ---------- overview ----------

  async getStats(userId: number) {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    // 30 ngày gần nhất cho tỷ lệ chuyên cần (dashboard hiệu trưởng, Phase 4)
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const [classes, students, teacherRows, subjects, avgRow, attendanceRows] =
      await Promise.all([
        this.classRepository.count({ where: { schoolId, active: true } }),
        this.membershipRepository.count({
          where: { schoolId, leftAt: IsNull() },
        }),
        this.assignmentRepository
          .createQueryBuilder('a')
          .select('COUNT(DISTINCT a.teacher_id)', 'count')
          .where('a.school_id = :schoolId', { schoolId })
          .getRawOne<{ count: string }>(),
        this.subjectRepository.count({ where: { schoolId, active: true } }),
        this.gradeRepository
          .createQueryBuilder('g')
          .select('AVG(g.score)', 'avg')
          .where('g.school_id = :schoolId', { schoolId })
          .getRawOne<{ avg: string | null }>(),
        this.attendanceRepository.find({
          where: { schoolId, date: Between(from, to) },
          select: { status: true },
        }),
      ]);
    const attendance = summarizeAttendance(
      attendanceRows.map((r) => ({ status: r.status })),
    );
    return {
      classes,
      students,
      teachers: Number.parseInt(teacherRows?.count ?? '0', 10),
      subjects,
      // Phase 4: điểm trung bình toàn trường (0–10) + % chuyên cần 30 ngày
      avgScore:
        avgRow?.avg !== null && avgRow?.avg !== undefined
          ? Math.round(Number(avgRow.avg) * 10) / 10
          : null,
      attendanceRate: attendance.attendanceRate,
      attendanceSessions: attendance.totalSessions,
    };
  }

  /** Users that are teachers of this school (via assignments), with payload. */
  async listTeachers(userId: number) {
    const schoolId = await this.resolveSchoolIdForUser(userId);
    const assignments = await this.assignmentRepository.find({
      where: { schoolId },
      relations: { teacher: true, subject: true, schoolClass: true },
      order: { createdAt: 'ASC' },
    });
    const byTeacher = new Map<
      number,
      {
        id: number;
        name: string | null;
        email: string;
        assignments: Array<{
          assignmentId: string;
          className: string;
          subjectName: string;
        }>;
      }
    >();
    for (const a of assignments) {
      const entry = byTeacher.get(a.teacherId) ?? {
        id: a.teacherId,
        name: a.teacher?.name ?? null,
        email: a.teacher?.email ?? '',
        assignments: [],
      };
      entry.assignments.push({
        assignmentId: a.id,
        className: a.schoolClass?.name ?? a.classId,
        subjectName: a.subject?.name ?? a.subjectId,
      });
      byTeacher.set(a.teacherId, entry);
    }
    return Array.from(byTeacher.values());
  }
}
