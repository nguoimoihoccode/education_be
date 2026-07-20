import { AiVocabEnricherService } from './ai-vocab-enricher.service';

describe('AiVocabEnricherService', () => {
  const aiService = {
    completeJson: jest.fn(),
  };

  let service: AiVocabEnricherService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiVocabEnricherService(aiService as any);
  });

  it('maps AI cards on success and filters empty front/back', async () => {
    aiService.completeJson.mockResolvedValue({
      cards: [
        {
          front: '你好',
          back: 'hello',
          pronunciation: 'nǐ hǎo',
          example: '你好吗？',
          exampleTranslation: 'How are you?',
          difficulty: 1,
        },
        { front: '', back: 'skip' },
        { front: 'skip', back: '' },
        { front: '学习', back: 'to study' },
      ],
    });

    const result = await service.enrichVocabulary({
      rawText: '你好 means hello. 学习 means to study.',
      seedTerms: ['你好', '学习'],
      language: 'zh',
      maxCards: 10,
    });

    expect(result).toEqual([
      {
        front: '你好',
        back: 'hello',
        pronunciation: 'nǐ hǎo',
        example: '你好吗？',
        exampleTranslation: 'How are you?',
        difficulty: 1,
        source: 'ai',
      },
      {
        front: '学习',
        back: 'to study',
        source: 'ai',
      },
    ]);
    expect(aiService.completeJson).toHaveBeenCalledTimes(1);
  });

  it('returns null when AI fails', async () => {
    aiService.completeJson.mockRejectedValue(new Error('unavailable'));

    const result = await service.enrichVocabulary({
      rawText: 'some text',
      seedTerms: ['word'],
      maxCards: 5,
    });

    expect(result).toBeNull();
  });

  it('caps maxCards between 1 and 40 and slices rawText', async () => {
    aiService.completeJson.mockResolvedValue({ cards: [] });
    const longText = 'a'.repeat(7000);

    await service.enrichVocabulary({
      rawText: longText,
      seedTerms: [],
      maxCards: 100,
    });

    const call = aiService.completeJson.mock.calls[0][0];
    expect(call.user).toContain('a'.repeat(6000));
    expect(call.user).not.toContain('a'.repeat(6001));
    expect(call.user).toContain('Max cards: 40');
  });
});
