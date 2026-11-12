import { AssessmentModels, parseProviderResponse } from './provider';
import {
  inferenceConfig,
  readBoundedResponse,
  runInference,
} from './inference';
import type { Profile } from './routing';
const profile = {
  provider: 'google',
  model: 'gemini-2.5-flash',
  apiDialect: 'google_generate_content',
  reasoningPolicy: 'disabled',
  maxOutputTokens: 4096,
} as Profile;
describe('assessment model adapter', () => {
  it('rejects truncated or refused model output rather than scoring it', () => {
    expect(() =>
      parseProviderResponse(profile, {
        candidates: [
          { finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } },
        ],
      }),
    ).toThrow('provider_output_incomplete');
  });
  it('rejects malformed JSON and preserves reported token usage', () => {
    expect(() =>
      parseProviderResponse(profile, {
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } },
        ],
      }),
    ).toThrow('provider_json_invalid');
    expect(
      parseProviderResponse(profile, {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: '{"ok":true}' }] },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 2,
          thoughtsTokenCount: 3,
        },
      }).outputTokens,
    ).toBe(5);
  });
});

describe('provider boundary regression', () => {
  it('rejects a provider/dialect mismatch before calling the internal service', async () => {
    await expect(
      runInference(
        { url: 'http://assessment-inference:8000', token: 'x'.repeat(32) },
        { ...profile, apiDialect: 'openai_chat_completions' },
        '',
        {},
        [],
      ),
    ).rejects.toThrow('provider_dialect_invalid');
  });
  it.each([undefined, -1, NaN, 1.5])(
    'keeps the reservation when completion usage is incomplete: %s',
    (completion) => {
      const result = parseProviderResponse(profile, {
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: '{}' }] } },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: completion,
        },
      });
      expect(result.usageComplete).toBe(false);
      expect(result.outputTokens).toBeNull();
    },
  );
});

it('cancels oversized provider streams without buffering the rest', async () => {
  const cancel = jest.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
    },
    cancel,
  });
  await expect(readBoundedResponse(new Response(stream))).rejects.toThrow(
    'provider_response_limit',
  );
  expect(cancel).toHaveBeenCalledTimes(1);
});
it('decodes bounded UTF-8 streams across chunk boundaries', async () => {
  const data = new TextEncoder().encode('{"message":"đúng"}');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data.slice(0, 13));
      controller.enqueue(data.slice(13));
      controller.close();
    },
  });
  await expect(readBoundedResponse(new Response(stream))).resolves.toBe(
    '{"message":"đúng"}',
  );
});

it('retains an unknown actual cost when the paid response lacks completion usage', async () => {
  const update = jest.fn().mockResolvedValue({});
  const repo = { findOne: jest.fn().mockResolvedValue(null), update };
  const job = {
    id: 'job',
    schoolId: 'school',
    assessmentId: 'assessment',
    submissionId: 'submission',
    leaseToken: 'lease',
    data: { inputRevision: 1 },
  };
  const manager = {
    query: jest.fn().mockResolvedValue([{ calls: '0', total: '0' }]),
    findOne: jest.fn().mockResolvedValue({
      ...job,
      state: 'running',
      leaseUntil: new Date(Date.now() + 100000),
    }),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((_entity, value) => value),
    save: jest
      .fn()
      .mockImplementation((_entity, value) => ({ ...value, id: 'call' })),
  };
  const db = {
    getRepository: () => repo,
    transaction: (action: (m: unknown) => Promise<unknown>) => action(manager),
  };
  const storage = { put: jest.fn().mockResolvedValue(null) };
  const configured = {
    ...profile,
    credentialRef: 'ASSESSMENT_GOOGLE_API_KEY',
    qualityGate: 'passed',
    maxInputTokens: 8192,
    allowThroughDate: null,
    pricing: {
      validThroughDate: '2099-01-01',
      inputMicrosPerMillion: 1000000,
      outputMicrosPerMillion: 1000000,
    },
  };
  const cfg = {
    profiles: { test: configured },
    agents: { text_grader: { mode: 'model', primaryProfileId: 'test' } },
    policy: {
      tenantProviderAllowlist: ['google'],
      dailyCostLimitMicros: 1000000,
      maxProviderCallsPerSubmissionRevision: 24,
      maxCostMicrosPerSubmissionRevision: 1000000,
    },
  };
  const savedEnv = { ...process.env };
  delete process.env.ASSESSMENT_GOOGLE_API_KEY;
  process.env.ASSESSMENT_INFERENCE_URL = 'http://assessment-inference:8000';
  process.env.ASSESSMENT_INFERENCE_TOKEN = 'x'.repeat(32);
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: '{}' }] } },
        ],
        usageMetadata: { promptTokenCount: 10 },
      }),
    ),
  );
  try {
    const models = new AssessmentModels(
      db as unknown,
      storage as unknown,
      cfg as unknown,
      'synthetic',
    );
    await expect(
      models.json(job as unknown, 'text_grader', '', {}),
    ).resolves.toEqual({});
    expect(update).toHaveBeenCalledWith(
      'call',
      expect.objectContaining({
        state: 'succeeded',
        actualCostMicros: null,
        outputUsage: {},
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://assessment-inference:8000/v1/generate',
      expect.objectContaining({
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${'x'.repeat(32)}`,
          'Content-Type': 'application/json',
        },
      }),
    );
    const body = fetchMock.mock.calls[0][1]?.body;
    if (typeof body !== 'string') throw new Error('Expected a JSON request');
    expect(JSON.parse(body)).toMatchObject({
      provider: 'google',
      dialect: 'google_generate_content',
      credentialRef: 'ASSESSMENT_GOOGLE_API_KEY',
      inputJson: '{}',
    });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'inference_busy' }), {
        status: 503,
      }),
    );
    await expect(
      models.json(job as unknown, 'text_grader', '', {}),
    ).rejects.toThrow('inference_busy');
    expect(update).toHaveBeenLastCalledWith(
      'call',
      expect.objectContaining({ state: 'not_sent', actualCostMicros: 0 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'provider_timeout' }), {
        status: 504,
      }),
    );
    await expect(
      models.json(job as unknown, 'text_grader', '', {}),
    ).rejects.toThrow('provider_timeout');
    expect(update).toHaveBeenLastCalledWith(
      'call',
      expect.objectContaining({ state: 'unknown' }),
    );
    expect(update.mock.lastCall?.[1]).not.toHaveProperty('actualCostMicros');
  } finally {
    fetchMock.mockRestore();
    process.env = savedEnv;
  }
});

it('rejects a public inference sidecar destination before reading student data', () => {
  const env = jest.replaceProperty(process, 'env', {
    ...process.env,
    ASSESSMENT_INFERENCE_TOKEN: 'x'.repeat(32),
    ASSESSMENT_INFERENCE_URL: 'https://public.example',
  });
  try {
    expect(() => inferenceConfig()).toThrow('inference_configuration_required');
  } finally {
    env.restore();
  }
});
