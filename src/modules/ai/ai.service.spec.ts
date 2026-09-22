import { ConfigService } from '@nestjs/config';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { encryptSecret } from './ai-crypto.util';
import { AiService, GROUNDING_INSTRUCTION } from './ai.service';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage, AiMessageRole } from './entities/ai-message.entity';
import { AiProviderSettings } from './entities/ai-provider-settings.entity';
import { KnowledgeContextService } from './knowledge-context.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { EmbeddingService } from './embedding.service';

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
  let knowledgeContext: { buildLessonContext: jest.Mock };
  let knowledgeRetrieval: { search: jest.Mock };
  let embedding: {
    getConfigView: jest.Mock;
    applySettings: jest.Mock;
    embed: jest.Mock;
  };
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

    // Ungrounded by default, so the prompt assertions below stay about the
    // provider call; the grounding path has its own tests.
    knowledgeContext = {
      buildLessonContext: jest.fn().mockResolvedValue(null),
    };
    // Retrieval is off by default for the same reason: the prompt assertions
    // below should not depend on what the index happens to contain.
    knowledgeRetrieval = {
      search: jest.fn().mockResolvedValue([]),
    };
    embedding = {
      getConfigView: jest.fn().mockResolvedValue({
        baseUrl: 'https://api.openai.com/v1',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        apiKeyConfigured: false,
        apiKeyLast4: null,
        source: {
          baseUrl: 'default',
          apiKey: 'default',
          model: 'default',
          dimensions: 'default',
        },
        updatedAt: null,
      }),
      applySettings: jest.fn().mockResolvedValue(undefined),
      embed: jest.fn().mockResolvedValue([[0.1, 0.2]]),
    };

    service = new AiService(
      config,
      conversationsRepo as unknown as Repository<AiConversation>,
      messagesRepo as unknown as Repository<AiMessage>,
      settingsRepo as unknown as Repository<AiProviderSettings>,
      knowledgeContext as unknown as KnowledgeContextService,
      knowledgeRetrieval as unknown as KnowledgeRetrievalService,
      embedding as unknown as EmbeddingService,
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
      knowledgeContext as unknown as KnowledgeContextService,
      knowledgeRetrieval as unknown as KnowledgeRetrievalService,
      embedding as unknown as EmbeddingService,
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
      references: [],
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

  // The two providers are separate configurations, so the settings view reports
  // them separately instead of merging them into one misleading block.
  it('getSettings reports the embedding provider alongside the chat one', async () => {
    const settings = await service.getSettings();

    expect(settings.embedding).toEqual(
      expect.objectContaining({ model: 'text-embedding-3-small' }),
    );
    expect(embedding.getConfigView).toHaveBeenCalled();
  });

  it('updateSettings passes the embedding block through to the embedding service', async () => {
    await service.updateSettings(4, {
      embedding: { model: 'my-embed', dimensions: 768 },
    });

    expect(embedding.applySettings).toHaveBeenCalledWith(4, {
      model: 'my-embed',
      dimensions: 768,
    });
  });

  // An embedding provider that is absent or broken must be visible in the test
  // result, not thrown: it is configured separately, and it must not block an
  // admin from testing the chat provider.
  it('testSettings reports a failing embedding provider without throwing', async () => {
    embedding.embed.mockRejectedValue(
      new Error('Embedding provider is not configured'),
    );

    const result = await service.testSettings();

    expect(result.ok).toBe(true);
    expect(result.embedding).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'Embedding provider is not configured',
      }),
    );
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
      .mockResolvedValueOnce(
        makeMessage({ id: 'u1', content: 'How do I greet?' }),
      )
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
    settingsRepo.create.mockImplementation(
      (entity) => entity as AiProviderSettings,
    );
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
      knowledgeContext as unknown as KnowledgeContextService,
      knowledgeRetrieval as unknown as KnowledgeRetrievalService,
      embedding as unknown as EmbeddingService,
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

  it('grounds the system prompt in the lesson the conversation is attached to', async () => {
    const lessonId = 'f2f4a1c8-0f5e-4a1f-9a11-2c3d4e5f6a7b';
    knowledgeContext.buildLessonContext.mockResolvedValue(
      '=== NGUON ===\nBài: Thì hiện tại đơn\nDiễn tả thói quen hằng ngày.\n=== HET ===',
    );
    conversationsRepo.findOne.mockResolvedValue(makeConversation({ lessonId }));
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage()]);

    await service.sendMessage(1, 'conv-1', 'help');

    expect(knowledgeContext.buildLessonContext).toHaveBeenCalledWith(lessonId);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].content).toContain('Diễn tả thói quen hằng ngày.');
    expect(body.messages[0].content).toContain(GROUNDING_INSTRUCTION);
    // The old prompt interpolated the raw uuid, which told the model nothing.
    expect(body.messages[0].content).not.toContain('lesson id:');
  });

  it('sends only the base rules when there is no lesson to ground on', async () => {
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage()]);

    await service.sendMessage(1, 'conv-1', 'help');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].content).not.toContain(GROUNDING_INSTRUCTION);
  });

  // The retrieval tier has nothing to search with if it is not handed the
  // learner's message, so the question is what must reach it.
  it('searches the corpus with the message the learner just sent', async () => {
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage()]);

    await service.sendMessage(1, 'conv-1', 'phân biệt hai thì này');

    expect(knowledgeRetrieval.search).toHaveBeenCalledWith(
      'phân biệt hai thì này',
      { excludeLessonId: null },
    );
  });

  it('adds retrieved chunks to the system prompt as a source block', async () => {
    knowledgeRetrieval.search.mockResolvedValue([
      {
        id: 'chunk-1',
        sourceType: 'lesson',
        lessonId: 'aaaaaaaa-1111-4111-8111-111111111111',
        courseId: null,
        title: 'Thì hiện tại đơn',
        content: 'Diễn tả thói quen hằng ngày.',
        distance: 0.2,
      },
    ]);
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage()]);

    await service.sendMessage(1, 'conv-1', 'thì hiện tại đơn là gì');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].content).toContain('[Thì hiện tại đơn]');
    expect(body.messages[0].content).toContain('Diễn tả thói quen hằng ngày.');
    // Retrieved material is still grounding, so the same instruction governs it.
    expect(body.messages[0].content).toContain(GROUNDING_INSTRUCTION);
  });

  // The same hit is handed back as a structured reference so the FE can render a
  // source chip under the reply without parsing the prompt's text block.
  it('returns the retrieval hits as references on the sendMessage response', async () => {
    knowledgeRetrieval.search.mockResolvedValue([
      {
        id: 'chunk-1',
        sourceType: 'lesson',
        lessonId: 'aaaaaaaa-1111-4111-8111-111111111111',
        courseId: null,
        title: 'Thì hiện tại đơn',
        content: 'Diễn tả thói quen hằng ngày.',
        distance: 0.2,
      },
    ]);
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage()]);

    const result = await service.sendMessage(1, 'conv-1', 'thì hiện tại đơn là gì');

    expect(result.references).toEqual([
      {
        lessonId: 'aaaaaaaa-1111-4111-8111-111111111111',
        title: 'Thì hiện tại đơn',
        sourceType: 'lesson',
        distance: 0.2,
      },
    ]);
  });

  // The lesson tier already puts that lesson in the prompt in full, so pieces of
  // it retrieved again would spend the reference budget on what the model read.
  it('excludes the study lesson from its own retrieval', async () => {
    const lessonId = 'f2f4a1c8-0f5e-4a1f-9a11-2c3d4e5f6a7b';
    conversationsRepo.findOne.mockResolvedValue(makeConversation({ lessonId }));
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage()]);

    await service.sendMessage(1, 'conv-1', 'giải thích bài này');

    expect(knowledgeRetrieval.search).toHaveBeenCalledWith(
      'giải thích bài này',
      { excludeLessonId: lessonId },
    );
  });

  // Retrieval is an enhancement, so a provider that is down must cost the answer
  // its references, not the whole reply.
  it('still answers when retrieval finds nothing', async () => {
    knowledgeRetrieval.search.mockResolvedValue([]);
    conversationsRepo.findOne.mockResolvedValue(makeConversation());
    messagesRepo.count.mockResolvedValue(0);
    messagesRepo.find.mockResolvedValue([makeMessage()]);

    const result = await service.sendMessage(1, 'conv-1', 'xin chào');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0].content).not.toContain('TRÍCH ĐOẠN');
    expect(result.assistantMessage.content).toBe('Tutor reply');
    expect(result.references).toEqual([]);
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

  it('completeText returns provider reply without persisting conversations', async () => {
    fetchMock = okFetch('hello from model');
    service = new AiService(
      config,
      conversationsRepo as unknown as Repository<AiConversation>,
      messagesRepo as unknown as Repository<AiMessage>,
      settingsRepo as unknown as Repository<AiProviderSettings>,
      knowledgeContext as unknown as KnowledgeContextService,
      knowledgeRetrieval as unknown as KnowledgeRetrievalService,
      embedding as unknown as EmbeddingService,
      fetchMock as any,
    );

    const reply = await service.completeText({
      system: 'You are a helper.',
      user: 'Say hello',
    });

    expect(reply).toBe('hello from model');
    expect(conversationsRepo.save).not.toHaveBeenCalled();
    expect(messagesRepo.save).not.toHaveBeenCalled();
  });

  it('completeJson parses JSON object from model output', async () => {
    fetchMock = okFetch('```json\n{"items":[{"front":"a","back":"b"}]}\n```');
    service = new AiService(
      config,
      conversationsRepo as unknown as Repository<AiConversation>,
      messagesRepo as unknown as Repository<AiMessage>,
      settingsRepo as unknown as Repository<AiProviderSettings>,
      knowledgeContext as unknown as KnowledgeContextService,
      knowledgeRetrieval as unknown as KnowledgeRetrievalService,
      embedding as unknown as EmbeddingService,
      fetchMock as any,
    );

    const data = await service.completeJson<{
      items: { front: string; back: string }[];
    }>({
      system: 'Return JSON only.',
      user: 'Generate',
    });

    expect(data.items[0]).toEqual({ front: 'a', back: 'b' });
  });

  it('completeText throws ServiceUnavailableException when key missing', async () => {
    configValues.GROQ_API_KEY = undefined;

    await expect(
      service.completeText({ system: 's', user: 'u' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
