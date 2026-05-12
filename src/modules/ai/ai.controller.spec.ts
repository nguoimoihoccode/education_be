import { Test } from '@nestjs/testing';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

describe('AiController', () => {
  it('delegates chat requests to AiService', async () => {
    const aiService = {
      chat: jest.fn().mockResolvedValue({ reply: 'Tutor reply' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: aiService }],
    }).compile();

    const controller = moduleRef.get(AiController);
    const result = await controller.chat({ message: 'Explain tones' });

    expect(aiService.chat).toHaveBeenCalledWith({ message: 'Explain tones' });
    expect(result).toEqual({ reply: 'Tutor reply' });
  });
});
