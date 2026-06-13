import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { Repository } from 'typeorm';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EducationActivityType } from '../activity-log/entities/activity-log.entity';
import { FlashcardDeck } from '../education/entities/flashcard-deck.entity';
import { Flashcard } from '../education/entities/flashcard.entity';
import { QuizSession } from '../education/entities/quiz-session.entity';
import { ReviewSession } from '../education/entities/review-session.entity';
import { UserCourse } from '../education/entities/user-course.entity';
import { UserLesson } from '../education/entities/user-lesson.entity';
import { EducationSocialComment } from '../education-social/entities/social-comment.entity';
import { EducationSocialPost } from '../education-social/entities/social-post.entity';
import { User } from '../users/entities/user.entity';
import {
  EducationExportFormat,
  EducationExportStatus,
  EducationExportTimeRange,
  EducationDataExport,
} from './entities/data-export.entity';
import {
  serializeCsvZip,
  serializeJsonExport,
  type ExportDataset,
} from './data-export.serializer';
import { RequestDataExportDto } from './dto/request-data-export.dto';
import { MoreThanOrEqual } from 'typeorm';

export type EducationDataExportHistoryItem = {
  id: string;
  date: string;
  format: EducationExportFormat;
  status: EducationExportStatus;
  size: string;
  name: string;
};

@Injectable()
export class DataExportService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserCourse)
    private readonly userCourseRepository: Repository<UserCourse>,
    @InjectRepository(UserLesson)
    private readonly userLessonRepository: Repository<UserLesson>,
    @InjectRepository(FlashcardDeck)
    private readonly flashcardDeckRepository: Repository<FlashcardDeck>,
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    @InjectRepository(ReviewSession)
    private readonly reviewSessionRepository: Repository<ReviewSession>,
    @InjectRepository(QuizSession)
    private readonly quizSessionRepository: Repository<QuizSession>,
    @InjectRepository(EducationSocialPost)
    private readonly socialPostRepository: Repository<EducationSocialPost>,
    @InjectRepository(EducationSocialComment)
    private readonly socialCommentRepository: Repository<EducationSocialComment>,
    @InjectRepository(EducationDataExport)
    private readonly dataExportRepository: Repository<EducationDataExport>,
    private readonly configService: ConfigService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async list(userId: number): Promise<EducationDataExportHistoryItem[]> {
    const rows = await this.dataExportRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return rows.map((row) => this.toHistoryItem(row));
  }

  async create(
    userId: number,
    dto: RequestDataExportDto,
  ): Promise<EducationDataExportHistoryItem> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const exportId = randomUUID();
    const createdAt = new Date();
    const rootPath = this.configService.get<string>(
      'EDUCATION_EXPORT_STORAGE_PATH',
      'exports/education',
    );
    const directory = path.join(rootPath, String(userId));
    const extension =
      dto.format === EducationExportFormat.JSON ? 'json' : 'zip';
    const fileName = `education-export-${exportId}.${extension}`;
    const finalPath = path.join(directory, fileName);
    const tempPath = path.join(directory, `${exportId}.tmp`);

    await mkdir(directory, { recursive: true });

    try {
      const dataset = await this.buildDataset(userId, dto);
      const buffer =
        dto.format === EducationExportFormat.JSON
          ? serializeJsonExport(dataset)
          : await serializeCsvZip(dataset);

      await writeFile(tempPath, buffer);
      await rename(tempPath, finalPath);

      const record = await this.dataExportRepository.save(
        this.dataExportRepository.create({
          id: exportId,
          userId,
          format: dto.format,
          timeRange: dto.timeRange,
          dataTypes: dto.dataTypes,
          status: EducationExportStatus.COMPLETED,
          fileName,
          filePath: finalPath,
          fileSize: buffer.length,
          errorMessage: null,
          completedAt: createdAt,
        }),
      );

      await this.activityLogService.recordBestEffort({
        userId,
        type: EducationActivityType.SYSTEM,
        action: 'data_export_created',
        detail: `Created ${dto.format.toUpperCase()} export`,
        metadata: {
          exportId: record.id,
          format: dto.format,
          timeRange: dto.timeRange,
          dataTypes: dto.dataTypes,
        },
      });

      return this.toHistoryItem(record);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      await unlink(finalPath).catch(() => undefined);

      const record = this.dataExportRepository.create({
        id: exportId,
        userId,
        format: dto.format,
        timeRange: dto.timeRange,
        dataTypes: dto.dataTypes,
        status: EducationExportStatus.FAILED,
        fileName,
        filePath: finalPath,
        fileSize: 0,
        errorMessage: error instanceof Error ? error.message : 'Export failed',
        completedAt: createdAt,
      });

      await this.dataExportRepository.save(record).catch(() => undefined);
      throw error;
    }
  }

  async download(
    userId: number,
    exportId: string,
  ): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
    const exportRecord = await this.dataExportRepository.findOne({
      where: { id: exportId, userId },
    });

    if (!exportRecord) {
      throw new NotFoundException('Export not found');
    }

    if (exportRecord.status !== EducationExportStatus.COMPLETED) {
      throw new BadRequestException('Export is not ready for download');
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(exportRecord.filePath);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      throw new NotFoundException(
        code === 'ENOENT'
          ? 'Export file not found'
          : 'Export file could not be read',
      );
    }

    const contentType =
      exportRecord.format === EducationExportFormat.JSON
        ? 'application/json'
        : 'application/zip';

    return {
      buffer,
      fileName: exportRecord.fileName,
      contentType,
    };
  }

  private async buildDataset(
    userId: number,
    dto: RequestDataExportDto,
  ): Promise<ExportDataset> {
    const cutoff = this.getTimeRangeCutoff(dto.timeRange);
    const entries: ExportDataset = {};

    if (dto.dataTypes.profile) {
      entries.profile = await this.buildProfileDataset(userId);
    }
    if (dto.dataTypes.progress) {
      entries.progress = await this.buildProgressDataset(userId, cutoff);
    }
    if (dto.dataTypes.flashcards) {
      entries.flashcards = await this.buildFlashcardDataset(userId, cutoff);
    }
    if (dto.dataTypes.quizzes) {
      entries.quizzes = await this.buildQuizDataset(userId, cutoff);
    }
    if (dto.dataTypes.forum) {
      entries.forum = await this.buildForumDataset(userId, cutoff);
    }

    return entries;
  }

  private async buildProfileDataset(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return [
      {
        id: String(user.id),
        email: user.email,
        name: user.name ?? '',
        username: user.username ?? '',
        avatar: user.avatar ?? null,
        phone: user.phone ?? null,
        provider: user.provider ?? null,
        providerId: user.providerId ?? null,
        roles: user.roles ?? [],
        isTeacher: user.isTeacher,
        teacherVerified: user.teacherVerified,
        teacherBio: user.teacherBio ?? null,
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    ];
  }

  private async buildProgressDataset(
    userId: number,
    cutoff: Date | null,
  ): Promise<Array<Record<string, unknown>>> {
    const userKey = String(userId);
    const courseWhere = cutoff
      ? [
          { userId: userKey, enrolledAt: this.moreThanOrEqual(cutoff) },
          { userId: userKey, completedAt: this.moreThanOrEqual(cutoff) },
        ]
      : [{ userId: userKey }];
    const lessonWhere = cutoff
      ? { userId: userKey, completedAt: this.moreThanOrEqual(cutoff) }
      : { userId: userKey };

    const [courses, lessons] = await Promise.all([
      this.userCourseRepository.find({
        where: courseWhere,
        relations: ['course'],
        order: { enrolledAt: 'DESC' },
      }),
      this.userLessonRepository.find({
        where: lessonWhere,
        relations: ['lesson', 'lesson.course'],
        order: { completedAt: 'DESC', createdAt: 'DESC' },
      }),
    ]);

    return [
      ...courses.map((course) => ({
        recordType: 'course',
        id: course.id,
        courseId: course.courseId,
        courseTitle: course.course?.title ?? null,
        status: course.status,
        progress: Number(course.progress),
        completedLessons: course.completedLessons,
        lastLessonId: course.lastLessonId ?? null,
        enrolledAt: course.enrolledAt.toISOString(),
        completedAt: course.completedAt?.toISOString() ?? null,
        totalTimeSpent: course.totalTimeSpent,
        createdAt: course.createdAt.toISOString(),
        updatedAt: course.updatedAt.toISOString(),
      })),
      ...lessons.map((lesson) => ({
        recordType: 'lesson',
        id: lesson.id,
        lessonId: lesson.lessonId,
        lessonTitle: lesson.lesson?.title ?? null,
        courseId: lesson.lesson?.courseId ?? null,
        courseTitle: lesson.lesson?.course?.title ?? null,
        completed: lesson.completed,
        completedAt: lesson.completedAt?.toISOString() ?? null,
        timeSpent: lesson.timeSpent,
        exerciseScore: lesson.exerciseScore ?? null,
        attempts: lesson.attempts,
        createdAt: lesson.createdAt.toISOString(),
        updatedAt: lesson.updatedAt.toISOString(),
      })),
    ];
  }

  private async buildFlashcardDataset(
    userId: number,
    cutoff: Date | null,
  ): Promise<Array<Record<string, unknown>>> {
    const [decks, flashcards, reviews] = await Promise.all([
      this.flashcardDeckRepository.find({
        where: cutoff
          ? { userId, createdAt: this.moreThanOrEqual(cutoff) }
          : { userId },
        order: { createdAt: 'DESC' },
      }),
      this.flashcardRepository.find({
        where: cutoff
          ? { userId, createdAt: this.moreThanOrEqual(cutoff) }
          : { userId },
        relations: ['deck'],
        order: { createdAt: 'DESC' },
      }),
      this.reviewSessionRepository.find({
        where: cutoff
          ? [
              { userId, completedAt: this.moreThanOrEqual(cutoff) },
              { userId, startedAt: this.moreThanOrEqual(cutoff) },
            ]
          : { userId },
        relations: ['deck'],
        order: { startedAt: 'DESC' },
      }),
    ]);

    return [
      ...decks.map((deck) => ({
        recordType: 'deck',
        id: deck.id,
        name: deck.name,
        description: deck.description ?? null,
        icon: deck.icon ?? null,
        color: deck.color ?? null,
        cardCount: deck.cardCount,
        type: deck.type,
        topic: deck.topic ?? null,
        isPublic: deck.isPublic,
        createdAt: deck.createdAt.toISOString(),
        updatedAt: deck.updatedAt.toISOString(),
      })),
      ...flashcards.map((flashcard) => ({
        recordType: 'flashcard',
        id: flashcard.id,
        deckId: flashcard.deckId,
        deckName: flashcard.deck?.name ?? null,
        front: flashcard.front,
        back: flashcard.back ?? null,
        pronunciation: flashcard.pronunciation ?? null,
        example: flashcard.example ?? null,
        exampleTranslation: flashcard.exampleTranslation ?? null,
        description: flashcard.description ?? null,
        audioUrl: flashcard.audioUrl ?? null,
        imageUrl: flashcard.imageUrl ?? null,
        notes: flashcard.notes ?? null,
        status: flashcard.status,
        difficulty: flashcard.difficulty,
        viewCount: flashcard.viewCount,
        tags: flashcard.tags ?? [],
        createdAt: flashcard.createdAt.toISOString(),
        updatedAt: flashcard.updatedAt.toISOString(),
      })),
      ...reviews.map((review) => ({
        recordType: 'review_session',
        id: review.id,
        type: review.type,
        totalCards: review.totalCards,
        correctCards: review.correctCards,
        wrongCards: review.wrongCards,
        skippedCards: review.skippedCards,
        timeSpent: review.timeSpent,
        xpEarned: review.xpEarned,
        completed: review.completed,
        startedAt: review.startedAt.toISOString(),
        completedAt: review.completedAt?.toISOString() ?? null,
        deckId: review.deckId ?? null,
        deckName: review.deck?.name ?? null,
      })),
    ];
  }

  private async buildQuizDataset(
    userId: number,
    cutoff: Date | null,
  ): Promise<Array<Record<string, unknown>>> {
    const sessions = await this.quizSessionRepository.find({
      where: cutoff
        ? [
            { userId, completedAt: this.moreThanOrEqual(cutoff) },
            { userId, startedAt: this.moreThanOrEqual(cutoff) },
          ]
        : { userId },
      relations: ['quiz'],
      order: { completedAt: 'DESC', startedAt: 'DESC' },
    });

    return sessions.map((session) => ({
      recordType: 'quiz_session',
      id: session.id,
      quizId: session.quizId,
      quizName: session.quiz?.name ?? null,
      score: session.score,
      totalPoints: session.totalPoints,
      earnedPoints: session.earnedPoints,
      correctAnswers: session.correctAnswers,
      wrongAnswers: session.wrongAnswers,
      skippedAnswers: session.skippedAnswers,
      timeSpent: session.timeSpent,
      passed: session.passed,
      completed: session.completed,
      startedAt: session.startedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      answers: session.answers ?? [],
      questionOrder: session.questionOrder ?? [],
      attemptNumber: session.attemptNumber,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    }));
  }

  private async buildForumDataset(
    userId: number,
    cutoff: Date | null,
  ): Promise<Array<Record<string, unknown>>> {
    const [posts, comments] = await Promise.all([
      this.socialPostRepository.find({
        where: cutoff
          ? { authorId: userId, createdAt: this.moreThanOrEqual(cutoff) }
          : { authorId: userId },
        order: { createdAt: 'DESC' },
      }),
      this.socialCommentRepository.find({
        where: cutoff
          ? { authorId: userId, createdAt: this.moreThanOrEqual(cutoff) }
          : { authorId: userId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return [
      ...posts.map((post) => ({
        recordType: 'post',
        id: post.id,
        type: post.type,
        content: post.content,
        imageUrl: post.imageUrl ?? null,
        tags: post.tags ?? [],
        sharesCount: post.sharesCount,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      })),
      ...comments.map((comment) => ({
        recordType: 'comment',
        id: comment.id,
        postId: comment.postId,
        content: comment.content,
        likesCount: comment.likesCount,
        createdAt: comment.createdAt.toISOString(),
      })),
    ];
  }

  private toHistoryItem(
    row: EducationDataExport,
  ): EducationDataExportHistoryItem {
    return {
      id: row.id,
      date: row.createdAt.toISOString(),
      format: row.format,
      status: row.status,
      size: this.formatBytes(row.fileSize),
      name: row.fileName,
    };
  }

  private getTimeRangeCutoff(timeRange: EducationExportTimeRange): Date | null {
    if (timeRange === EducationExportTimeRange.ALL) {
      return null;
    }

    const now = new Date();

    if (timeRange === EducationExportTimeRange.THIRTY_DAYS) {
      const cutoff = new Date(now);
      cutoff.setUTCDate(cutoff.getUTCDate() - 30);
      return cutoff;
    }

    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  }

  private moreThanOrEqual(cutoff: Date) {
    return MoreThanOrEqual(cutoff);
  }

  private formatBytes(bytes: number): string {
    if (bytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    const unitIndex = Math.min(
      units.length - 1,
      Math.floor(Math.log(bytes) / Math.log(1024)),
    );
    const value = bytes / 1024 ** unitIndex;

    return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
  }
}
