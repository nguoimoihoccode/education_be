import { Test } from '@nestjs/testing';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

describe('AiController', () => {
  const req = { user: { sub: 42 } } as any;

  let controller: AiController;
  let aiService: {
    listConversations: jest.Mock;
    createConversation: jest.Mock;
    getConversation: jest.Mock;
    deleteConversation: jest.Mock;
    sendMessage: jest.Mock;
    chat: jest.Mock;
    getSettings: jest.Mock;
    updateSettings: jest.Mock;
    testSettings: jest.Mock;
  };

  beforeEach(async () => {
    aiService = {
      listConversations: jest.fn().mockResolvedValue([{ id: 'c1' }]),
      createConversation: jest.fn().mockResolvedValue({ id: 'c1', title: 'Tones' }),
      getConversation: jest.fn().mockResolvedValue({ id: 'c1', messages: [] }),
      deleteConversation: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue({ reply: 'Hello' }),
      chat: jest.fn().mockResolvedValue({
        reply: 'Tutor reply',
        conversationId: 'c1',
        userMessageId: 'u1',
        assistantMessageId: 'a1',
      }),
      getSettings: jest.fn().mockResolvedValue({ provider: 'openai' }),
      updateSettings: jest.fn().mockResolvedValue({ provider: 'openai' }),
      testSettings: jest.fn().mockResolvedValue({ ok: true }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: aiService }],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AiController);
  });

  it('lists conversations for the current user', async () => {
    const result = await controller.listConversations(req);
    expect(aiService.listConversations).toHaveBeenCalledWith(42);
    expect(result).toEqual([{ id: 'c1' }]);
  });

  it('creates a conversation for the current user', async () => {
    const dto = { title: 'Tones' };
    const result = await controller.createConversation(req, dto as any);
    expect(aiService.createConversation).toHaveBeenCalledWith(42, dto);
    expect(result).toEqual({ id: 'c1', title: 'Tones' });
  });

  it('gets a conversation for the current user', async () => {
    const result = await controller.getConversation(req, 'c1');
    expect(aiService.getConversation).toHaveBeenCalledWith(42, 'c1');
    expect(result).toEqual({ id: 'c1', messages: [] });
  });

  it('deletes a conversation for the current user', async () => {
    await controller.deleteConversation(req, 'c1');
    expect(aiService.deleteConversation).toHaveBeenCalledWith(42, 'c1');
  });

  it('sends a message in a conversation', async () => {
    const result = await controller.sendMessage(req, 'c1', {
      message: 'Hello',
    } as any);
    expect(aiService.sendMessage).toHaveBeenCalledWith(42, 'c1', 'Hello');
    expect(result).toEqual({ reply: 'Hello' });
  });

  it('delegates chat requests to AiService with userId', async () => {
    const result = await controller.chat(req, { message: 'Explain tones' });
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

  it('gets AI settings (admin)', async () => {
    const result = await controller.getSettings();
    expect(aiService.getSettings).toHaveBeenCalled();
    expect(result).toEqual({ provider: 'openai' });
  });

  it('updates AI settings (admin)', async () => {
    const dto = { provider: 'openai' };
    const result = await controller.updateSettings(req, dto as any);
    expect(aiService.updateSettings).toHaveBeenCalledWith(42, dto);
    expect(result).toEqual({ provider: 'openai' });
  });

  it('tests AI settings (admin)', async () => {
    const result = await controller.testSettings();
    expect(aiService.testSettings).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});
