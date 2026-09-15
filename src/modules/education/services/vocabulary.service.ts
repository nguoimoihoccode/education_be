import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Vocabulary, UserVocabulary, VocabularyStatus } from '../entities';
import { CreateVocabularyDto, ReviewVocabularyDto } from '../dto';
import { calculateSrsReview, nextReviewDate } from '../domain/srs.policy';
import { LessonContentService } from './lesson-content.service';

@Injectable()
export class VocabularyService {
  constructor(
    @InjectRepository(Vocabulary)
    private readonly vocabularyRepository: Repository<Vocabulary>,
    @InjectRepository(UserVocabulary)
    private readonly userVocabularyRepository: Repository<UserVocabulary>,
    private readonly lessonContentService: LessonContentService,
  ) {}

  // ==================== VOCABULARY ====================
  async getVocabularyByLesson(
    lessonId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    vocabulary: Vocabulary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [vocabulary, total] = await this.vocabularyRepository.findAndCount({
      where: { lessonId },
      order: { orderIndex: 'ASC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return { vocabulary, total, page, limit, totalPages };
  }

  async createVocabulary(dto: CreateVocabularyDto): Promise<Vocabulary> {
    const lesson = await this.lessonContentService.getLessonById(dto.lessonId);

    const maxOrder = await this.vocabularyRepository
      .createQueryBuilder('vocab')
      .where('vocab.lessonId = :lessonId', { lessonId: dto.lessonId })
      .select('MAX(vocab.orderIndex)', 'max')
      .getRawOne();

    const vocabulary = this.vocabularyRepository.create({
      ...dto,
      lesson,
      orderIndex: (maxOrder?.max || 0) + 1,
    });

    return this.vocabularyRepository.save(vocabulary);
  }

  async getVocabularyToReview(
    userId: string,
    limit = 20,
  ): Promise<Vocabulary[]> {
    const now = new Date();

    const userVocabs = await this.userVocabularyRepository.find({
      where: {
        userId,
        nextReview: LessThanOrEqual(now),
      },
      relations: ['vocabulary'],
      order: { nextReview: 'ASC' },
      take: limit,
    });

    return userVocabs.map((uv) => uv.vocabulary);
  }

  async reviewVocabulary(
    userId: string,
    vocabularyId: string,
    dto: ReviewVocabularyDto,
  ): Promise<UserVocabulary> {
    // Insert-or-ignore the skeleton row, then lock it: two concurrent first
    // reviews would otherwise both "create" the row and one would violate
    // the (userId, vocabularyId) unique constraint with a 500.
    return this.userVocabularyRepository.manager.transaction(
      async (manager) => {
        const userVocabularyRepository = manager.getRepository(UserVocabulary);

        await userVocabularyRepository
          .createQueryBuilder()
          .insert()
          .into(UserVocabulary)
          .values({ userId, vocabularyId })
          .orIgnore()
          .execute();

        const userVocab = await userVocabularyRepository.findOne({
          where: { userId, vocabularyId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!userVocab) {
          throw new Error(
            `User vocabulary row missing for user ${userId} vocabulary ${vocabularyId}`,
          );
        }

        const { easeFactor, interval, repetitions, status } =
          calculateSrsReview({
            quality: dto.quality,
            easeFactor: Number(userVocab.easeFactor),
            interval: userVocab.interval,
            repetitions: userVocab.repetitions,
          });

        userVocab.easeFactor = easeFactor;
        userVocab.interval = interval;
        userVocab.repetitions = repetitions;
        userVocab.status = status as VocabularyStatus;
        userVocab.lastReviewed = new Date();
        userVocab.nextReview = nextReviewDate(new Date(), interval);

        if (dto.quality >= 3) {
          userVocab.correctCount += 1;
        } else {
          userVocab.wrongCount += 1;
        }

        return userVocabularyRepository.save(userVocab);
      },
    );
  }
}
