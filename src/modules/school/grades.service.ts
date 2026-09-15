import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  DEFAULT_COEFFICIENT,
  GradeEntry,
  GradeTestType,
} from './entities/grade-entry.entity';
import { SchoolClass } from './entities/school-class.entity';
import { Subject } from './entities/subject.entity';
import { ClassMembership } from './entities/class-membership.entity';
import { TeachingAssignment } from './entities/teaching-assignment.entity';
import { ParentLink, ParentLinkStatus } from './entities/parent-link.entity';
import { School } from './entities/school.entity';
import { User } from '../users/entities/user.entity';
import { SchoolService } from './school.service';
import { redactUserSecrets } from './school-sanitize.util';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { UserRole } from '../../common/enums/roles.enum';
import {
  computeGradeAverages,
  GradeAverages,
} from './domain/grade-average.policy';
import { rankCompetition } from './domain/rank.policy';
import { CreateGradeDto, UpdateGradeDto } from './dto/grade.dto';

/** Một đầu điểm dạng nhìn được (FE) — student rút gọn id+name. */
export interface GradeEntryView {
  id: string;
  classId: string;
  subjectId: string;
  subjectName: string | null;
  studentId: number;
  studentName: string | null;
  testType: GradeTestType;
  coefficient: number;
  score: number;
  date: string;
  term: number;
  quizSessionId: string | null;
  homeworkId: string | null;
}

function toView(entry: GradeEntry): GradeEntryView {
  return {
    id: entry.id,
    classId: entry.classId,
    subjectId: entry.subjectId,
    subjectName: entry.subject?.name ?? null,
    studentId: entry.studentId,
    studentName: entry.student?.name ?? null,
    testType: entry.testType,
    coefficient: entry.coefficient,
    score: entry.score,
    date: entry.date,
    term: entry.term,
    quizSessionId: entry.quizSessionId ?? null,
    homeworkId: entry.homeworkId ?? null,
  };
}

export interface ListGradesQuery {
  classId?: string;
  subjectId?: string;
  studentId?: number;
  term?: number;
}

/** Xếp hạng theo lớp: có subjectId = hạng theo môn, không có = hạng toàn lớp. */
export interface ClassRankingQuery {
  classId: string;
  subjectId?: string;
  term?: number;
}

/**
 * Phase 4 (docs/SCHOOL_PLATFORM_PLAN.md): sổ điểm.
 * Write access = người dạy môn đó ở lớp đó: GV được phân công (TeachingAssignment
 * teacher×subject×class), GVCN của lớp, hiệu trưởng, hoặc ADMIN. Denials = 404
 * (rule D1). Đọc: staff theo phạm vi lớp của mình; STUDENT chỉ điểm của mình
 * (GET /grades/me); PARENT qua /parent/children/:id/grades (link đã duyệt).
 */
@Injectable()
export class GradesService {
  constructor(
    @InjectRepository(GradeEntry)
    private readonly gradeRepository: Repository<GradeEntry>,
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

  // ---------- write side (teacher / staff) ----------

  async create(userId: number, dto: CreateGradeDto): Promise<GradeEntryView> {
    const { cls, subject } = await this.assertWriteAccess(
      userId,
      dto.classId,
      dto.subjectId,
    );
    await this.assertActiveMember(cls.id, dto.studentId);

    const entry = this.gradeRepository.create({
      schoolId: cls.schoolId,
      classId: cls.id,
      subjectId: subject.id,
      studentId: dto.studentId,
      testType: dto.testType,
      coefficient: dto.coefficient ?? DEFAULT_COEFFICIENT[dto.testType],
      score: dto.score,
      date: dto.date,
      term: dto.term ?? 1,
    });
    const saved = await this.gradeRepository.save(entry);

    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.grade.add',
      detail: `Thêm đầu điểm ${dto.testType} ${dto.score} cho HS ${dto.studentId} môn ${subject.name}`,
      metadata: {
        schoolId: cls.schoolId,
        classId: cls.id,
        subjectId: subject.id,
        gradeId: saved.id,
      },
    });
    return toView(await this.loadWithRelations(saved.id));
  }

  async update(
    userId: number,
    gradeId: string,
    dto: UpdateGradeDto,
  ): Promise<GradeEntryView> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const entry = await this.gradeRepository.findOne({
      where: { id: gradeId, schoolId },
    });
    if (!entry) throw new NotFoundException('Grade not found');

    // access on the TARGET subject — moving a grade to another subject the
    // actor doesn't teach must fail like a nonexistent subject (D1).
    const { subject } = await this.assertWriteAccess(
      userId,
      entry.classId,
      dto.subjectId ?? entry.subjectId,
    );
    if (dto.subjectId) entry.subjectId = subject.id;

    if (dto.studentId !== undefined && dto.studentId !== entry.studentId) {
      await this.assertActiveMember(entry.classId, dto.studentId);
      entry.studentId = dto.studentId;
    }
    if (dto.testType !== undefined) {
      entry.testType = dto.testType;
      // hệ số mặc định đi theo loại bài TRỪ khi giáo viên chỉ định tường minh
      if (dto.coefficient === undefined) {
        entry.coefficient = DEFAULT_COEFFICIENT[dto.testType];
      }
    }
    if (dto.coefficient !== undefined) entry.coefficient = dto.coefficient;
    if (dto.score !== undefined) entry.score = dto.score;
    if (dto.date !== undefined) entry.date = dto.date;
    if (dto.term !== undefined) entry.term = dto.term;

    await this.gradeRepository.save(entry);
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.grade.update',
      detail: `Sửa đầu điểm ${gradeId}`,
      metadata: { schoolId, gradeId },
    });
    return toView(await this.loadWithRelations(gradeId));
  }

  async remove(userId: number, gradeId: string): Promise<{ deleted: true }> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const entry = await this.gradeRepository.findOne({
      where: { id: gradeId, schoolId },
    });
    if (!entry) throw new NotFoundException('Grade not found');
    await this.assertWriteAccess(userId, entry.classId, entry.subjectId);

    await this.gradeRepository.delete({ id: entry.id });
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.grade.delete',
      detail: `Xóa đầu điểm ${entry.testType} của HS ${entry.studentId}`,
      metadata: { schoolId, gradeId: entry.id },
    });
    return { deleted: true };
  }

  // ---------- read side ----------

  /** Staff listing, tenant + per-teacher scoped. Students see only their own. */
  async list(userId: number, query: ListGradesQuery) {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const actor = await this.userRepository.findOne({ where: { id: userId } });

    const where: Record<string, unknown> = { schoolId };
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.term !== undefined) where.term = query.term;

    if (await this.isSchoolAdmin(userId, schoolId, actor)) {
      if (query.classId) where.classId = query.classId;
      if (query.studentId) where.studentId = query.studentId;
      return this.findEntries(where);
    }
    if (actor?.roles?.includes(UserRole.STUDENT)) {
      // chính HS chỉ đọc được điểm của MÌNH — query.studentId bị bỏ qua
      where.studentId = userId;
      if (query.classId) where.classId = query.classId;
      return this.findEntries(where);
    }
    const classIds = await this.teacherClassIds(userId, schoolId);
    if (query.classId) {
      if (!classIds.includes(query.classId)) {
        throw new NotFoundException('Class not found');
      }
      where.classId = query.classId;
    } else if (classIds.length > 0) {
      where.classId = In(classIds);
    } else {
      return [];
    }
    if (query.studentId) where.studentId = query.studentId;
    return this.findEntries(where);
  }

  /**
   * Sổ điểm theo lớp × môn: mỗi HS một dòng (đầu điểm + TB giữa kỳ/cuối năm
   * tính bởi policy pure). term bỏ trống = gộp cả hai học kỳ vào TB hiển thị?
   * Không — term bắt buộc về logic điểm; khi trống tính theo từng entry hiện có.
   */
  async getReport(
    userId: number,
    classId: string,
    subjectId: string,
    term?: number,
  ) {
    const { cls, subject } = await this.assertWriteAccess(
      userId,
      classId,
      subjectId,
    );
    const where: Record<string, unknown> = {
      schoolId: cls.schoolId,
      classId: cls.id,
      subjectId: subject.id,
    };
    if (term !== undefined) where.term = term;

    const [memberships, entries] = await Promise.all([
      this.membershipRepository.find({
        where: { classId: cls.id, leftAt: IsNull() },
        relations: { student: true },
        order: { joinedAt: 'ASC' },
      }),
      this.gradeRepository.find({
        where,
        order: { date: 'ASC' },
      }),
    ]);

    const byStudent = new Map<number, GradeEntry[]>();
    for (const e of entries) {
      const list = byStudent.get(e.studentId) ?? [];
      list.push(e);
      byStudent.set(e.studentId, list);
    }

    const rows = memberships.map((m) => {
      redactUserSecrets(m.student);
      const own = byStudent.get(m.studentId) ?? [];
      const averages = this.averagesOf(own);
      return {
        studentId: m.studentId,
        studentName: m.student?.name ?? null,
        entries: own.map(toView),
        ...averages,
      };
    });
    // HS có điểm nhưng đã rời lớp vẫn phải hiện (điểm không mất theo membership)
    for (const [studentId, own] of byStudent) {
      if (memberships.some((m) => m.studentId === studentId)) continue;
      const first = own[0];
      const averages = this.averagesOf(own);
      rows.push({
        studentId,
        studentName: first.student?.name ?? null,
        entries: own.map(toView),
        ...averages,
      });
    }

    return {
      classId: cls.id,
      className: cls.name,
      subjectId: subject.id,
      subjectName: subject.name,
      term: term ?? null,
      rows,
    };
  }

  /**
   * Xếp hạng học sinh trong lớp theo điểm (kiểu cạnh tranh 1224, đồng hạng
   * trùng số). Điểm dùng để xếp = TB cả năm, chưa có thì TB giữa kỳ
   * (`scoreFor`). Không có subjectId = hạng toàn lớp: điểm mỗi HS là TB
   * (1 chữ số) các điểm môn của em đó. HS chưa có điểm → rank null, cuối
   * danh sách. Access: theo môn = assertWriteAccess; toàn lớp = GVCN ∥
   * hiệu trưởng ∥ ADMIN. Mọi denial 404 (rule D1).
   */
  async getClassRanking(userId: number, query: ClassRankingQuery) {
    const { cls, subject } = await this.assertRankingAccess(userId, query);

    const where: Record<string, unknown> = {
      schoolId: cls.schoolId,
      classId: cls.id,
    };
    if (subject) where.subjectId = subject.id;
    if (query.term !== undefined) where.term = query.term;

    const [memberships, entries] = await Promise.all([
      this.membershipRepository.find({
        where: { classId: cls.id, leftAt: IsNull() },
        relations: { student: true },
        order: { joinedAt: 'ASC' },
      }),
      this.gradeRepository.find({ where, order: { date: 'ASC' } }),
    ]);

    const byStudent = new Map<number, GradeEntry[]>();
    for (const e of entries) {
      const list = byStudent.get(e.studentId) ?? [];
      list.push(e);
      byStudent.set(e.studentId, list);
    }

    // Hạng toàn lớp: điểm mỗi môn của mỗi HS trước (đã qua scoreFor), sau đó
    // trung bình cộng các môn — làm tròn 1 chữ số, cùng chuẩn với policy.
    let perSubjectScores: Map<number, Map<string, number>> | null = null;
    if (!subject) {
      perSubjectScores = new Map();
      for (const [studentId, own] of byStudent) {
        const groups = new Map<string, GradeEntry[]>();
        for (const e of own) {
          const list = groups.get(e.subjectId) ?? [];
          list.push(e);
          groups.set(e.subjectId, list);
        }
        const scores = new Map<string, number>();
        for (const [subjectKey, list] of groups) {
          const value = this.scoreFor(this.averagesOf(list));
          if (value !== null) scores.set(subjectKey, value);
        }
        if (scores.size > 0) perSubjectScores.set(studentId, scores);
      }
    }

    const valueOf = (studentId: number): number | null => {
      if (subject) {
        const own = byStudent.get(studentId);
        return own ? this.scoreFor(this.averagesOf(own)) : null;
      }
      const scores = perSubjectScores?.get(studentId);
      if (!scores || scores.size === 0) return null;
      const values = Array.from(scores.values());
      const sum = values.reduce((acc, v) => acc + v, 0);
      return Math.round((sum / values.length) * 10) / 10;
    };

    // Danh sách = roster đang học + HS đã rời lớp nhưng vẫn có điểm (như getReport)
    const students = memberships.map((m) => ({
      studentId: m.studentId,
      studentName: m.student?.name ?? null,
    }));
    for (const [studentId, own] of byStudent) {
      if (students.some((s) => s.studentId === studentId)) continue;
      students.push({ studentId, studentName: own[0]?.student?.name ?? null });
    }

    const { rows, rankedCount } = rankCompetition(
      students.map((s) => ({ item: s, value: valueOf(s.studentId) })),
    );
    return {
      classId: cls.id,
      className: cls.name,
      subjectId: subject?.id ?? null,
      subjectName: subject?.name ?? null,
      term: query.term ?? null,
      rows: rows.map((row) => ({
        rank: row.rank,
        studentId: row.item.studentId,
        studentName: row.item.studentName,
        average: row.value,
      })),
      rankedCount,
      unrankedCount: rows.length - rankedCount,
    };
  }

  /** GET /grades/me — điểm của chính HS, nhóm theo môn × học kỳ. */
  async getMyGrades(userId: number) {
    // resolveSchoolIdForUser với STUDENT = school qua ClassMembership
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    return this.getStudentGrades(userId, schoolId);
  }

  /** Parent view of one child. APPROVED links only (same gate as Phase 3). */
  async getChildGrades(parentUserId: number, studentId: number) {
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
    return this.getStudentGrades(studentId, link.schoolId);
  }

  // ---------- helpers ----------

  /** Điểm của một HS trong một school, nhóm subject×term kèm TB. */
  private async getStudentGrades(studentId: number, schoolId: string) {
    const entries = await this.gradeRepository.find({
      where: { schoolId, studentId },
      relations: { subject: true },
      order: { date: 'ASC' },
    });
    const groups = new Map<string, GradeEntry[]>();
    for (const e of entries) {
      const key = `${e.subjectId}:${e.term}`;
      const list = groups.get(key) ?? [];
      list.push(e);
      groups.set(key, list);
    }
    const subjects = await Promise.all(
      Array.from(groups.values()).map(async (list) => {
        const first = list[0];
        const rank = await this.rankWithinClass(
          schoolId,
          first.classId,
          first.subjectId,
          first.term,
          studentId,
        );
        return {
          subjectId: first.subjectId,
          subjectName: first.subject?.name ?? null,
          term: first.term,
          entries: list.map(toView),
          ...this.averagesOf(list),
          ...rank,
        };
      }),
    );
    subjects.sort(
      (a, b) =>
        (a.subjectName ?? '').localeCompare(b.subjectName ?? '') ||
        a.term - b.term,
    );
    return { studentId, subjects };
  }

  private averagesOf(entries: GradeEntry[]): GradeAverages {
    return computeGradeAverages(
      entries.map((e) => ({
        testType: e.testType,
        coefficient: e.coefficient,
        score: e.score,
      })),
    );
  }

  /** Điểm xếp hạng: ưu tiên TB cả năm, mới có giữa kỳ thì dùng giữa kỳ. */
  private scoreFor(averages: GradeAverages): number | null {
    return averages.year ?? averages.midterm;
  }

  /**
   * Hạng của một HS trong lớp × môn × học kỳ: tính lại điểm cả lớp từ
   * `school_grades` (không lưu cột hạng nào — rank là số dẫn xuất), rồi áp
   * policy pure. Mỗi nhóm subject×term đúng 1 query; số nhóm ≤ môn × 2.
   */
  private async rankWithinClass(
    schoolId: string,
    classId: string,
    subjectId: string,
    term: number,
    studentId: number,
  ): Promise<{ rank: number | null; rankedCount: number }> {
    const peers = await this.gradeRepository.find({
      where: { schoolId, classId, subjectId, term },
    });
    const byStudent = new Map<number, GradeEntry[]>();
    for (const e of peers) {
      const list = byStudent.get(e.studentId) ?? [];
      list.push(e);
      byStudent.set(e.studentId, list);
    }
    const { rows, rankedCount } = rankCompetition(
      Array.from(byStudent, ([id, own]) => ({
        item: id,
        value: this.scoreFor(this.averagesOf(own)),
      })),
    );
    const mine = rows.find((row) => row.item === studentId);
    return { rank: mine?.rank ?? null, rankedCount };
  }

  private async findEntries(
    where: Record<string, unknown>,
  ): Promise<GradeEntryView[]> {
    const entries = await this.gradeRepository.find({
      where,
      relations: { student: true, subject: true },
      order: { date: 'DESC', createdAt: 'DESC' },
    });
    return entries.map(toView);
  }

  private async loadWithRelations(gradeId: string): Promise<GradeEntry> {
    const entry = await this.gradeRepository.findOne({
      where: { id: gradeId },
      relations: { student: true, subject: true },
    });
    if (!entry) throw new NotFoundException('Grade not found');
    redactUserSecrets(entry.student);
    return entry;
  }

  /** grade là ai cũng được, nhưng HS phải đang thuộc lớp được ghi điểm. */
  private async assertActiveMember(
    classId: string,
    studentId: number,
  ): Promise<void> {
    const membership = await this.membershipRepository.findOne({
      where: { classId, studentId, leftAt: IsNull() },
    });
    if (!membership) {
      throw new BadRequestException(
        `Student ${studentId} is not an active member of this class`,
      );
    }
  }

  /**
   * Principal/ADMIN of the resolved school? (teacher-class scoping is the
   * else-branch in list()).
   */
  private async isSchoolAdmin(
    userId: number,
    schoolId: string,
    actor?: User | null,
  ): Promise<boolean> {
    if (actor?.roles?.includes(UserRole.ADMIN)) return true;
    // resolveSchoolIdForUser pins schoolId to the caller's own school, so
    // principalId match IS the "principal of THIS school" check.
    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
    });
    return school?.principalId === userId;
  }

  /** classIds the teacher may read: homeroom classes ∥ any assignment there. */
  private async teacherClassIds(
    userId: number,
    schoolId: string,
  ): Promise<string[]> {
    const [homerooms, assignments] = await Promise.all([
      this.classRepository.find({
        where: { schoolId, homeroomTeacherId: userId },
        select: { id: true },
      }),
      this.assignmentRepository.find({
        where: { schoolId, teacherId: userId },
        select: { classId: true },
      }),
    ]);
    return Array.from(
      new Set([
        ...homerooms.map((c) => c.id),
        ...assignments.map((a) => a.classId),
      ]),
    );
  }

  /**
   * Quyền xem bảng xếp hạng: có subjectId → theo đúng chuẩn ghi điểm môn đó
   * (assertWriteAccess); hạng TOÀN lớp chứa điểm mọi môn nên chỉ GVCN lớp đó,
   * hiệu trưởng hoặc ADMIN. Denial = 404 như class không tồn tại (rule D1).
   */
  private async assertRankingAccess(
    userId: number,
    query: ClassRankingQuery,
  ): Promise<{ cls: SchoolClass; subject: Subject | null }> {
    if (query.subjectId) {
      return this.assertWriteAccess(userId, query.classId, query.subjectId);
    }
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const cls = await this.classRepository.findOne({
      where: { id: query.classId, schoolId },
    });
    if (!cls) throw new NotFoundException('Class not found');
    if (cls.homeroomTeacherId === userId) return { cls, subject: null };
    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
    });
    if (school?.principalId === userId) return { cls, subject: null };
    const actor = await this.userRepository.findOne({ where: { id: userId } });
    if (actor?.roles?.includes(UserRole.ADMIN)) return { cls, subject: null };
    throw new NotFoundException('Class not found');
  }

  /**
   * Người ghi được điểm môn `subjectId` ở lớp `classId`:
   * GVCN lớp ∥ GV có TeachingAssignment(teacher×subject×class) ∥ hiệu trưởng
   * ∥ ADMIN. Mọi denial trả 404 giống object không tồn tại (rule D1).
   */
  private async assertWriteAccess(
    userId: number,
    classId: string,
    subjectId: string,
  ): Promise<{ cls: SchoolClass; subject: Subject }> {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const cls = await this.classRepository.findOne({
      where: { id: classId, schoolId },
    });
    if (!cls) throw new NotFoundException('Class not found');
    const subject = await this.subjectRepository.findOne({
      where: { id: subjectId, schoolId },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    if (cls.homeroomTeacherId === userId) return { cls, subject };

    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
    });
    if (school?.principalId === userId) return { cls, subject };

    const assignment = await this.assignmentRepository.findOne({
      where: { teacherId: userId, classId: cls.id, subjectId: subject.id },
    });
    if (assignment) return { cls, subject };

    const actor = await this.userRepository.findOne({ where: { id: userId } });
    if (actor?.roles?.includes(UserRole.ADMIN)) return { cls, subject };

    // Same 404 as a nonexistent class — never confirm it exists (D1).
    throw new NotFoundException('Class not found');
  }
}
