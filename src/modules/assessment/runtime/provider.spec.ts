import {
  AssessmentModels,
  parseProviderResponse,
  providerRequest,
  readBoundedResponse,
} from './provider';
import type { Profile } from './routing';
const profile = {
  provider: 'google',
  model: 'gemini-2.5-flash',
  apiDialect: 'google_generate_content',
  reasoningPolicy: 'disabled',
  maxOutputTokens: 4096,
} as Profile;
describe('assessment model adapter', () => {
  it('uses native image parts without disclosing the API key in URLs', () => {
    const req = providerRequest(
      profile,
      'secret',
      'instruction',
      { task: 'read' },
      [{ mime: 'image/jpeg', bytes: Buffer.from('x') }],
    );
    expect(req.url).not.toContain('secret');
    expect(JSON.stringify(req.body)).toContain('inlineData');
    expect(JSON.stringify(req.body)).not.toContain('secret');
  });
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
  it('refuses provider/dialect mismatch before creating a credential-bearing request', () => {
    expect(() =>
      providerRequest(
        { ...profile, apiDialect: 'openai_chat_completions' },
        'google-secret',
        '',
        {},
        [],
      ),
    ).toThrow('provider_dialect_invalid');
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
    credentialRef: 'ASSESSMENT_TEST_CREDENTIAL',
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
  const credential = process.env.ASSESSMENT_TEST_CREDENTIAL;
  process.env.ASSESSMENT_TEST_CREDENTIAL = 'test-only';
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
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  } finally {
    fetchMock.mockRestore();
    if (credential === undefined) delete process.env.ASSESSMENT_TEST_CREDENTIAL;
    else process.env.ASSESSMENT_TEST_CREDENTIAL = credential;
  }
});
