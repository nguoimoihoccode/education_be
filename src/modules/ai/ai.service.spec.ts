import { ConfigService } from '@nestjs/config';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { encryptSecret } from './ai-crypto.util';
import { AiService } from './ai.service';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage, AiMessageRole } from './entities/ai-message.entity';
import { AiProviderSettings } from './entities/ai-provider-settings.entity';

const ENC_KEY = Buffer.alloc(32, 7).toString('base64');

describe('AiService', () => {
  let conversationsRepo: jest.Mocked<
    Pick<
      Repository<AiConversation>,
      'find' | 'findOne' | 'create' | 'save' | 'remove' | 'count'
    >
  >;
  let messagesRepo: jest.Mocked<
    Pick<Repository<AiMessage>, 'find' | 'create' | 'save' | 'count'>
  >;
  let settingsRepo: jest.Mocked<
    Pick<Repository<AiProviderSettings>, 'find' | 'create' | 'save'>
  >;
  let configValues: Record<string, unknown>;
  let config: ConfigService;
  let fetchMock: jest.Mock;
  let service: AiService;

  const now = new Date('2026-01-15T12:00:00.000Z');

  function makeConversation(
    overrides: Partial<AiConversation> = {},
  ): AiConversation {
    return {
      id: 'conv-1',
      userId: 1,
      title: 'New Chat',
      lessonId: null,
      messages: [],
      createdAt: now,
      updatedAt: now,
      user: undefined as any,
      ...overrides,
    };
  }

  function makeMessage(overrides: Partial<AiMessage> = {}): AiMessage {
    return {
      id: 'msg-1',
      conversationId: 'conv-1',
      role: AiMessageRole.USER,
      content: 'hello',
      tokenCount: null,
      createdAt: now,
      conversation: undefined as any,
      ...overrides,
    };
  }

  function okFetch(content = 'Tutor reply') {
    return jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content } }],
      }),
    });
  }

  beforeEach(() => {
    configValues = {
      GROQ_API_KEY: 'test-key',
      GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
      AI_MODEL: 'llama-3.3-70b-versatile',
      AI_TUTOR_MAX_TOKENS: 700,
      AI_TUTOR_TEMPERATURE: 0.4,
      AI_SETTINGS_ENCRYPTION_KEY: ENC_KEY,
    };

    config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        return configValues[key] ?? defaultValue;
      }),
    } as unknown as ConfigService;

    conversationsRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as AiConversation),
      save: jest.fn(async (entity) => ({
        id: entity.id ?? 'conv-1',
        createdAt: entity.createdAt ?? now,
        updatedAt: entity.updatedAt ?? now,
        ...entity,
      })),
      remove: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };

    messagesRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => ({ ...data }) as AiMessage),
      save: jest.fn(async (entity) => ({
        id: entity.id ?? `msg-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: entity.createdAt ?? now,
        ...entity,
      })),
      count: jest.fn().mockResolvedValue(0),
    };

    settingsRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => ({ ...data }) as AiProviderSettings),
      save: jest.fn(async (entity) => ({
        id: entity.id ?? 'settings-1',
        createdAt: entity.createdAt ?? now,
        updatedAt: entity.updatedAt ?? now,
        ...entity,
      })),
    };

    fetchMock = okFetch();

    service = new AiService(
      config,
      conversationsRepo as unknown as Repository<AiConversation>,
      messagesRepo as unknown as Repository<AiMessage>,
      settingsRepo as unknown as Repository<AiProviderSettings>,
      fetchMock as any,
    );
  });

  it('env-only chat via sendMessage calls provider with tutor system prompt', async () => {
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([
      makeMessage({ id: 'user-1', content: 'How do I use 你好?' }),
    ]);

    const result = await service.sendMessage(1, 'conv-1', 'How do I use 你好?');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('llama-3.3-70b-versatile');
    expect(body.max_tokens).toBe(700);
    expect(body.temperature).toBe(0.4);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('language tutor');
    expect(
      body.messages.some(
        (m: { content: string }) => m.content === 'How do I use 你好?',
      ),
    ).toBe(true);
    expect(result.assistantMessage.content).toBe('Tutor reply');
    expect(result.userMessage.content).toBe('How do I use 你好?');
  });

  it('throws ServiceUnavailableException when api key is missing', async () => {
    configValues.GROQ_API_KEY = undefined;
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage({ content: 'hello' })]);

    await expect(
      service.sendMessage(1, 'conv-1', 'hello'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException when provider response has no reply', async () => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    });
    service = new AiService(
      config,
      conversationsRepo as unknown as Repository<AiConversation>,
      messagesRepo as unknown as Repository<AiMessage>,
      settingsRepo as unknown as Repository<AiProviderSettings>,
      fetchMock as any,
    );
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage()]);

    await expect(
      service.sendMessage(1, 'conv-1', 'hello'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('DB overrides model and baseUrl when settings row is set', async () => {
    const encrypted = encryptSecret('db-secret-key', ENC_KEY);
    settingsRepo.find.mockResolvedValue([
      {
        id: 's1',
        baseUrl: 'https://custom.example/v1',
        model: 'custom-model',
        maxTokens: 512,
        temperature: 0.2,
        apiKeyEncrypted: encrypted,
        apiKeyLast4: 't-key'.slice(-4),
        createdAt: now,
        updatedAt: now,
      } as AiProviderSettings,
    ]);
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage()]);

    await service.sendMessage(1, 'conv-1', 'hello');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://custom.example/v1/chat/completions',
      expect.any(Object),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe('custom-model');
    expect(body.max_tokens).toBe(512);
    expect(body.temperature).toBe(0.2);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer db-secret-key',
    );
  });

  it('getConversation for wrong user throws NotFoundException', async () => {
    conversationsRepo.findOne.mockResolvedValue(null);

    await expect(service.getConversation(99, 'conv-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(conversationsRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 99 },
      relations: ['messages'],
    });
  });

  it('history window sends only last 20 messages plus system prompt', async () => {
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(25);

    const history = Array.from({ length: 20 }, (_, i) =>
      makeMessage({
        id: `msg-${i}`,
        content: `message-${i}`,
        role: i % 2 === 0 ? AiMessageRole.USER : AiMessageRole.ASSISTANT,
        createdAt: new Date(now.getTime() + i * 1000),
      }),
    );
    messagesRepo.find.mockResolvedValue([...history].reverse());

    await service.sendMessage(1, 'conv-1', 'latest');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages).toHaveLength(21);
    expect(body.messages[1].content).toBe('message-0');
    expect(body.messages[20].content).toBe('message-19');
    expect(messagesRepo.find).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  });

  it('legacy chat creates conversation when no conversationId', async () => {
    conversationsRepo.create.mockImplementation(
      (data) =>
        ({
          id: 'new-conv',
          createdAt: now,
          updatedAt: now,
          ...data,
        }) as AiConversation,
    );
    conversationsRepo.save.mockImplementation(
      async (entity) => entity as AiConversation,
    );
    conversationsRepo.findOne.mockResolvedValue(
      makeConversation({ id: 'new-conv', lessonId: 'lesson-9' }),
    );
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([
      makeMessage({ conversationId: 'new-conv', content: 'Hi tutor' }),
    ]);
    messagesRepo.save
      .mockResolvedValueOnce(
        makeMessage({
          id: 'u1',
          conversationId: 'new-conv',
          role: AiMessageRole.USER,
          content: 'Hi tutor',
        }),
      )
      .mockResolvedValueOnce(
        makeMessage({
          id: 'a1',
          conversationId: 'new-conv',
          role: AiMessageRole.ASSISTANT,
          content: 'Tutor reply',
        }),
      );

    const result = await service.chat(1, {
      message: 'Hi tutor',
      context: { lessonId: 'lesson-9' },
    });

    expect(conversationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        lessonId: 'lesson-9',
      }),
    );
    expect(result).toEqual({
      reply: 'Tutor reply',
      conversationId: 'new-conv',
      userMessageId: 'u1',
      assistantMessageId: 'a1',
    });
  });

  it('getSettings never includes raw apiKey field', async () => {
    const settings = await service.getSettings();

    expect(settings).toEqual(
      expect.objectContaining({
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        maxTokens: 700,
        temperature: 0.4,
        apiKeyConfigured: true,
        apiKeyLast4: 't-key'.slice(-4),
        systemRules: expect.stringContaining('language tutor'),
      }),
    );
    expect(settings.source.systemRules).toBe('default');
    expect(settings).not.toHaveProperty('apiKey');
    expect(JSON.stringify(settings)).not.toContain('test-key');
  });

  it('uses custom system rules from DB in chat system prompt', async () => {
    settingsRepo.find.mockResolvedValue([
      {
        id: 's1',
        systemRules: 'Only answer with one short example sentence.',
      } as AiProviderSettings,
    ]);
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([
      makeMessage({ content: 'How do I greet?' }),
    ]);
    messagesRepo.save
      .mockResolvedValueOnce(makeMessage({ id: 'u1', content: 'How do I greet?' }))
      .mockResolvedValueOnce(
        makeMessage({
          id: 'a1',
          role: AiMessageRole.ASSISTANT,
          content: 'Tutor reply',
        }),
      );

    await service.sendMessage(1, 'conv-1', 'How do I greet?');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain(
      'Only answer with one short example sentence.',
    );
  });

  it('updateSettings can set and clear system rules', async () => {
    settingsRepo.find.mockResolvedValue([]);
    settingsRepo.create.mockImplementation((entity) => entity as AiProviderSettings);
    settingsRepo.save.mockImplementation(async (entity) => ({
      id: 's1',
      ...(entity as AiProviderSettings),
    }));

    await service.updateSettings(1, {
      systemRules: 'Be brief. Stay on language learning only.',
    });
    expect(settingsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        systemRules: 'Be brief. Stay on language learning only.',
        updatedByUserId: 1,
      }),
    );

    settingsRepo.find.mockResolvedValue([
      {
        id: 's1',
        systemRules: 'Be brief. Stay on language learning only.',
      } as AiProviderSettings,
    ]);

    await service.updateSettings(1, { clearSystemRules: true });
    expect(settingsRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ systemRules: null }),
    );
  });

  it('updateSettings without encryption key when setting apiKey throws 503', async () => {
    configValues.AI_SETTINGS_ENCRYPTION_KEY = undefined;

    await expect(
      service.updateSettings(1, { apiKey: 'new-secret-key' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('provider fail after user message saved keeps user message', async () => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    service = new AiService(
      config,
      conversationsRepo as unknown as Repository<AiConversation>,
      messagesRepo as unknown as Repository<AiMessage>,
      settingsRepo as unknown as Repository<AiProviderSettings>,
      fetchMock as any,
    );
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([
      makeMessage({ id: 'saved-user', content: 'persist me' }),
    ]);
    messagesRepo.save.mockResolvedValueOnce(
      makeMessage({
        id: 'saved-user',
        role: AiMessageRole.USER,
        content: 'persist me',
      }),
    );

    await expect(
      service.sendMessage(1, 'conv-1', 'persist me'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(messagesRepo.save).toHaveBeenCalledTimes(1);
    expect(messagesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        role: AiMessageRole.USER,
        content: 'persist me',
      }),
    );
  });

  it('appends lesson context to system prompt when lessonId is set', async () => {
    conversationsRepo.findOne.mockResolvedValue(
      makeConversation({ lessonId: 'L42' }),
    );
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage()]);

    await service.sendMessage(1, 'conv-1', 'help');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].content).toContain('lesson id: L42');
  });

  it('auto-titles conversation from first user message', async () => {
    const conv = makeConversation({ title: 'New Chat' });
    conversationsRepo.findOne.mockResolvedValue(conv);
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([
      makeMessage({
        content:
          'This is a very long first message that should be truncated for the title field',
      }),
    ]);

    await service.sendMessage(
      1,
      'conv-1',
      'This is a very long first message that should be truncated for the title field',
    );

    expect(conversationsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'This is a very long first message that s...',
      }),
    );
  });
});
