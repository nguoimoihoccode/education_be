import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserCourse,
  UserLesson,
  UserVocabulary,
  UserStreak,
  EnrollmentStatus,
  VocabularyStatus,
} from '../entities';
import { CourseCatalogService } from './course-catalog.service';
import { StreakService } from './streak.service';

@Injectable()
export class UserCourseService {
  constructor(
    @InjectRepository(UserCourse)
    private readonly userCourseRepository: Repository<UserCourse>,
    @InjectRepository(UserLesson)
    private readonly userLessonRepository: Repository<UserLesson>,
    @InjectRepository(UserVocabulary)
    private readonly userVocabularyRepository: Repository<UserVocabulary>,
    private readonly courseCatalogService: CourseCatalogService,
    private readonly streakService: StreakService,
  ) {}

  // ==================== ENROLLMENT ====================
  async enrollCourse(userId: string, courseId: string): Promise<UserCourse> {
    const course = await this.courseCatalogService.getCourseById(courseId);

    const existingEnrollment = await this.userCourseRepository.findOne({
      where: { userId, courseId },
    });

    if (existingEnrollment) {
      throw new ConflictException('Already enrolled in this course');
    }

    const userCourse = this.userCourseRepository.create({
      userId,
      courseId: course.id,
      status: EnrollmentStatus.ENROLLED,
    });

    return this.userCourseRepository.save(userCourse);
  }

  async getUserCourses(userId: string): Promise<UserCourse[]> {
    return this.userCourseRepository.find({
      where: { userId },
      relations: ['course', 'course.language'],
      order: { updatedAt: 'DESC' },
    });
  }

  async getUserProgress(userId: string): Promise<{
    streak: UserStreak;
    enrolledCourses: number;
    completedCourses: number;
    completedLessons: number;
    learnedVocabularies: number;
    masteredVocabularies: number;
  }> {
    const streak = await this.streakService.getUserStreak(userId);

    const enrolledCourses = await this.userCourseRepository.count({
      where: { userId },
    });

    const completedCourses = await this.userCourseRepository.count({
      where: { userId, status: EnrollmentStatus.COMPLETED },
    });

    const completedLessons = await this.userLessonRepository.count({
      where: { userId, completed: true },
    });

    const learnedVocabularies = await this.userVocabularyRepository.count({
      where: { userId },
    });

    const masteredVocabularies = await this.userVocabularyRepository.count({
      where: { userId, status: VocabularyStatus.MASTERED },
    });

    return {
      streak,
      enrolledCourses,
      completedCourses,
      completedLessons,
      learnedVocabularies,
      masteredVocabularies,
    };
  }
}
