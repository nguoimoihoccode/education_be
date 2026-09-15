import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  HomeworkAssignment,
  HomeworkTargetType,
} from './entities/homework-assignment.entity';
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
import { Quiz } from '../education/entities/quiz.entity';
import { FlashcardDeck } from '../education/entities/flashcard-deck.entity';
import { SchoolService } from './school.service';
import { redactUserSecrets } from './school-sanitize.util';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { UserRole } from '../../common/enums/roles.enum';
import { CreateHomeworkDto } from './dto/homework.dto';

/** Cầu nối quiz→điểm: dữ liệu session vừa complete (0–100). */
export interface QuizGradeFacts {
  userId: number;
  sessionId: string;
  quizId: string;
  scorePercent: number;
  /** BTVN nguồn nếu FE gửi kèm — chỉ là hint; không có thì tự tra. */
  homeworkId?: string;
}

/**
 * Phase 4 (docs/SCHOOL_PLATFORM_PLAN.md): BTVN nối Learning Hub.
 * Write access như sổ điểm: GVCN ∥ GV được phân công môn×lớp ∥ hiệu trưởng
 * ∥ ADMIN — denials 404 (rule D1). `targetId` trỏ edu_quizzes /
 * edu_flashcard_decks (bảng toàn cục, không có schoolId — chỉ kiểm tra tồn tại).
 * recordQuizGrade là bridge best-effort cho quiz complete: không bao giờ
 * ném lỗi làm hỏng luồng Learning Hub, lỗi chỉ log.
 */
@Injectable()
export class HomeworkService {
  private readonly logger = new Logger(HomeworkService.name);

  constructor(
    @InjectRepository(HomeworkAssignment)
    private readonly homeworkRepository: Repository<HomeworkAssignment>,
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
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(FlashcardDeck)
    private readonly deckRepository: Repository<FlashcardDeck>,
    private readonly schoolService: SchoolService,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ---------- teacher / staff ----------

  async create(userId: number, dto: CreateHomeworkDto) {
    const { cls, subject } = await this.assertWriteAccess(
      userId,
      dto.classId,
      dto.subjectId,
    );
    await this.assertTargetExists(dto.targetType, dto.targetId);

    const homework = await this.homeworkRepository.save(
      this.homeworkRepository.create({
        schoolId: cls.schoolId,
        classId: cls.id,
        subjectId: subject.id,
        teacherId: userId,
        title: dto.title.trim(),
        dueDate: new Date(dto.dueDate),
        targetType: dto.targetType,
        targetId: dto.targetId,
        countsAsGrade:
          dto.countsAsGrade === true &&
          dto.targetType === HomeworkTargetType.QUIZ,
      }),
    );

    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.homework.assign',
      detail: `Giao BTVN "${homework.title}" cho lớp ${cls.name}`,
      metadata: {
        schoolId: cls.schoolId,
        classId: cls.id,
        subjectId: subject.id,
        homeworkId: homework.id,
        countsAsGrade: homework.countsAsGrade,
      },
    });
    return this.toView(homework, subject.name, cls.name);
  }

  /** Danh sách cho staff: hiệu trưởng = cả school, GV = các lớp của mình. */
  async listForStaff(userId: number, classId?: string, subjectId?: string) {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const where: Record<string, unknown> = { schoolId };
    if (subjectId) where.subjectId = subjectId;

    if (await this.isSchoolAdmin(userId, schoolId)) {
      if (classId) where.classId = classId;
    } else {
      const classIds = await this.teacherClassIds(userId, schoolId);
      if (classId) {
        if (!classIds.includes(classId)) {
          throw new NotFoundException('Class not found');
        }
        where.classId = classId;
      } else if (classIds.length > 0) {
        where.classId = In(classIds);
      } else {
        return [];
      }
    }
    const rows = await this.homeworkRepository.find({
      where,
      relations: { subject: true, schoolClass: true },
      order: { dueDate: 'DESC' },
    });
    return rows.map((h) =>
      this.toView(h, h.subject?.name ?? null, h.schoolClass?.name ?? null),
    );
  }

  async remove(userId: number, homeworkId: string) {
    const schoolId = await this.schoolService.resolveSchoolIdForUser(userId);
    const homework = await this.homeworkRepository.findOne({
      where: { id: homeworkId, schoolId },
    });
    if (!homework) throw new NotFoundException('Homework not found');
    if (homework.teacherId !== userId) {
      // creator may always delete their own; others need class×subject access
      await this.assertWriteAccess(
        userId,
        homework.classId,
        homework.subjectId,
      );
    }
    await this.homeworkRepository.delete({ id: homework.id }); // grades CASCADE
    await this.activityLog.recordBestEffort({
      userId,
      type: EducationActivityType.SCHOOL,
      action: 'school.homework.delete',
      detail: `Xóa BTVN "${homework.title}"`,
      metadata: { schoolId, homeworkId: homework.id },
    });
    return { deleted: true };
  }

  // ---------- student side ----------

  /** GET /me/homework — bài của mọi lớp HS đang học, deadline mới nhất trước. */
  async listForStudent(userId: number) {
    const memberships = await this.membershipRepository.find({
      where: { studentId: userId, leftAt: IsNull() },
    });
    const classIds = memberships.map((m) => m.classId);
    if (classIds.length === 0) return { homework: [], graded: [] };
    const homework = await this.homeworkRepository.find({
      where: { classId: In(classIds) },
      relations: { subject: true, schoolClass: true, teacher: true },
      order: { dueDate: 'ASC' },
    });
    // đầu điểm tự sinh để FE tick "đã làm" cho bài countsAsGrade
    const graded = await this.gradeRepository.find({
      where: { studentId: userId, homeworkId: In(homework.map((h) => h.id)) },
      select: { homeworkId: true, quizSessionId: true, score: true },
    });
    return {
      homework: homework.map((h) => ({
        ...this.toView(h, h.subject?.name ?? null, h.schoolClass?.name ?? null),
        teacherName: h.teacher?.name ?? null,
        overdue: new Date(h.dueDate).getTime() < Date.now(),
      })),
      graded: graded.map((g) => ({
        homeworkId: g.homeworkId,
        quizSessionId: g.quizSessionId,
        score: g.score,
      })),
    };
  }

  /** Parent view (approved links only) — cùng gate pattern với Phase 3. */
  async getChildHomework(parentUserId: number, studentId: number) {
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
    const memberships = await this.membershipRepository.find({
      where: { studentId, schoolId: link.schoolId, leftAt: IsNull() },
    });
    const classIds = memberships.map((m) => m.classId);
    if (classIds.length === 0) return [];
    const rows = await this.homeworkRepository.find({
      where: { schoolId: link.schoolId, classId: In(classIds) },
      relations: { subject: true, schoolClass: true, teacher: true },
      order: { dueDate: 'DESC' },
    });
    return rows.map((h) => ({
      id: h.id,
      title: h.title,
      className: h.schoolClass?.name ?? null,
      subjectName: h.subject?.name ?? null,
      teacherName: h.teacher?.name ?? null,
      dueDate: h.dueDate,
      targetType: h.targetType,
      targetId: h.targetId,
      countsAsGrade: h.countsAsGrade,
    }));
  }

  // ---------- quiz → grade bridge (best-effort, gọi từ QuizSessionCompletionService) ----------

  /**
   * Quiz vừa complete → đầu điểm 15 phút nếu quiz đó đang được giao cho
   * lớp của HS với `countsAsGrade`. Upsert theo (studentId, homeworkId):
   * lần làm sau ghi đè lần trước (quizSessionId mới). Không ném lỗi —
   * caller chỉ log; luồng Learning Hub không bao giờ vì trường học mà fail.
   */
  async recordQuizGrade(facts: QuizGradeFacts): Promise<GradeEntry[] | null> {
    const memberships = await this.membershipRepository.find({
      where: { studentId: facts.userId, leftAt: IsNull() },
    });
    const classIds = memberships.map((m) => m.classId);
    if (classIds.length === 0) return null;

    const candidates = await this.homeworkRepository.find({
      where: {
        targetType: HomeworkTargetType.QUIZ,
        targetId: facts.quizId,
        countsAsGrade: true,
        classId: In(classIds),
      },
    });
    if (candidates.length === 0) return null;

    const today = new Date().toISOString().slice(0, 10);
    const term = this.currentTerm();
    const score = Math.round(facts.scorePercent) / 10; // 0–100 → 0–10 (1 số lẻ)

    const saved: GradeEntry[] = [];
    for (const hw of candidates) {
      const existing = await this.gradeRepository.findOne({
        where: { studentId: facts.userId, homeworkId: hw.id },
      });
      let entry: GradeEntry;
      if (existing) {
        existing.score = score;
        existing.quizSessionId = facts.sessionId;
        existing.date = today;
        entry = await this.gradeRepository.save(existing);
      } else {
        entry = await this.gradeRepository.save(
          this.gradeRepository.create({
            schoolId: hw.schoolId,
            classId: hw.classId,
            subjectId: hw.subjectId,
            studentId: facts.userId,
            testType: GradeTestType.MIN15,
            coefficient: DEFAULT_COEFFICIENT[GradeTestType.MIN15],
            score,
            date: today,
            term,
            quizSessionId: facts.sessionId,
            homeworkId: hw.id,
          }),
        );
      }
      saved.push(entry);
      await this.activityLog.recordBestEffort({
        userId: facts.userId,
        type: EducationActivityType.SCHOOL,
        action: 'school.grade.auto',
        detail: `Tự sinh đầu điểm 15p ${score} từ BTVN "${hw.title}"`,
        metadata: {
          schoolId: hw.schoolId,
          classId: hw.classId,
          subjectId: hw.subjectId,
          homeworkId: hw.id,
          quizSessionId: facts.sessionId,
        },
      });
    }
    return saved.length > 0 ? saved : null;
  }

  /** 9–12 → học kỳ 1; 1–8 → học kỳ 2 (GV sửa được trong sổ điểm). */
  private currentTerm(): number {
    const month = new Date().getMonth() + 1;
    return month >= 9 ? 1 : 2;
  }

  // ---------- helpers ----------

  private toView(
    h: HomeworkAssignment,
    subjectName: string | null,
    className: string | null,
  ) {
    redactUserSecrets(h.teacher);
    return {
      id: h.id,
      schoolId: h.schoolId,
      classId: h.classId,
      className,
      subjectId: h.subjectId,
      subjectName,
      teacherId: h.teacherId,
      teacherName: h.teacher?.name ?? null,
      title: h.title,
      dueDate: h.dueDate,
      targetType: h.targetType,
      targetId: h.targetId,
      countsAsGrade: h.countsAsGrade,
      createdAt: h.createdAt,
    };
  }

  /**
   * Quiz/deck là bảng toàn cục của module education (không có schoolId) —
   * chỉ kiểm tra TỒN TẠI. ID lạ → 400 (không leak gì vì ai cũng browse
   * được quiz/deck public của Learning Hub).
   */
  private async assertTargetExists(
    targetType: HomeworkTargetType,
    targetId: string,
  ): Promise<void> {
    if (targetType === HomeworkTargetType.QUIZ) {
      const quiz = await this.quizRepository.findOne({
        where: { id: targetId },
        select: { id: true },
      });
      if (!quiz) throw new BadRequestException('Quiz target not found');
    } else {
      const deck = await this.deckRepository.findOne({
        where: { id: targetId },
        select: { id: true },
      });
      if (!deck)
        throw new BadRequestException('Flashcard deck target not found');
    }
  }

  private async isSchoolAdmin(
    userId: number,
    schoolId: string,
  ): Promise<boolean> {
    const actor = await this.userRepository.findOne({ where: { id: userId } });
    if (actor?.roles?.includes(UserRole.ADMIN)) return true;
    const school = await this.schoolRepository.findOne({
      where: { id: schoolId },
    });
    return school?.principalId === userId;
  }

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

  /** GVCN lớp ∥ GV dạy môn×lớp ∥ hiệu trưởng ∥ ADMIN — else 404 (rule D1). */
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

    throw new NotFoundException('Class not found');
  }
}
