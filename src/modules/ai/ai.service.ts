import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { decryptSecret, encryptSecret } from './ai-crypto.util';
import { AiChatDto } from './dto/ai-chat.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage, AiMessageRole } from './entities/ai-message.entity';
import { AiProviderSettings } from './entities/ai-provider-settings.entity';

type FetchLike = typeof fetch;

export const AI_FETCH_CLIENT = 'AI_FETCH_CLIENT';

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

type ConfigSource = 'db' | 'env' | 'default';

interface ProviderConfig {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  source: {
    baseUrl: ConfigSource;
    apiKey: ConfigSource;
    model: ConfigSource;
    maxTokens: ConfigSource;
    temperature: ConfigSource;
  };
}

/** Built-in default when admin has not set custom system rules. */
export const DEFAULT_AI_SYSTEM_RULES = [
  'You are a practical language tutor for EduPro.',
  'Answer clearly, keep responses concise, include examples, and offer a short practice prompt when useful.',
  'Stay on language-learning topics (grammar, vocabulary, writing, speaking, study plans).',
  'If the user asks about unrelated topics, briefly refuse and steer them back to learning.',
  'Do not invent grammar rules or facts. If unsure, say so and suggest a safer alternative.',
  'Do not complete graded quizzes or exams for the learner; guide them to reason instead.',
  'Match the learner language when possible; keep tone supportive and professional.',
].join(' ');

@Injectable()
export class AiService {
  private static readonly HISTORY_WINDOW = 20;
  private static readonly DEFAULT_TITLE = 'New Chat';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiConversation)
    private readonly conversationsRepo: Repository<AiConversation>,
    @InjectRepository(AiMessage)
    private readonly messagesRepo: Repository<AiMessage>,
    @InjectRepository(AiProviderSettings)
    private readonly settingsRepo: Repository<AiProviderSettings>,
    @Optional()
    @Inject(AI_FETCH_CLIENT)
    private readonly fetchClient: FetchLike = fetch,
  ) {}

  private isUnset(value: unknown): boolean {
    return value === null || value === undefined || value === '';
  }

  private async resolveProviderConfig(): Promise<ProviderConfig> {
    const rows = await this.settingsRepo.find({ take: 1 });
    const row = rows[0];

    const encKey = this.configService.get<string>('AI_SETTINGS_ENCRYPTION_KEY');
    const envApiKey = this.configService.get<string>('GROQ_API_KEY');
    const envBaseUrl = this.configService.get<string>('GROQ_BASE_URL');
    const envModel = this.configService.get<string>('AI_MODEL');
    const envMaxTokens = this.configService.get<number>('AI_TUTOR_MAX_TOKENS');
    const envTemperature = this.configService.get<number>(
      'AI_TUTOR_TEMPERATURE',
    );

    let apiKey: string | undefined;
    let apiKeySource: ConfigSource = 'default';
    if (row && !this.isUnset(row.apiKeyEncrypted) && encKey) {
      try {
        apiKey = decryptSecret(row.apiKeyEncrypted!, encKey);
        apiKeySource = 'db';
      } catch {
        apiKey = undefined;
        apiKeySource = 'default';
      }
    }
    if (!apiKey) {
      if (!this.isUnset(envApiKey)) {
        apiKey = envApiKey;
        apiKeySource = 'env';
      } else {
        apiKey = undefined;
        apiKeySource = 'default';
      }
    }

    let baseUrl: string;
    let baseUrlSource: ConfigSource;
    if (row && !this.isUnset(row.baseUrl)) {
      baseUrl = row.baseUrl!;
      baseUrlSource = 'db';
    } else if (!this.isUnset(envBaseUrl)) {
      baseUrl = envBaseUrl!;
      baseUrlSource = 'env';
    } else {
      baseUrl = 'https://api.groq.com/openai/v1';
      baseUrlSource = 'default';
    }

    let model: string;
    let modelSource: ConfigSource;
    if (row && !this.isUnset(row.model)) {
      model = row.model!;
      modelSource = 'db';
    } else if (!this.isUnset(envModel)) {
      model = envModel!;
      modelSource = 'env';
    } else {
      model = 'llama-3.3-70b-versatile';
      modelSource = 'default';
    }

    let maxTokens: number;
    let maxTokensSource: ConfigSource;
    if (row && row.maxTokens !== null && row.maxTokens !== undefined) {
      maxTokens = row.maxTokens;
      maxTokensSource = 'db';
    } else if (envMaxTokens !== null && envMaxTokens !== undefined) {
      maxTokens = Number(envMaxTokens);
      maxTokensSource = 'env';
    } else {
      maxTokens = 700;
      maxTokensSource = 'default';
    }

    let temperature: number;
    let temperatureSource: ConfigSource;
    if (row && row.temperature !== null && row.temperature !== undefined) {
      temperature = row.temperature;
      temperatureSource = 'db';
    } else if (envTemperature !== null && envTemperature !== undefined) {
      temperature = Number(envTemperature);
      temperatureSource = 'env';
    } else {
      temperature = 0.4;
      temperatureSource = 'default';
    }

    return {
      apiKey,
      baseUrl,
      model,
      maxTokens,
      temperature,
      source: {
        baseUrl: baseUrlSource,
        apiKey: apiKeySource,
        model: modelSource,
        maxTokens: maxTokensSource,
        temperature: temperatureSource,
      },
    };
  }

  private autoTitle(message: string): string {
    const collapsed = message.trim().replace(/\s+/g, ' ');
    if (collapsed.length <= 40) {
      return collapsed || AiService.DEFAULT_TITLE;
    }
    return `${collapsed.slice(0, 40)}...`;
  }

  private async resolveSystemRules(): Promise<{
    rules: string;
    source: ConfigSource;
  }> {
    const rows = await this.settingsRepo.find({ take: 1 });
    const row = rows[0];
    if (row && !this.isUnset(row.systemRules)) {
      return { rules: String(row.systemRules).trim(), source: 'db' };
    }
    const envRules = this.configService.get<string>('AI_SYSTEM_RULES');
    if (!this.isUnset(envRules)) {
      return { rules: String(envRules).trim(), source: 'env' };
    }
    return { rules: DEFAULT_AI_SYSTEM_RULES, source: 'default' };
  }

  private async buildSystemPrompt(lessonId?: string | null): Promise<string> {
    const { rules } = await this.resolveSystemRules();
    if (!lessonId) {
      return rules;
    }
    return `${rules}\nThe learner is studying lesson id: ${lessonId}. Prefer explanations relevant to that lesson when possible.`;
  }

  private toMessageSummary(message: AiMessage) {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    };
  }

  async listConversations(userId: number) {
    const conversations = await this.conversationsRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });

    return Promise.all(
      conversations.map(async (c) => {
        const messageCount = await this.messagesRepo.count({
          where: { conversationId: c.id },
        });
        return {
          id: c.id,
          title: c.title,
          lessonId: c.lessonId ?? null,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          messageCount,
        };
      }),
    );
  }

  async createConversation(userId: number, dto: CreateConversationDto = {}) {
    const conversation = this.conversationsRepo.create({
      userId,
      title: dto.title?.trim() || AiService.DEFAULT_TITLE,
      lessonId: dto.lessonId ?? null,
    });
    const saved = await this.conversationsRepo.save(conversation);
    return {
      id: saved.id,
      title: saved.title,
      lessonId: saved.lessonId ?? null,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      messageCount: 0,
    };
  }

  async getConversation(userId: number, id: string) {
    const conversation = await this.conversationsRepo.findOne({
      where: { id, userId },
      relations: ['messages'],
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const messages = [...(conversation.messages ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    return {
      id: conversation.id,
      title: conversation.title,
      lessonId: conversation.lessonId ?? null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: messages.map((m) => this.toMessageSummary(m)),
    };
  }

  async deleteConversation(userId: number, id: string): Promise<void> {
    const conversation = await this.conversationsRepo.findOne({
      where: { id, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    await this.conversationsRepo.remove(conversation);
  }

  async sendMessage(userId: number, conversationId: string, message: string) {
    const conversation = await this.conversationsRepo.findOne({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const priorCount = await this.messagesRepo.count({
      where: { conversationId },
    });

    const userMessage = await this.messagesRepo.save(
      this.messagesRepo.create({
        conversationId,
        role: AiMessageRole.USER,
        content: message,
      }),
    );

    const titleIsDefault =
      !conversation.title || conversation.title === AiService.DEFAULT_TITLE;
    if (titleIsDefault && priorCount === 0) {
      conversation.title = this.autoTitle(message);
      await this.conversationsRepo.save(conversation);
    }

    const recentDesc = await this.messagesRepo.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: AiService.HISTORY_WINDOW,
    });
    const history = recentDesc.reverse();

    const chatMessages = [
      {
        role: 'system',
        content: await this.buildSystemPrompt(conversation.lessonId),
      },
      ...history.map((m) => ({
        role: m.role as string,
        content: m.content,
      })),
    ];

    let reply: string;
    try {
      reply = await this.completeChat(chatMessages);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      throw new ServiceUnavailableException('AI tutor service unavailable');
    }

    const assistantMessage = await this.messagesRepo.save(
      this.messagesRepo.create({
        conversationId,
        role: AiMessageRole.ASSISTANT,
        content: reply,
      }),
    );

    conversation.updatedAt = new Date();
    await this.conversationsRepo.save(conversation);

    return {
      userMessage: this.toMessageSummary(userMessage),
      assistantMessage: this.toMessageSummary(assistantMessage),
      conversation: {
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      },
    };
  }

  async chat(
    userId: number,
    dto: AiChatDto,
  ): Promise<{
    reply: string;
    conversationId: string;
    userMessageId: string;
    assistantMessageId: string;
  }> {
    let conversationId = dto.conversationId;
    if (conversationId) {
      const owned = await this.conversationsRepo.findOne({
        where: { id: conversationId, userId },
      });
      if (!owned) {
        throw new NotFoundException('Conversation not found');
      }
    } else {
      const created = await this.createConversation(userId, {
        lessonId: dto.context?.lessonId,
      });
      conversationId = created.id;
    }

    const result = await this.sendMessage(userId, conversationId, dto.message);
    return {
      reply: result.assistantMessage.content,
      conversationId,
      userMessageId: result.userMessage.id,
      assistantMessageId: result.assistantMessage.id,
    };
  }

  async getSettings() {
    const effective = await this.resolveProviderConfig();
    const systemRulesResolved = await this.resolveSystemRules();
    const rows = await this.settingsRepo.find({ take: 1 });
    const row = rows[0];
    const envKey = this.configService.get<string>('GROQ_API_KEY');

    let apiKeyLast4: string | null = null;
    if (row?.apiKeyLast4) {
      apiKeyLast4 = row.apiKeyLast4;
    } else if (envKey) {
      apiKeyLast4 = envKey.slice(-4);
    }

    return {
      baseUrl: effective.baseUrl,
      model: effective.model,
      maxTokens: effective.maxTokens,
      temperature: effective.temperature,
      systemRules: systemRulesResolved.rules,
      apiKeyConfigured: Boolean(effective.apiKey),
      apiKeyLast4,
      source: {
        ...effective.source,
        systemRules: systemRulesResolved.source,
      },
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async updateSettings(userId: number, dto: UpdateAiSettingsDto) {
    const rows = await this.settingsRepo.find({ take: 1 });
    let row = rows[0];
    if (!row) {
      row = this.settingsRepo.create({});
    }

    if (dto.clearApiKey) {
      row.apiKeyEncrypted = null;
      row.apiKeyLast4 = null;
    }
    if (dto.clearBaseUrl) {
      row.baseUrl = null;
    }
    if (dto.clearModel) {
      row.model = null;
    }
    if (dto.clearMaxTokens) {
      row.maxTokens = null;
    }
    if (dto.clearTemperature) {
      row.temperature = null;
    }
    if (dto.clearSystemRules) {
      row.systemRules = null;
    }

    if (dto.baseUrl !== undefined) {
      row.baseUrl = dto.baseUrl;
    }
    if (dto.model !== undefined) {
      row.model = dto.model;
    }
    if (dto.maxTokens !== undefined) {
      row.maxTokens = dto.maxTokens;
    }
    if (dto.temperature !== undefined) {
      row.temperature = dto.temperature;
    }
    if (dto.systemRules !== undefined) {
      const trimmed = dto.systemRules.trim();
      row.systemRules = trimmed.length > 0 ? trimmed : null;
    }

    if (dto.apiKey !== undefined) {
      const encKey = this.configService.get<string>(
        'AI_SETTINGS_ENCRYPTION_KEY',
      );
      if (!encKey) {
        throw new ServiceUnavailableException(
          'AI settings encryption is not configured',
        );
      }
      row.apiKeyEncrypted = encryptSecret(dto.apiKey, encKey);
      row.apiKeyLast4 = dto.apiKey.slice(-4);
    }

    row.updatedByUserId = userId;
    await this.settingsRepo.save(row);
    return this.getSettings();
  }

  async testSettings(): Promise<{ ok: true; latencyMs: number }> {
    const config = await this.resolveProviderConfig();
    if (!config.apiKey) {
      throw new ServiceUnavailableException('AI tutor is not configured');
    }

    const started = Date.now();
    try {
      await this.completeChat([
        { role: 'system', content: 'Reply with pong only.' },
        { role: 'user', content: 'ping' },
      ]);
    } catch {
      throw new ServiceUnavailableException('AI tutor service unavailable');
    }

    return { ok: true, latencyMs: Date.now() - started };
  }

  async completeText(input: {
    system: string;
    user: string;
  }): Promise<string> {
    return this.completeChat([
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ]);
  }

  async completeJson<T>(input: {
    system: string;
    user: string;
  }): Promise<T> {
    const raw = await this.completeText({
      system: `${input.system}\nRespond with a single JSON object only. No markdown.`,
      user: input.user,
    });
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new ServiceUnavailableException('AI tutor returned invalid JSON');
    }
  }

  private async completeChat(
    messages: { role: string; content: string }[],
  ): Promise<string> {
    const config = await this.resolveProviderConfig();
    if (!config.apiKey) {
      throw new ServiceUnavailableException('AI tutor is not configured');
    }

    try {
      const response = await this.fetchClient(
        `${config.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Groq request failed with status ${response.status}`);
      }

      const data = (await response.json()) as GroqChatResponse;
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        throw new Error('Groq returned an empty tutor response');
      }

      return reply;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      throw new ServiceUnavailableException('AI tutor service unavailable');
    }
  }
}
