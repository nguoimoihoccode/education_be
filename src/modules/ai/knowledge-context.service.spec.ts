import { Repository } from 'typeorm';
import { Lesson } from '../education/entities/lesson.entity';
import { Vocabulary } from '../education/entities/vocabulary.entity';
import {
  LESSON_CONTEXT_CHAR_BUDGET,
  KnowledgeContextService,
} from './knowledge-context.service';

const LESSON_ID = 'f2f4a1c8-0f5e-4a1f-9a11-2c3d4e5f6a7b';

// `content` and `description` are `nullable: true` columns that the entity still
// declares as `string`, and a lesson with no text is one of the cases under test.
type LessonOverrides = Partial<Omit<Lesson, 'content' | 'description'>> & {
  content?: string | null;
  description?: string | null;
};

const makeLesson = (overrides: LessonOverrides = {}): Lesson =>
  ({
    id: LESSON_ID,
    title: 'Thì hiện tại đơn',
    description: null,
    content: '<p>Diễn tả thói quen hằng ngày.</p>',
    active: true,
    courseId: 'course-1',
    ...overrides,
  }) as Lesson;

const makeVocabulary = (overrides: Partial<Vocabulary> = {}): Vocabulary =>
  ({
    id: 'vocab-1',
    word: 'always',
    meaning: 'luôn luôn',
    partOfSpeech: 'adverb',
    example: 'I always drink coffee',
    exampleTranslation: 'Tôi luôn uống cà phê',
    notes: null,
    orderIndex: 0,
    lessonId: LESSON_ID,
    ...overrides,
  }) as Vocabulary;

describe('KnowledgeContextService', () => {
  let lessonsRepo: jest.Mocked<Pick<Repository<Lesson>, 'findOne'>>;
  let vocabulariesRepo: jest.Mocked<Pick<Repository<Vocabulary>, 'find'>>;
  let service: KnowledgeContextService;

  beforeEach(() => {
    lessonsRepo = { findOne: jest.fn().mockResolvedValue(makeLesson()) };
    vocabulariesRepo = { find: jest.fn().mockResolvedValue([]) };
    service = new KnowledgeContextService(
      lessonsRepo as unknown as Repository<Lesson>,
      vocabulariesRepo as unknown as Repository<Vocabulary>,
    );
  });

  // A non-uuid would reach Postgres as an invalid uuid and error on every
  // message of the conversation, so it must be rejected before the query.
  it('grounds nothing when the lesson id is not a uuid', async () => {
    expect(await service.buildLessonContext('L42')).toBeNull();
    expect(await service.buildLessonContext('')).toBeNull();
    expect(await service.buildLessonContext(null)).toBeNull();
    expect(await service.buildLessonContext(undefined)).toBeNull();

    expect(lessonsRepo.findOne).not.toHaveBeenCalled();
  });

  it('grounds nothing when the lesson no longer exists', async () => {
    lessonsRepo.findOne.mockResolvedValue(null);

    expect(await service.buildLessonContext(LESSON_ID)).toBeNull();
  });

  it('grounds nothing on a lesson that has been deactivated', async () => {
    lessonsRepo.findOne.mockResolvedValue(makeLesson({ active: false }));

    expect(await service.buildLessonContext(LESSON_ID)).toBeNull();
  });

  it('includes the lesson title and its content', async () => {
    const context = await service.buildLessonContext(LESSON_ID);

    expect(context).toContain('Thì hiện tại đơn');
    expect(context).toContain('Diễn tả thói quen hằng ngày.');
  });

  it('includes the lesson description when there is one', async () => {
    lessonsRepo.findOne.mockResolvedValue(
      makeLesson({ description: '<p>Bài mở đầu</p>' }),
    );

    expect(await service.buildLessonContext(LESSON_ID)).toContain('Bài mở đầu');
  });

  it('includes the vocabulary of the lesson', async () => {
    vocabulariesRepo.find.mockResolvedValue([makeVocabulary()]);

    const context = await service.buildLessonContext(LESSON_ID);

    expect(context).toContain('always (adverb) — luôn luôn');
    expect(vocabulariesRepo.find).toHaveBeenCalledWith({
      where: { lessonId: LESSON_ID },
      order: { orderIndex: 'ASC' },
    });
  });

  // A video-only lesson has no text, but the tutor should still know which
  // lesson is being studied rather than being told nothing at all.
  it('still grounds on the title when the lesson has no text', async () => {
    lessonsRepo.findOne.mockResolvedValue(
      makeLesson({ content: null, description: null }),
    );

    const context = await service.buildLessonContext(LESSON_ID);

    expect(context).toContain('Thì hiện tại đơn');
  });

  it('stays within the budget instead of blowing up the prompt', async () => {
    const longContent = Array.from(
      { length: 500 },
      (_, i) => `Câu số ${i} giải thích một phần của bài học này.`,
    ).join(' ');
    lessonsRepo.findOne.mockResolvedValue(makeLesson({ content: longContent }));

    const context = await service.buildLessonContext(LESSON_ID);

    expect(context).not.toBeNull();
    expect(context!.length).toBeLessThanOrEqual(
      LESSON_CONTEXT_CHAR_BUDGET + 200,
    );
    expect(context).toContain('Câu số 0');
    expect(context).not.toContain('Câu số 400');
  });
});
