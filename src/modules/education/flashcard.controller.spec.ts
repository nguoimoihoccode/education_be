import { FlashcardController } from './flashcard.controller';
import { UnauthorizedException } from '@nestjs/common';

describe('FlashcardController', () => {
  const createController = () => {
    const flashcardService = {
      completeReviewSession: jest.fn().mockResolvedValue({ id: 'session-1' }),
      reviewFlashcard: jest.fn().mockResolvedValue({ success: true }),
      searchFlashcards: jest.fn().mockResolvedValue({ flashcards: [] }),
    };
    const educationService = {
      markTodayPlanTasksCompleteByType: jest.fn().mockResolvedValue(undefined),
    };

    return {
      controller: new FlashcardController(
        flashcardService as any,
        educationService as any,
      ),
      educationService,
      flashcardService,
    };
  };

  it('accepts frontend query parameter for flashcard search', async () => {
    const { controller, flashcardService } = createController();

    await controller.searchFlashcards(
      { user: { sub: 7 } } as any,
      undefined,
      'hello',
      { page: 1, limit: 10 } as any,
    );

    expect(flashcardService.searchFlashcards).toHaveBeenCalledWith(
      7,
      'hello',
      1,
      10,
    );
  });

  it('awaits today plan completion marking after review session completion', async () => {
    const { controller, educationService } = createController();
    const calls: string[] = [];
    educationService.markTodayPlanTasksCompleteByType.mockImplementation(
      async () => {
        calls.push('marked');
      },
    );

    await controller.completeReviewSession({ user: { sub: 7 } } as any, {
      sessionId: 'session-1',
    });

    expect(calls).toEqual(['marked']);
    expect(
      educationService.markTodayPlanTasksCompleteByType,
    ).toHaveBeenCalledWith('7', ['review_flashcards', 'review_vocabulary']);
  });

  it('rejects protected flashcard actions without an authenticated user', async () => {
    const { controller, flashcardService } = createController();

    await expect(
      controller.searchFlashcards({} as any, 'hello'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(flashcardService.searchFlashcards).not.toHaveBeenCalled();
  });
});
