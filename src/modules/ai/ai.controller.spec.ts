import { Test } from '@nestjs/testing';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

describe('AiController', () => {
  it('delegates chat requests to AiService with userId', async () => {
    const aiService = {
      chat: jest.fn().mockResolvedValue({
        reply: 'Tutor reply',
        conversationId: 'c1',
        userMessageId: 'u1',
        assistantMessageId: 'a1',
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: aiService }],
    }).compile();

    const controller = moduleRef.get(AiController);
    const result = await controller.chat(
      { user: { sub: 42 } } as any,
      { message: 'Explain tones' },
    );

    expect(aiService.chat).toHaveBeenCalledWith(42, {
      message: 'Explain tones',
    });
    expect(result).toEqual({
      reply: 'Tutor reply',
      conversationId: 'c1',
      userMessageId: 'u1',
      assistantMessageId: 'a1',
    });
  });
});
