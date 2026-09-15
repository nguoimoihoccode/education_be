import { VocabularyService } from './vocabulary.service';

const createRepository = (
  overrides: Record<string, unknown> = {},
): Record<string, any> => {
  const repository: Record<string, any> = {
    count: jest.fn(),
    create: jest.fn((value) => value),
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  // First-review skeleton rows are inserted through an insert-or-ignore
  // query builder chain; give the default a chainable stub.
  repository.createQueryBuilder = jest.fn(() => {
    const builder: any = {};
    for (const method of ['insert', 'into', 'values', 'orIgnore']) {
      builder[method] = jest.fn().mockReturnValue(builder);
    }
    builder.execute = jest.fn().mockResolvedValue(undefined);
    return builder;
  });
  repository.manager = {
    transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
      work({ getRepository: () => repository }),
    ),
  };
  Object.assign(repository, overrides);
  return repository;
};

describe('VocabularyService.reviewVocabulary', () => {
  const createService = (userVocab: Record<string, any> | null) => {
    const vocabularyRepository = createRepository();
    const userVocabularyRepository = createRepository();
    userVocabularyRepository.findOne.mockResolvedValue(userVocab);
    const lessonContentService = {
      getLessonById: jest.fn(),
    };
    const service = new VocabularyService(
      vocabularyRepository as never,
      userVocabularyRepository as never,
      lessonContentService as never,
    );
    return { service, vocabularyRepository, userVocabularyRepository };
  };

  it('locks the SRS row inside a transaction and schedules the next review', async () => {
    const { service, userVocabularyRepository } = createService({
      userId: 'user-1',
      vocabularyId: 'vocab-1',
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      correctCount: 0,
      wrongCount: 0,
    });

    const saved = await service.reviewVocabulary('user-1', 'vocab-1', {
      quality: 5,
    } as never);

    // The row was fetched with a pessimistic lock and updated.
    expect(userVocabularyRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(userVocabularyRepository.save).toHaveBeenCalledTimes(1);
    expect(saved.repetitions).toBe(1);
    expect(saved.correctCount).toBe(1);
    expect(saved.lastReviewed).toBeInstanceOf(Date);
    expect(saved.nextReview).toBeInstanceOf(Date);
  });

  it('insert-or-ignores a skeleton row so a first review never races the unique constraint', async () => {
    const { service, userVocabularyRepository } = createService({
      userId: 'user-1',
      vocabularyId: 'vocab-1',
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      correctCount: 0,
      wrongCount: 0,
    });

    await service.reviewVocabulary('user-1', 'vocab-1', {
      quality: 1,
    } as never);

    const builder = (userVocabularyRepository.createQueryBuilder as jest.Mock)
      .mock.results[0].value;
    expect(builder.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', vocabularyId: 'vocab-1' }),
    );
    expect(builder.execute).toHaveBeenCalledTimes(1);
    expect(userVocabularyRepository.save.mock.calls[0][0]).toMatchObject({
      wrongCount: 1,
      correctCount: 0,
    });
  });
});
