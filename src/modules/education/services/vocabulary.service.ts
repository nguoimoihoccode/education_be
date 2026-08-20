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
    let userVocab = await this.userVocabularyRepository.findOne({
      where: { userId, vocabularyId },
    });

    if (!userVocab) {
      userVocab = this.userVocabularyRepository.create({
        userId,
        vocabularyId,
      });
    }

    const { easeFactor, interval, repetitions, status } = calculateSrsReview({
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

    return this.userVocabularyRepository.save(userVocab);
  }
}
