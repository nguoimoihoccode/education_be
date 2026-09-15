import { FlashcardItemService } from './flashcard-item.service';
import { FlashcardDeck } from '../entities';

const createRepository = (): Record<string, any> => {
  const repository: Record<string, any> = {
    count: jest.fn(),
    create: jest.fn((value) => value),
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    increment: jest.fn(),
    decrement: jest.fn(),
    remove: jest.fn((value) => Promise.resolve(value)),
    save: jest.fn((value) => Promise.resolve(value)),
    update: jest.fn(),
  };
  repository.manager = {
    transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
      work({ getRepository: () => repository }),
    ),
  };
  return repository;
};

describe('FlashcardItemService deck-counter transactions', () => {
  const createService = () => {
    const flashcardRepository = createRepository();
    const flashcardDeckRepository = createRepository();
    const vocabularyRepository = createRepository();
    const lessonRepository = createRepository();
    // Route each transaction entity to its mock repository.
    flashcardRepository.manager = {
      transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
        work({
          getRepository: (entity: unknown) =>
            entity === FlashcardDeck
              ? flashcardDeckRepository
              : flashcardRepository,
        }),
      ),
    };
    const service = new FlashcardItemService(
      flashcardRepository as never,
      flashcardDeckRepository as never,
      vocabularyRepository as never,
      lessonRepository as never,
    );
    return {
      service,
      flashcardRepository,
      flashcardDeckRepository,
      lessonRepository,
      vocabularyRepository,
    };
  };

  it('saves a flashcard and bumps the deck counter through one transaction', async () => {
    const { service, flashcardRepository, flashcardDeckRepository } =
      createService();
    flashcardDeckRepository.findOne.mockResolvedValue({ id: 'deck-1' });

    await service.createFlashcard(1, {
      front: 'hello',
      back: 'xin chào',
      deckId: 'deck-1',
    } as never);

    expect(flashcardRepository.manager.transaction).toHaveBeenCalled();
    expect(flashcardRepository.save).toHaveBeenCalledTimes(1);
    expect(flashcardDeckRepository.increment).toHaveBeenCalledWith(
      { id: 'deck-1' },
      'cardCount',
      1,
    );
  });

  it('routes bulk-created cards and the deck counter bump through one transaction', async () => {
    const { service, flashcardRepository, flashcardDeckRepository } =
      createService();
    flashcardDeckRepository.findOne.mockResolvedValue({ id: 'deck-1' });

    const result = await service.bulkCreateFlashcards(1, {
      deckId: 'deck-1',
      flashcards: [
        { front: 'one', back: 'một' },
        { front: 'two', back: 'hai' },
        { front: 'one', back: 'duplicate' },
      ],
    } as never);

    expect(result.total).toBe(2);
    expect(result.skipped).toEqual(['one']);
    expect(flashcardDeckRepository.increment).toHaveBeenCalledTimes(1);
    expect(flashcardDeckRepository.increment).toHaveBeenCalledWith(
      { id: 'deck-1' },
      'cardCount',
      2,
    );
    expect(flashcardRepository.save).toHaveBeenCalledTimes(2);
  });

  it('removes a flashcard and decrements the deck counter through one transaction', async () => {
    const { service, flashcardRepository, flashcardDeckRepository } =
      createService();
    flashcardRepository.findOne.mockResolvedValue({
      id: 'card-1',
      userId: 1,
      deckId: 'deck-1',
    });

    await service.deleteFlashcard('card-1', 1);

    expect(flashcardRepository.remove).toHaveBeenCalledTimes(1);
    expect(flashcardDeckRepository.decrement).toHaveBeenCalledWith(
      { id: 'deck-1' },
      'cardCount',
      1,
    );
  });

  it('imports vocabulary into a new deck atomically: deck, cards, and counter together', async () => {
    const {
      service,
      flashcardRepository,
      flashcardDeckRepository,
      lessonRepository,
      vocabularyRepository,
    } = createService();
    lessonRepository.findOne.mockResolvedValue({
      id: 'lesson-1',
      title: 'Lesson 1',
      course: { level: 'beginner' },
    });
    vocabularyRepository.find.mockResolvedValue([
      { id: 'v-1', word: 'one', meaning: 'một' },
      { id: 'v-2', word: 'two', meaning: 'hai' },
    ]);
    flashcardDeckRepository.save.mockResolvedValue({ id: 'deck-new' });

    const result = await service.importFromVocabulary(1, {
      lessonId: 'lesson-1',
    } as never);

    expect(result).toMatchObject({
      imported: 2,
      skipped: 0,
      deckId: 'deck-new',
    });
    expect(flashcardDeckRepository.save).toHaveBeenCalledTimes(1);
    expect(flashcardRepository.save).toHaveBeenCalledTimes(2);
    expect(flashcardDeckRepository.increment).toHaveBeenCalledWith(
      { id: 'deck-new' },
      'cardCount',
      2,
    );
    expect(
      (flashcardRepository.manager.transaction as jest.Mock).mock.calls.length,
    ).toBe(1);
  });

  it('skips imported words that duplicate existing flashcards', async () => {
    const {
      service,
      flashcardRepository,
      vocabularyRepository,
      lessonRepository,
    } = createService();
    lessonRepository.findOne.mockResolvedValue({
      id: 'lesson-1',
      title: 'Lesson 1',
      course: { level: 'beginner' },
    });
    vocabularyRepository.find.mockResolvedValue([
      { id: 'v-1', word: 'one', meaning: 'một' },
      { id: 'v-2', word: 'dup', meaning: 'lặp' },
    ]);
    flashcardRepository.findOne.mockImplementation(async ({ where }: any) =>
      where.front === 'dup' ? { id: 'existing' } : null,
    );

    const result = await service.importFromVocabulary(1, {
      lessonId: 'lesson-1',
      deckId: 'deck-1',
    } as never);

    expect(result).toMatchObject({ imported: 1, skipped: 1 });
  });
});
