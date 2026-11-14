import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Question, CriterionGrade } from './types';

/**
 * Reads the gateway response with a hard 2 MiB ceiling. It used to be shared
 * with ``inference.ts``, which the Python cutover removed; this is the only
 * caller left.
 */
async function readBoundedResponse(response: Response): Promise<string> {
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

export const TEXT_RELEASE_EVENT = 'external_text_released';
export const TEXT_REVOKE_EVENT = 'external_text_revoked';
export const MANUAL_ONLY_EVENT = 'manual_grading_selected';

export type TextGradePayload = {
  answer: string;
  criteria: { id: string; description: string; allowedUnits: number[] }[];
};

const digest = (body: string) =>
  createHash('sha256').update(body).digest('hex');
export const textPayloadHash = (payload: TextGradePayload) =>
  digest(JSON.stringify(payload));

export function externalTextPolicy(assessmentId: string) {
  if (
    process.env.ASSESSMENT_EXTERNAL_GRADING_ENABLED !== 'true' ||
    !process.env.ASSESSMENT_EXTERNAL_GRADING_ASSESSMENT_IDS?.split(',')
      .map((id) => id.trim())
      .includes(assessmentId)
  )
    return null;
  const value = process.env.ASSESSMENT_EXTERNAL_GRADING_POLICY ?? '';
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

export function textPayload(
  question: Question,
  content: unknown,
): TextGradePayload | null {
  if (
    question.kind !== 'rubric_text' ||
    !question.criteria?.length ||
    question.criteria.length > 12 ||
    !content ||
    typeof content !== 'object'
  )
    return null;
  const value = (content as { text?: unknown }).text;
  if (typeof value !== 'string' || !value.trim() || value.length > 2500)
    return null;
  const answer = value.trim();
  const criteria: TextGradePayload['criteria'] = [];
  for (const [index, criterion] of question.criteria.entries()) {
    const description = criterion.description;
    if (
      typeof description !== 'string' ||
      !description.trim() ||
      description.length > 1200 ||
      !Array.isArray(criterion.levels) ||
      !criterion.levels.length ||
      criterion.levels.length > 12
    )
      return null;
    const units = criterion.levels.map(
      (level: { pointsUnits?: unknown } | null) => level?.pointsUnits,
    );
    if (
      units.some(
        (unit) =>
          typeof unit !== 'number' ||
          !Number.isSafeInteger(unit) ||
          unit < 0 ||
          unit > criterion.maxUnits,
      )
    )
      return null;
    // Level wording is part of the rubric, not metadata to discard.
    const rubric = [
      `Câu hỏi: ${question.text.trim()}`,
      description.trim(),
      ...criterion.levels.map(
        (level: { pointsUnits: number; description?: string }) =>
          `${level.pointsUnits}: ${typeof level.description === 'string' ? level.description.trim() : ''}`,
      ),
    ].join('\n');
    if (rubric.length > 1200) return null;
    criteria.push({
      id: `c${index + 1}`,
      description: rubric,
      allowedUnits: [...new Set(units as number[])],
    });
  }
  const payload = { answer, criteria };
  return Buffer.byteLength(JSON.stringify(payload)) <= 16 * 1024
    ? payload
    : null;
}

const comparable = (value: string) =>
  value
    .normalize('NFKD')
    .toLocaleLowerCase('vi')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function containsRosterIdentity(
  payload: TextGradePayload,
  roster: {
    displayNameSnapshot: string;
    studentCodeSnapshot: string | null;
  }[],
) {
  const pieces = [
    payload.answer,
    ...payload.criteria.map((criterion) => criterion.description),
  ].map((part) => ` ${comparable(part)} `);
  return roster.some((student) => {
    const name = comparable(student.displayNameSnapshot);
    const code = comparable(student.studentCodeSnapshot ?? '');
    return pieces.some(
      (piece) =>
        (name.length >= 3 && piece.includes(` ${name} `)) ||
        (code.length >= 4 && piece.includes(` ${code} `)),
    );
  });
}

export function validateExternalGrades(
  raw: unknown,
  payload: TextGradePayload,
  question: Question,
  regionIds: string[],
): CriterionGrade[] {
  const rows = (raw as { criteria?: unknown } | null)?.criteria;
  if (
    !regionIds.length ||
    !Array.isArray(rows) ||
    rows.length !== payload.criteria.length
  )
    throw new Error('external_grading_response_invalid');
  return payload.criteria.map((item, index) => {
    const matches = rows.filter((row) => row?.id === item.id);
    const grade = matches[0];
    if (
      matches.length !== 1 ||
      !item.allowedUnits.includes(grade.earnedUnits) ||
      typeof grade.reason !== 'string' ||
      !grade.reason.trim() ||
      grade.reason.length > 350 ||
      ![undefined, 'high', 'medium', 'low'].includes(grade.confidence)
    )
      throw new Error('external_grading_response_invalid');
    return {
      criterionId: question.criteria![index].id,
      pointsUnits: grade.earnedUnits as number,
      reason: grade.reason,
      evidenceRegionIds: regionIds,
      ...(grade.confidence ? { confidence: grade.confidence } : {}),
    };
  });
}

export async function requestExternalTextGrade(
  payload: TextGradePayload,
  policy: string,
): Promise<unknown> {
  if (
    process.env.ASSESSMENT_EXTERNAL_GRADING_ENABLED !== 'true' ||
    process.env.ASSESSMENT_EXTERNAL_GRADING_POLICY !== policy
  )
    throw new Error('external_grading_unavailable');
  const url = URL.parse(process.env.ASSESSMENT_EXTERNAL_GRADING_URL || '');
  const token = process.env.ASSESSMENT_EXTERNAL_GRADING_TOKEN || '';
  const key = process.env.ASSESSMENT_EXTERNAL_GRADING_SIGNING_KEY || '';
  const secret = /^[A-Za-z0-9_-]{32,256}$/;
  if (
    !url ||
    !['http:', 'https:'].includes(url.protocol) ||
    !['assessment-external-grading', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !secret.test(token) ||
    !secret.test(key) ||
    token === key
  )
    throw new Error('external_grading_unavailable');
  const body = JSON.stringify(payload);
  const expires = String(Math.floor(Date.now() / 1000) + 30);
  const nonce = randomBytes(24).toString('base64url');
  const signature = createHmac('sha256', key)
    .update(`${policy}.${expires}.${nonce}.${digest(body)}`)
    .digest('hex');
  try {
    const response = await fetch(`${url.origin}/v1/grade-text`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(50000),
      body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Assessment-Policy': policy,
        'X-Assessment-Expires': expires,
        'X-Assessment-Nonce': nonce,
        'X-Assessment-Signature': signature,
      },
    });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error();
    }
    return JSON.parse(await readBoundedResponse(response));
  } catch {
    throw new Error('external_grading_unavailable');
  }
}
