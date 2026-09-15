import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { IsNull, In, Repository } from 'typeorm';
import { SchoolClass } from './entities/school-class.entity';
import { AcademicYear } from './entities/academic-year.entity';
import { TeachingAssignment } from './entities/teaching-assignment.entity';
import { ClassMembership } from './entities/class-membership.entity';
import { User } from '../users/entities/user.entity';
import { School } from './entities/school.entity';
import { Subject } from './entities/subject.entity';
import { SchoolService } from './school.service';
import { redactUserSecrets } from './school-sanitize.util';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { UserRole } from '../../common/enums/roles.enum';
import {
  CreateClassDto,
  UpdateClassDto,
  CreateAssignmentDto,
  AddStudentsDto,
} from './dto/class.dto';

export class ClassService {
  constructor(
    @InjectRepository(SchoolClass)
    private readonly classRepository: Repository<SchoolClass>,
    @InjectRepository(AcademicYear)
    private readonly yearRepository: Repository<AcademicYear>,
    @InjectRepository(TeachingAssignment)
    private readonly assignmentRepository: Repository<TeachingAssignment>,
    @InjectRepository(ClassMembership)
    private readonly membershipRepository: Repository<ClassMembership>,
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    @InjectRepository(Subject)
    private readonly subjectRepository: Repository<Subject>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly schoolService: SchoolService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ---------- classes ----------

  async createClass(userId: number, dto: CreateClassDto): Promise<SchoolClass> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const year = await this.yearRepository.findOne({
      where: { id: dto.academicYearId, schoolId },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    if (dto.homeroomTeacherId !== undefined) {
      await this.ensureTeacherRole(dto.homeroomTeacherId);
    }
    const clash = await this.classRepository.findOne({
      where: { schoolId, name: dto.name, academicYearId: dto.academicYearId },
    });
    if (clash) {
      throw new ConflictException(
        `Class "${dto.name}" already exists in ${year.name}`,
      );
    }
    const created = await this.classRepository.save(
      this.classRepository.create({
        schoolId,
        name: dto.name,
        grade: dto.grade,
        academicYearId: dto.academicYearId,
        homeroomTeacherId: dto.homeroomTeacherId ?? null,
        maxStudents: dto.maxStudents ?? null,
        room: dto.room,
      }),
    );
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.class.create',
      detail: `Tạo lớp ${created.name}`,
      metadata: { schoolId, classId: created.id },
    });
    return created;
  }

  async listClasses(userId: number): Promise<SchoolClass[]> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const classes = await this.classRepository.find({
      where: { schoolId },
      relations: { homeroomTeacher: true, academicYear: true },
      order: { grade: 'ASC', name: 'ASC' },
    });
    const counts = await this.membershipRepository
      .createQueryBuilder('m')
      .select('m.class_id', 'classId')
      .addSelect('COUNT(*)', 'count')
      .where('m.school_id = :schoolId', { schoolId })
      .andWhere('m.left_at IS NULL')
      .groupBy('m.class_id')
      .getRawMany<{ classId: string; count: string }>();
    const countByClass = new Map(
      counts.map((r) => [r.classId, Number.parseInt(r.count, 10)]),
    );
    for (const cls of classes) {
      redactUserSecrets(cls.homeroomTeacher);
      (cls as SchoolClass & { studentCount?: number }).studentCount =
        countByClass.get(cls.id) ?? 0;
    }
    return classes;
  }

  async getClass(userId: number, classId: string): Promise<SchoolClass> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const cls = await this.classRepository.findOne({
      where: { id: classId, schoolId },
      relations: { homeroomTeacher: true, academicYear: true },
    });
    if (!cls) throw new NotFoundException('Class not found');
    redactUserSecrets(cls.homeroomTeacher);
    return cls;
  }

  async updateClass(
    userId: number,
    classId: string,
    dto: UpdateClassDto,
  ): Promise<SchoolClass> {
    const cls = await this.getClass(userId, classId);
    if (dto.homeroomTeacherId !== undefined) {
      await this.ensureTeacherRole(dto.homeroomTeacherId);
    }
    if (dto.academicYearId && dto.academicYearId !== cls.academicYearId) {
      const year = await this.yearRepository.findOne({
        where: { id: dto.academicYearId, schoolId: cls.schoolId },
      });
      if (!year) throw new NotFoundException('Academic year not found');
    }
    Object.assign(cls, dto);
    return this.classRepository.save(cls);
  }

  /** Hard delete only while the class has no students; otherwise archive. */
  async deleteClass(userId: number, classId: string): Promise<void> {
    const cls = await this.getClass(userId, classId);
    const activeStudents = await this.membershipRepository.count({
      where: { classId: cls.id, leftAt: IsNull() },
    });
    if (activeStudents > 0) {
      cls.active = false;
      await this.classRepository.save(cls);
      return;
    }
    await this.classRepository.remove(cls);
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.class.delete',
      detail: `Xóa lớp ${cls.name}`,
      metadata: { schoolId: cls.schoolId, classId: cls.id },
    });
  }

  // ---------- teaching assignments ----------

  async createAssignment(
    userId: number,
    dto: CreateAssignmentDto,
  ): Promise<TeachingAssignment> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    await this.ensureTeacherRole(dto.teacherId);
    const subject = await this.subjectRepository.findOne({
      where: { id: dto.subjectId, schoolId },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    const cls = await this.classRepository.findOne({
      where: { id: dto.classId, schoolId },
    });
    if (!cls) throw new NotFoundException('Class not found');
    const existing = await this.assignmentRepository.findOne({
      where: {
        teacherId: dto.teacherId,
        subjectId: dto.subjectId,
        classId: dto.classId,
      },
    });
    if (existing) {
      throw new ConflictException('Assignment already exists');
    }
    const assignment = await this.assignmentRepository.save(
      this.assignmentRepository.create({
        schoolId,
        teacherId: dto.teacherId,
        subjectId: dto.subjectId,
        classId: dto.classId,
      }),
    );
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.assignment.create',
      detail: `Phân công GV ${dto.teacherId} dạy ${subject.name} lớp ${cls.name}`,
      metadata: { schoolId, assignmentId: assignment.id },
    });
    return assignment;
  }

  async listAssignments(
    userId: number,
    opts: { classId?: string; teacherId?: number } = {},
  ): Promise<TeachingAssignment[]> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const assignments = await this.assignmentRepository.find({
      where: {
        schoolId,
        ...(opts.classId ? { classId: opts.classId } : {}),
        ...(opts.teacherId ? { teacherId: opts.teacherId } : {}),
      },
      relations: { teacher: true, subject: true, schoolClass: true },
      order: { createdAt: 'DESC' },
    });
    assignments.forEach((a) => redactUserSecrets(a.teacher));
    return assignments;
  }

  async deleteAssignment(userId: number, assignmentId: string): Promise<void> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const assignment = await this.assignmentRepository.findOne({
      where: { id: assignmentId, schoolId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assignmentRepository.remove(assignment);
  }

  // ---------- roster ----------

  async listStudents(userId: number, classId: string) {
    await this.getClass(userId, classId);
    const memberships = await this.membershipRepository.find({
      where: { classId, leftAt: IsNull() },
      relations: { student: true },
      order: { joinedAt: 'ASC' },
    });
    return memberships.map((m) => ({
      membershipId: m.id,
      joinedAt: m.joinedAt,
      student: {
        id: m.student?.id ?? m.studentId,
        name: m.student?.name ?? null,
        email: m.student?.email ?? '',
      },
    }));
  }

  /**
   * Bulk add students.
   * - known email  → create/reactivate membership
   * - unknown email + !existingOnly → create STUDENT account with a temporary
   *   password (returned once, so the principal can share login info)
   * A student may hold at most one active class membership per school.
   */
  async addStudents(
    userId: number,
    classId: string,
    dto: AddStudentsDto,
  ): Promise<{
    added: Array<{ email: string; studentId: number }>;
    created: Array<{
      email: string;
      studentId: number;
      temporaryPassword: string;
    }>;
    skipped: Array<{ email: string; reason: string }>;
  }> {
    const cls = await this.getClass(userId, classId);
    if (cls.maxStudents != null) {
      const current = await this.membershipRepository.count({
        where: { classId: cls.id, leftAt: IsNull() },
      });
      if (current + dto.students.length > cls.maxStudents) {
        throw new BadRequestException(
          `Class ${cls.name} allows at most ${cls.maxStudents} students (currently ${current})`,
        );
      }
    }

    const added: Array<{ email: string; studentId: number }> = [];
    const created: Array<{
      email: string;
      studentId: number;
      temporaryPassword: string;
    }> = [];
    const skipped: Array<{ email: string; reason: string }> = [];

    const emails = dto.students.map((s) => s.email.toLowerCase());
    const users = await this.userRepository.find({
      where: { email: In(emails) },
    });
    const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

    for (const entry of dto.students) {
      const email = entry.email.toLowerCase();
      let student = userByEmail.get(email);

      if (!student) {
        if (dto.existingOnly) {
          skipped.push({ email, reason: 'user_not_found' });
          continue;
        }
        const temporaryPassword = randomBytes(9).toString('base64url');
        try {
          student = await this.userRepository.save(
            this.userRepository.create({
              email,
              passwordHash: await this.hashPassword(temporaryPassword),
              name: entry.name,
              username: await this.uniqueUsername(email),
              provider: 'email',
              roles: [UserRole.USER, UserRole.STUDENT],
              lastSeenAt: new Date(),
            }),
          );
          created.push({ email, studentId: student.id, temporaryPassword });
        } catch {
          skipped.push({ email, reason: 'creation_failed' });
          continue;
        }
      } else {
        // ensure STUDENT role on existing account
        if (!student.roles?.includes(UserRole.STUDENT)) {
          student.roles = [...(student.roles ?? []), UserRole.STUDENT];
          await this.userRepository.save(student);
        }
      }
      if (!student) continue; // unreachable (creation failure path uses continue); narrows the type

      // one active class per school
      const otherActive = await this.membershipRepository.findOne({
        where: {
          studentId: student.id,
          schoolId: cls.schoolId,
          leftAt: IsNull(),
        },
      });
      if (otherActive && otherActive.classId !== cls.id) {
        const other = await this.classRepository.findOne({
          where: { id: otherActive.classId },
        });
        skipped.push({
          email,
          reason: `already_in_class:${other?.name ?? otherActive.classId}`,
        });
        continue;
      }

      const existing = await this.membershipRepository.findOne({
        where: { classId: cls.id, studentId: student.id },
      });
      if (existing) {
        if (existing.leftAt) {
          existing.leftAt = null;
          await this.membershipRepository.save(existing);
          added.push({ email, studentId: student.id });
        } else {
          skipped.push({ email, reason: 'already_in_class' });
        }
      } else {
        await this.membershipRepository.save(
          this.membershipRepository.create({
            schoolId: cls.schoolId,
            classId: cls.id,
            studentId: student.id,
          }),
        );
        if (!created.some((c) => c.email === email)) {
          added.push({ email, studentId: student.id });
        } else {
          // created above — still report membership success via `created` only
        }
      }
    }

    if (added.length || created.length) {
      await this.activityLog.recordBestEffort({
        userId,
        type: EducationActivityType.SCHOOL,
        action: 'school.class.add_students',
        detail: `Thêm ${added.length + created.length} HS vào lớp ${cls.name}`,
        metadata: {
          schoolId: cls.schoolId,
          classId: cls.id,
          added: added.length,
          created: created.length,
          skipped: skipped.length,
        },
      });
    }
    return { added, created, skipped };
  }

  async removeStudent(
    userId: number,
    classId: string,
    studentId: number,
  ): Promise<void> {
    const cls = await this.getClass(userId, classId);
    const membership = await this.membershipRepository.findOne({
      where: { classId: cls.id, studentId },
    });
    if (!membership || membership.leftAt) {
      throw new NotFoundException(
        'Student is not an active member of this class',
      );
    }
    membership.leftAt = new Date();
    await this.membershipRepository.save(membership);
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.class.remove_student',
      detail: `Cho HS ${studentId} rời lớp ${cls.name}`,
      metadata: { schoolId: cls.schoolId, classId: cls.id, studentId },
    });
  }

  // ---------- helpers ----------

  /** User must exist and hold a teaching role; non-teachers get TEACHER added. */
  private async ensureTeacherRole(teacherId: number): Promise<User> {
    const teacher = await this.userRepository.findOne({
      where: { id: teacherId },
    });
    if (!teacher) throw new NotFoundException('Teacher user not found');
    const canTeach = teacher.roles?.some((r) =>
      [UserRole.TEACHER, UserRole.EDUCATION_ADMIN, UserRole.ADMIN].includes(r),
    );
    if (!canTeach) {
      teacher.roles = [...(teacher.roles ?? []), UserRole.TEACHER];
      teacher.isTeacher = true;
      await this.userRepository.save(teacher);
    }
    return teacher;
  }

  private async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  private async uniqueUsername(email: string): Promise<string> {
    const base = email.split('@')[0] ?? 'user';
    const suffix = randomBytes(2).toString('hex');
    return `${base.slice(0, 40)}-${suffix}`.toLowerCase();
  }
}
