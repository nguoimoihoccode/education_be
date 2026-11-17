import { BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service';

describe('AiService usage accounting', () => {
  const env: Record<string, unknown> = {
    GROQ_API_KEY: 'test-key',
    AI_INPUT_PRICE_USD_PER_MILLION: 0.59,
    AI_OUTPUT_PRICE_USD_PER_MILLION: 0.79,
  };
  const config = { get: (k: string) => env[k] } as any;
  let settings: any[];
  let settingsFind: jest.Mock;
  let inserted: any[];
  let usageRepo: any;
  let fetchMock: jest.Mock;
  let messagesSaved: any[];

  const build = () =>
    new AiService(
      config,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'c', userId: 5, title: 't' }),
        save: jest.fn(async (e) => e),
      } as any,
      {
        count: jest.fn().mockResolvedValue(1),
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((d) => d),
        save: jest.fn(async (e) => {
          messagesSaved.push(e);
          return { id: 'm', createdAt: new Date(), ...e };
        }),
      } as any,
      { find: settingsFind } as any,
      { buildLessonContext: jest.fn().mockResolvedValue(null) } as any,
      { search: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      fetchMock as any,
      usageRepo,
    );

  beforeEach(() => {
    settings = [];
    settingsFind = jest.fn(async () => settings);
    inserted = [];
    messagesSaved = [];
    usageRepo = {
      insert: jest.fn(async (row) => inserted.push(row)),
      query: jest.fn(),
    };
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"a":1}' } }],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          total_tokens: 1500,
        },
      }),
    });
  });

  it('logs tokens and micro-USD per call with its feature and user', async () => {
    await expect(
      build().completeJson(
        { system: 's', user: 'u' },
        { feature: 'coach_summary', userId: 5 },
      ),
    ).resolves.toEqual({ a: 1 });
    expect(inserted).toEqual([
      expect.objectContaining({
        userId: 5,
        feature: 'coach_summary',
        model: 'llama-3.3-70b-versatile',
        providerHost: 'api.groq.com',
        status: 'ok',
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        costMicros: 985,
      }),
    ]);
    // Provider config and pricing share one settings lookup per completion.
    expect(settingsFind).toHaveBeenCalledTimes(1);
  });

  it('prefers admin DB pricing and leaves cost unknown without a price', async () => {
    settings = [{ inputPriceUsdPerMillion: 1, outputPriceUsdPerMillion: 2 }];
    await build().completeText({ system: 's', user: 'u' });
    expect(inserted[0]).toMatchObject({ feature: 'other', costMicros: 2000 });
    settings = [];
    env.AI_OUTPUT_PRICE_USD_PER_MILLION = undefined;
    try {
      await build().completeText({ system: 's', user: 'u' });
      expect(inserted[1]).toMatchObject({
        promptTokens: 1000,
        costMicros: null,
      });
    } finally {
      env.AI_OUTPUT_PRICE_USD_PER_MILLION = 0.79;
    }
  });

  it('records a failed request with unknown usage and never fails on a logging error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(
      build().completeText({ system: 's', user: 'u' }),
    ).rejects.toThrow();
    expect(inserted[0]).toMatchObject({
      status: 'error',
      promptTokens: null,
      costMicros: null,
    });
    usageRepo.insert.mockRejectedValueOnce(new Error('db down'));
    await expect(
      build().completeText({ system: 's', user: 'u' }),
    ).resolves.toBe('{"a":1}');
  });

  it('stores the completion token count on the tutor reply', async () => {
    await build().sendMessage(5, 'c', 'xin chào');
    expect(messagesSaved.at(-1)).toMatchObject({ tokenCount: 500 });
    expect(inserted[0]).toMatchObject({ feature: 'tutor_chat', userId: 5 });
  });

  it('rejects a malformed or too-long report range', async () => {
    await expect(
      build().getUsage('2026-01-01', '2027-06-01'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(build().getUsage('x', '2026-01-01')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      build().getUsage('2026-02-01', '2026-02-31'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
