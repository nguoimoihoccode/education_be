import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { AiService } from './ai.service';

describe('AiService', () => {
  const config = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        GROQ_API_KEY: 'test-key',
        GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
        AI_MODEL: 'llama-3.3-70b-versatile',
        AI_TUTOR_MAX_TOKENS: 700,
        AI_TUTOR_TEMPERATURE: 0.4,
      };
      return values[key] ?? defaultValue;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls Groq chat completions with a language tutor prompt', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Use 你好 to say hello politely.' } }],
      }),
    });
    const service = new AiService(config, fetchMock as any);

    const result = await service.chat({ message: 'How do I use 你好?' });

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
    expect(body.messages[1]).toEqual({ role: 'user', content: 'How do I use 你好?' });
    expect(result).toEqual({ reply: 'Use 你好 to say hello politely.' });
  });

  it('throws a clear error when Groq API key is missing', async () => {
    const missingKeyConfig = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'GROQ_API_KEY') return undefined;
        return defaultValue;
      }),
    } as unknown as ConfigService;
    const service = new AiService(missingKeyConfig, jest.fn() as any);

    await expect(service.chat({ message: 'hello' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('throws a clear error when provider response has no reply', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    });
    const service = new AiService(config, fetchMock as any);

    await expect(service.chat({ message: 'hello' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
