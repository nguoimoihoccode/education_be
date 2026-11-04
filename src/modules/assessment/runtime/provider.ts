import { createHash } from 'node:crypto';
import type { DataSource, Repository } from 'typeorm';
import {
  AssessmentProviderCall,
  AssessmentJob,
} from '../entities/assessment.entities';
import { AssessmentStorage } from './storage';
import {
  assertProviderDialect,
  reserveCostMicros,
  selectProfile,
} from './routing';
import type { Profile, Routing } from './routing';
export type ModelImage = { mime: string; bytes: Buffer };
export function providerRequest(
  profile: Profile,
  key: string,
  instruction: string,
  input: unknown,
  images: ModelImage[],
): {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  assertProviderDialect(profile);
  if (profile.apiDialect === 'google_generate_content') {
    const generationConfig: Record<string, unknown> = {
      responseMimeType: 'application/json',
      maxOutputTokens: profile.maxOutputTokens,
    };
    if (
      profile.reasoningPolicy === 'disabled' &&
      profile.model.startsWith('gemini-2.5-flash')
    )
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    if (profile.reasoningPolicy === 'low') {
      if (!profile.model.startsWith('gemini-3'))
        throw new Error('reasoning_policy_unsupported');
      generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    }
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(profile.model)}:generateContent`,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: {
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: JSON.stringify(input) },
              ...images.map((i) => ({
                inlineData: {
                  mimeType: i.mime,
                  data: i.bytes.toString('base64'),
                },
              })),
            ],
          },
        ],
        generationConfig,
      },
    };
  }
  if (images.length && !profile.capabilities.includes('vision'))
    throw new Error('vision_required');
  const content = images.length
    ? [
        { type: 'text', text: JSON.stringify(input) },
        ...images.map((i) => ({
          type: 'image_url',
          image_url: {
            url: `data:${i.mime};base64,${i.bytes.toString('base64')}`,
          },
        })),
      ]
    : JSON.stringify(input);
  const body: Record<string, unknown> = {
    model: profile.model,
    messages: [
      { role: 'system', content: instruction },
      { role: 'user', content },
    ],
    max_tokens: profile.maxOutputTokens,
    response_format: { type: 'json_object' },
  };
  if (profile.reasoningPolicy === 'disabled')
    body.thinking = { type: 'disabled' };
  return {
    url: 'https://api.deepseek.com/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body,
  };
}
interface GoogleOutput {
  modelVersion?: string;
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}
interface OpenAIOutput {
  model?: string;
  choices?: {
    finish_reason?: string;
    message?: { content?: string; refusal?: string };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
function validUsage(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
export async function readBoundedResponse(response: Response): Promise<string> {
  if (!response.body) throw new Error('provider_response_empty');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel().catch(() => undefined);
        throw new Error('provider_response_limit');
      }
      chunks.push(Buffer.from(result.value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    reader.releaseLock();
  }
}
export function parseProviderResponse(profile: Profile, raw: unknown) {
  let text: string | undefined;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let modelReported: string | null = null;
  if (profile.apiDialect === 'google_generate_content') {
    const response = raw as GoogleOutput;
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason !== 'STOP')
      throw new Error('provider_output_incomplete');
    text = candidate.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text || '')
      .join('');
    inputTokens = validUsage(response.usageMetadata?.promptTokenCount);
    const completion = validUsage(response.usageMetadata?.candidatesTokenCount);
    const thoughts =
      response.usageMetadata?.thoughtsTokenCount === undefined
        ? 0
        : validUsage(response.usageMetadata.thoughtsTokenCount);
    outputTokens =
      completion !== null && thoughts !== null
        ? validUsage(completion + thoughts)
        : null;
    modelReported = response.modelVersion || null;
  } else {
    const response = raw as OpenAIOutput;
    const choice = response.choices?.[0];
    if (choice?.finish_reason !== 'stop' || choice.message?.refusal)
      throw new Error('provider_output_incomplete');
    text = choice.message?.content;
    inputTokens = validUsage(response.usage?.prompt_tokens);
    outputTokens = validUsage(response.usage?.completion_tokens);
    modelReported = response.model || null;
  }
  if (!text || text.length > 200000) throw new Error('provider_json_invalid');
  let output: unknown;
  try {
    output = JSON.parse(text) as unknown;
  } catch {
    throw new Error('provider_json_invalid');
  }
  return {
    output,
    inputTokens,
    outputTokens,
    modelReported,
    usageComplete: inputTokens !== null && outputTokens !== null,
  };
}
const digest = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class AssessmentModels {
  constructor(
    private readonly db: DataSource,
    private readonly storage: AssessmentStorage,
    private readonly cfg: Routing,
  ) {}
  async json(
    job: AssessmentJob,
    role: string,
    instruction: string,
    input: unknown,
    images: ModelImage[] = [],
  ): Promise<unknown> {
    const { profile } = selectProfile(this.cfg, role, images.length > 0);
    const key = process.env[profile.credentialRef];
    if (!key) throw new Error('provider_credentials_required');
    // Conservative text bound (bytes >= tokens) plus image allowance; split page jobs rather than silently truncating.
    const estimatedInput =
      Buffer.byteLength(instruction + JSON.stringify(input)) +
      images.length * 8192;
    if (estimatedInput > profile.maxInputTokens)
      throw new Error('provider_input_limit');
    const profileHash = digest(profile);
    const requestHash = digest({
      role,
      instruction,
      input,
      images: images.map((i) => digest(i.bytes.toString('base64'))),
      profileHash,
    });
    const prior = await this.db.getRepository(AssessmentProviderCall).findOne({
      where: { jobId: job.id, requestHash, state: 'succeeded' },
      order: { createdAt: 'DESC' },
    });
    if (prior?.responseObjectKey)
      return (
        JSON.parse(
          (
            await this.storage.read(prior.responseObjectKey, 2 * 1024 * 1024)
          ).toString(),
        ) as { output: unknown }
      ).output;
    const reservation = reserveCostMicros(
      profile.maxInputTokens,
      profile.maxOutputTokens,
      profile.pricing.inputMicrosPerMillion,
      profile.pricing.outputMicrosPerMillion,
    );
    const call = await this.db.transaction(async (m) => {
      // A tenant lock serializes every worker's reservation, including across different jobs.
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `assessment-budget:${job.schoolId}`,
      ]);
      const current = await m.findOne(AssessmentJob, {
        where: { id: job.id, schoolId: job.schoolId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !current ||
        current.leaseToken !== job.leaseToken ||
        current.state !== 'running' ||
        !current.leaseUntil ||
        current.leaseUntil.getTime() < Date.now()
      )
        throw new Error('job_lease_lost');
      const daily = await m.query(
        `SELECT COALESCE(SUM(COALESCE(actual_cost_micros,reserved_cost_micros)),0) AS total FROM school_assessment_provider_calls WHERE school_id=$1 AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`,
        [job.schoolId],
      );
      if (
        Number(daily[0].total) + reservation >
        this.cfg.policy.dailyCostLimitMicros
      )
        throw new Error('daily_budget_exceeded');
      const scope = await m.query(
        `SELECT count(*) AS calls,COALESCE(SUM(COALESCE(p.actual_cost_micros,p.reserved_cost_micros)),0) AS total FROM school_assessment_provider_calls p JOIN school_assessment_jobs j ON j.id=p.job_id AND j.school_id=p.school_id WHERE j.school_id=$1 AND j.submission_id IS NOT DISTINCT FROM $2 AND j.assessment_id=$3 AND j.data->>'inputRevision' IS NOT DISTINCT FROM $4`,
        [
          job.schoolId,
          job.submissionId,
          job.assessmentId,
          String((job.data as { inputRevision?: number }).inputRevision || 1),
        ],
      );
      const cap = job.submissionId
        ? this.cfg.policy.maxProviderCallsPerSubmissionRevision
        : this.cfg.policy.maxProviderCallsPerTemplate;
      if (
        Number(scope[0].calls) >= cap ||
        Number(scope[0].total) + reservation >
          this.cfg.policy.maxCostMicrosPerSubmissionRevision
      )
        throw new Error('submission_budget_exceeded');
      const attempts = await m.count(AssessmentProviderCall, {
        where: { jobId: job.id },
      });
      return m.save(
        AssessmentProviderCall,
        m.create(AssessmentProviderCall, {
          schoolId: job.schoolId,
          jobId: job.id,
          attemptNumber: attempts + 1,
          profileHash,
          provider: profile.provider,
          modelRequested: profile.model,
          purpose: role,
          requestHash,
          state: 'reserved',
          reservedCostMicros: reservation,
          inputUsage: {},
          outputUsage: {},
        }),
      );
    });
    const start = Date.now();
    try {
      const request = providerRequest(profile, key, instruction, input, images);
      const response = await fetch(request.url, {
        method: 'POST',
        redirect: 'error',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error(`provider_http_${response.status}`);
      const text = await readBoundedResponse(response);
      const result = parseProviderResponse(
        profile,
        JSON.parse(text) as unknown,
      );
      const responseObjectKey = `assessment/${job.schoolId}/${job.assessmentId}/provider/${call.id}.json`;
      await this.storage.put(
        responseObjectKey,
        Buffer.from(JSON.stringify(result)),
        'application/json',
      );
      // TypeORM's recursive update type cannot model JSON columns typed as any.
      const successUpdate = {
        state: 'succeeded',
        responseObjectKey,
        modelReported: result.modelReported,
        inputUsage:
          result.inputTokens === null ? {} : { tokens: result.inputTokens },
        outputUsage:
          result.outputTokens === null ? {} : { tokens: result.outputTokens },
        actualCostMicros:
          result.inputTokens !== null && result.outputTokens !== null
            ? reserveCostMicros(
                result.inputTokens,
                result.outputTokens,
                profile.pricing.inputMicrosPerMillion,
                profile.pricing.outputMicrosPerMillion,
              )
            : null,
        latencyMs: Date.now() - start,
      } as unknown as Parameters<
        Repository<AssessmentProviderCall>['update']
      >[1];
      await this.db
        .getRepository(AssessmentProviderCall)
        .update(call.id, successUpdate);
      return result.output;
    } catch (error) {
      await this.db.getRepository(AssessmentProviderCall).update(call.id, {
        state: 'unknown',
        errorCode:
          error instanceof Error
            ? error.message.slice(0, 100)
            : 'provider_failure',
        latencyMs: Date.now() - start,
      });
      throw error;
    }
  }
}
