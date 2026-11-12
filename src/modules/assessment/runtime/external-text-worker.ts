import { Raw } from 'typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import * as E from '../entities/assessment.entities';
import { hash } from '../domain/assessment.policy';
import type { AssessmentStorage } from './storage';
import type { Question } from './grading';
import {
  externalTextPolicy,
  containsRosterIdentity,
  requestExternalTextGrade,
  textPayload,
  textPayloadHash,
  TEXT_RELEASE_EVENT,
  TEXT_REVOKE_EVENT,
  validateExternalGrades,
} from './external-text';

const callPurpose = 'external_text_grading';

export async function gradeReleasedText(
  db: DataSource,
  storage: AssessmentStorage,
  job: E.AssessmentJob,
  answer: E.AssessmentAnswerRevision,
  question: Question,
) {
  const releaseId = job.data?.externalReleaseId;
  const policy = externalTextPolicy(job.assessmentId);
  const payload =
    policy && releaseId ? textPayload(question, answer.content) : null;
  if (
    !policy ||
    !releaseId ||
    !payload ||
    !job.submissionId ||
    !answer.sourceRegionIds?.length
  )
    return null;
  const payloadHash = textPayloadHash(payload);
  const requestHash = hash({
    policy,
    answerRevisionId: answer.id,
    payloadHash,
  });
  const hasPermission = async (m: EntityManager) => {
    const scope = { schoolId: job.schoolId, assessmentId: job.assessmentId };
    const assessment = await m.findOne(E.Assessment, {
      where: { schoolId: scope.schoolId, id: scope.assessmentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !assessment ||
      assessment.archivedAt ||
      externalTextPolicy(assessment.id) !== policy
    )
      return null;
    const submission = await m.findOne(E.AssessmentSubmission, {
      where: { ...scope, id: job.submissionId! },
      lock: { mode: 'pessimistic_write' },
    });
    const running = await m.findOne(E.AssessmentJob, {
      where: { ...scope, id: job.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !submission ||
      submission.deletedAt ||
      submission.identityState !== 'confirmed' ||
      submission.inputRevision !== job.data.inputRevision ||
      submission.examVersionId !== answer.examVersionId ||
      submission.currentAnswerRevisionIds[question.questionKey] !== answer.id ||
      !running ||
      running.state !== 'running' ||
      running.leaseToken !== job.leaseToken ||
      !running.leaseUntil ||
      running.leaseUntil <= new Date()
    )
      return null;
    if (
      await m.existsBy(E.AssessmentPublication, {
        schoolId: job.schoolId,
        submissionId: submission.id,
        state: 'active',
      })
    )
      return null;
    const release = await m.findOneBy(E.AssessmentReviewEvent, {
      ...scope,
      id: releaseId,
      submissionId: submission.id,
      eventType: TEXT_RELEASE_EVENT,
    });
    if (
      await m.existsBy(E.AssessmentReviewEvent, {
        ...scope,
        submissionId: submission.id,
        eventType: TEXT_REVOKE_EVENT,
        afterRef: Raw((alias) => `${alias} @> CAST(:revoked AS jsonb)`, {
          revoked: JSON.stringify({ releaseIds: [releaseId] }),
        }),
      })
    )
      return false;
    const approved = release?.afterRef;
    if (
      !release ||
      release.id !== releaseId ||
      release.eventType !== TEXT_RELEASE_EVENT ||
      approved?.policy !== policy ||
      approved?.inputRevision !== submission.inputRevision ||
      approved?.identityRevision !== submission.identityRevision ||
      approved?.contextRevision !== assessment.contextRevision ||
      approved?.reviewRevisionId !== submission.currentReviewRevisionId ||
      approved?.examVersionId !== submission.examVersionId ||
      approved?.hashes?.[question.questionKey] !== payloadHash
    )
      return null;

    const roster = await m.find(E.AssessmentRoster, {
      where: scope,
      select: { displayNameSnapshot: true, studentCodeSnapshot: true },
    });
    return !containsRosterIdentity(payload, roster);
  };

  const reservation = await db.transaction(async (m) => {
    if (!(await hasPermission(m))) return null;
    await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `assessment-external:${job.schoolId}`,
    ]);
    const previous = await m.findOne(E.AssessmentProviderCall, {
      where: {
        schoolId: job.schoolId,
        purpose: callPurpose,
        requestHash,
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    if (previous && previous.state !== 'not_sent')
      return previous.state === 'succeeded' && previous.responseObjectKey
        ? { cached: previous.responseObjectKey }
        : null;
    const [{ daily, submissionCalls }] = await m.query(
      `SELECT COUNT(*) FILTER (WHERE p.created_at >= now() - interval '24 hours') AS daily,
       COUNT(*) FILTER (WHERE j.submission_id=$2 AND j.data->>'inputRevision'=$3) AS "submissionCalls"
       FROM school_assessment_provider_calls p JOIN school_assessment_jobs j ON p.job_id=j.id AND p.school_id=j.school_id
       WHERE p.school_id=$1 AND p.purpose=$4 AND p.state<>'not_sent'`,
      [
        job.schoolId,
        job.submissionId,
        String(job.data.inputRevision),
        callPurpose,
      ],
    );
    const configured = Number(
      process.env.ASSESSMENT_EXTERNAL_GRADING_MAX_CALLS_PER_SUBMISSION || 6,
    );
    const cap =
      Number.isSafeInteger(configured) && configured > 0
        ? Math.min(configured, 12)
        : 6;
    if (Number(daily) >= 120 || Number(submissionCalls) >= cap) return null;
    const attemptNumber =
      (await m.countBy(E.AssessmentProviderCall, {
        schoolId: job.schoolId,
        jobId: job.id,
      })) + 1;
    const call = await m.save(
      E.AssessmentProviderCall,
      m.create(E.AssessmentProviderCall, {
        schoolId: job.schoolId,
        jobId: job.id,
        attemptNumber,
        profileHash: hash(policy),
        provider: 'external_gateway',
        modelRequested: 'gateway_policy',
        purpose: callPurpose,
        requestHash,
        state: 'reserved',
        reservedCostMicros: 0,
      }),
    );
    return { callId: call.id };
  });
  if (!reservation) return null;
  const regions = answer.sourceRegionIds as string[];
  if (reservation.cached) {
    try {
      return validateExternalGrades(
        JSON.parse((await storage.read(reservation.cached, 65536)).toString()),
        payload,
        question,
        regions,
      );
    } catch {
      return null;
    }
  }
  if (!reservation.callId) return null;
  const update = { id: reservation.callId, schoolId: job.schoolId };
  try {
    const started = await db.transaction(async (m) => {
      if (!(await hasPermission(m))) return null;
      // Start the request before the permission lock is released. Await the network
      // response outside the transaction so other papers are not blocked.
      return {
        response: requestExternalTextGrade(payload, policy).catch(() => null),
      };
    });
    if (!started) {
      await db.manager.update(E.AssessmentProviderCall, update, {
        state: 'not_sent',
        errorCode: 'external_grading_revoked',
      });
      return null;
    }
    const raw = await started.response;
    const criteria = validateExternalGrades(raw, payload, question, regions);
    const responseObjectKey = `assessment/${job.schoolId}/${job.assessmentId}/provider/${reservation.callId}.json`;
    // Persist only the gateway's verified criterion fields, never the provider envelope.
    const checked = {
      criteria: criteria.map((grade, index) => ({
        id: payload.criteria[index].id,
        earnedUnits: grade.pointsUnits,
        reason: grade.reason,
      })),
    };
    await storage.put(
      responseObjectKey,
      Buffer.from(JSON.stringify(checked)),
      'application/json',
    );
    await db.manager.update(E.AssessmentProviderCall, update, {
      state: 'succeeded',
      responseObjectKey,
    });
    return criteria;
  } catch {
    // An uncertain delivery is counted and never retried automatically for the same answer.
    await db.manager.update(E.AssessmentProviderCall, update, {
      state: 'unknown',
      errorCode: 'external_grading_unavailable',
    });
    return null;
  }
}
