import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Profile {
  provider: 'google' | 'deepseek';
  model: string;
  apiDialect: 'google_generate_content' | 'openai_chat_completions';
  credentialRef: string;
  capabilities: string[];
  reasoningPolicy: 'disabled' | 'low' | 'provider_default';
  maxInputTokens: number;
  maxOutputTokens: number;
  qualityGate: string;
  allowThroughDate: string | null;
  pricing: {
    currency: string;
    validThroughDate: string;
    inputMicrosPerMillion: number;
    outputMicrosPerMillion: number;
  };
}
export interface Routing {
  schemaVersion: 1;
  routingVersion: string;
  deploymentState: string;
  policy: {
    tenantProviderAllowlist: string[];
    maxProviderCallsPerSubmissionRevision: number;
    maxProviderCallsPerTemplate: number;
    maxCostMicrosPerSubmissionRevision: number;
    dailyCostLimitMicros: number;
    auditSampleRate: number;
    auditSeedRef: string;
  };
  execution: {
    mode: string;
    maxParallelJobs: number;
    maxParallelProviderCalls: number;
    admitFreeDiskGiB: number;
    pauseBelowFreeDiskGiB: number;
    localCacheMaxGiB: number;
  };
  profiles: Record<string, Profile>;
  agents: Record<
    string,
    {
      mode: string;
      primaryProfileId: string | null;
      fallbackProfileId: string | null;
      escalationProfileId: string | null;
      visionProfileId: string | null;
    }
  >;
}
export function assertProviderDialect(profile: Profile): void {
  if (
    !(
      (profile.provider === 'google' &&
        profile.apiDialect === 'google_generate_content') ||
      (profile.provider === 'deepseek' &&
        profile.apiDialect === 'openai_chat_completions')
    )
  ) {
    throw new Error('provider_dialect_invalid');
  }
}
const today = () => new Date().toISOString().slice(0, 10);
export function parseRouting(input: unknown, date = today()): Routing {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema: object = JSON.parse(
    readFileSync(
      resolve('docs/assessment/contracts/agent-routing.schema.json'),
      'utf8',
    ),
  ) as object;
  if (!ajv.validate(schema, input)) throw new Error('routing_schema_invalid');
  const cfg = input as Routing;
  Object.values(cfg.profiles).forEach(assertProviderDialect);
  if (cfg.deploymentState !== 'pilot') throw new Error('routing_not_pilot');
  for (const agent of Object.values(cfg.agents)) {
    for (const id of [
      agent.primaryProfileId,
      agent.fallbackProfileId,
      agent.escalationProfileId,
      agent.visionProfileId,
    ].filter((v): v is string => !!v)) {
      const p = cfg.profiles[id];
      if (!p || !cfg.policy.tenantProviderAllowlist.includes(p.provider))
        throw new Error('profile_not_allowed');
      if (p.qualityGate !== 'passed') throw new Error('profile_not_ready');
    }
  }
  if (cfg.execution.pauseBelowFreeDiskGiB >= cfg.execution.admitFreeDiskGiB)
    throw new Error('disk_thresholds_invalid');
  selectProfile(cfg, 'image_reader', true, date);
  return cfg;
}
export function selectProfile(
  cfg: Routing,
  role: string,
  vision: boolean,
  date = today(),
): { id: string; profile: Profile } {
  const agent = cfg.agents[role];
  if (!agent || agent.mode === 'code_only') throw new Error('role_not_model');
  const ids =
    vision && agent.visionProfileId
      ? [agent.visionProfileId]
      : [agent.primaryProfileId, agent.fallbackProfileId];
  for (const id of ids) {
    if (!id) continue;
    const profile = cfg.profiles[id];
    if (
      !profile ||
      profile.qualityGate !== 'passed' ||
      !cfg.policy.tenantProviderAllowlist.includes(profile.provider)
    )
      continue;
    assertProviderDialect(profile);
    if (vision && !profile.capabilities.includes('vision'))
      throw new Error('vision_required');
    if (profile.allowThroughDate && profile.allowThroughDate < date) continue;
    if (profile.pricing.validThroughDate < date) continue;
    return { id, profile };
  }
  throw new Error('profile_expired_or_unavailable');
}
export function loadRouting(): Routing {
  const path = process.env.ASSESSMENT_ROUTING_CONFIG_PATH;
  if (!path) throw new Error('routing_path_required');
  return parseRouting(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}
export function reserveCostMicros(
  inputTokens: number,
  outputTokens: number,
  inputRate: number,
  outputRate: number,
): number {
  if (
    ![inputTokens, outputTokens, inputRate, outputRate].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    throw new Error('cost_invalid');
  const cost =
    (BigInt(inputTokens) * BigInt(inputRate) +
      BigInt(outputTokens) * BigInt(outputRate) +
      999999n) /
    1000000n;
  if (cost > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cost_overflow');
  return Number(cost);
}
