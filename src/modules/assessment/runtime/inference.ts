import { assertProviderDialect } from './routing';
import type { Profile } from './routing';

export type ModelImage = { mime: string; bytes: Buffer };

export function inferenceConfig() {
  const url = URL.parse(process.env.ASSESSMENT_INFERENCE_URL || '');
  const token = process.env.ASSESSMENT_INFERENCE_TOKEN || '';
  if (
    !url ||
    !['http:', 'https:'].includes(url.protocol) ||
    !['assessment-inference', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^[a-zA-Z0-9]{32,}$/.test(token)
  )
    throw new Error('inference_configuration_required');
  return { url: url.origin, token };
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
export class InferenceRejected extends Error {}

const preflightErrors = new Set([
  'inference_busy',
  'inference_unauthorized',
  'inference_request_limit',
  'inference_request_invalid',
  'provider_credentials_required',
  'provider_dialect_invalid',
  'reasoning_policy_unsupported',
  'local_model_unavailable',
]);

const upstreamErrors = new Set([
  'provider_timeout',
  'provider_unavailable',
  'provider_redirect_denied',
  'provider_response_limit',
]);

async function postInference(
  config: ReturnType<typeof inferenceConfig>,
  path: string,
  body: unknown,
  timeoutMs: number,
) {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new Error(
      signal.aborted ? 'inference_timeout' : 'inference_unavailable',
    );
  }
  if (response.ok) return response;
  let detail: unknown;
  try {
    detail = (
      JSON.parse(await readBoundedResponse(response)) as { detail?: unknown }
    ).detail;
  } catch {
    throw new Error('inference_unavailable');
  }
  if (typeof detail === 'string') {
    if (
      path === '/v1/import-exam' &&
      response.status === 422 &&
      /^exam_import_[a-z_]+$/.test(detail)
    )
      throw new Error(detail);
    if (preflightErrors.has(detail)) throw new InferenceRejected(detail);
    if (
      upstreamErrors.has(detail) ||
      detail === `provider_http_${response.status}`
    )
      throw new Error(detail);
  }
  throw new Error('inference_unavailable');
}

export async function checkInference(): Promise<void> {
  const config = inferenceConfig();
  const response = await fetch(`${config.url}/healthz`, {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (response.status !== 204) throw new Error('inference_unavailable');
}

export async function runLocalInference(
  instruction: string,
  input: unknown,
  images: ModelImage[],
): Promise<unknown> {
  const response = await postInference(
    inferenceConfig(),
    '/v1/generate-local',
    {
      maxOutputTokens: 8192,
      instruction,
      inputJson: JSON.stringify(input),
      images: images.map((image) => ({
        mime: image.mime,
        data: image.bytes.toString('base64'),
      })),
    },
    95000,
  );
  try {
    const decoded = JSON.parse(await readBoundedResponse(response));
    const choice = decoded?.choices?.[0];
    if (
      choice?.finish_reason !== 'stop' ||
      choice.message?.refusal ||
      typeof choice.message?.content !== 'string'
    )
      throw new Error();
    return JSON.parse(choice.message.content);
  } catch {
    throw new Error('local_model_output_invalid');
  }
}

export async function runInference(
  config: ReturnType<typeof inferenceConfig>,
  profile: Profile,
  instruction: string,
  input: unknown,
  images: ModelImage[],
): Promise<unknown> {
  assertProviderDialect(profile);
  if (images.length && !profile.capabilities.includes('vision'))
    throw new InferenceRejected('vision_required');
  const response = await postInference(
    config,
    '/v1/generate',
    {
      provider: profile.provider,
      dialect: profile.apiDialect,
      model: profile.model,
      credentialRef: profile.credentialRef,
      reasoningPolicy: profile.reasoningPolicy,
      maxOutputTokens: profile.maxOutputTokens,
      instruction,
      inputJson: JSON.stringify(input),
      images: images.map((image) => ({
        mime: image.mime,
        data: image.bytes.toString('base64'),
      })),
    },
    95000,
  );
  const text = await readBoundedResponse(response);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('provider_json_invalid');
  }
}

export async function importOfficialExam(
  bytes: Buffer,
  examCode: string,
  maxScoreUnits: number,
): Promise<{
  document: Record<string, any>;
  warnings: string[];
  source: Record<string, string>;
}> {
  const response = await postInference(
    inferenceConfig(),
    '/v1/import-exam',
    { data: bytes.toString('base64'), examCode, maxScoreUnits },
    30000,
  );
  const result = JSON.parse(await readBoundedResponse(response));
  if (
    !result?.document ||
    !Array.isArray(result.warnings) ||
    result.warnings.some((warning: unknown) => typeof warning !== 'string') ||
    !result.source ||
    Array.isArray(result.source) ||
    typeof result.source !== 'object' ||
    Object.values(result.source).some((entry) => typeof entry !== 'string')
  )
    throw new Error('exam_import_response_invalid');
  return result;
}
