import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  isValidIsoDayRange,
  vnDayRangeWhere,
} from '../../common/utils/date-range.util';
import { buildCostOverview, CostRow } from './domain/cost-overview';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One report over both cost logs: scanned-exam grading
 * (`school_assessment_provider_calls`) and every other AI call
 * (`ai_usage_logs`), each kept as its own source. Days are Asia/Ho_Chi_Minh.
 */
@Injectable()
export class CostOverviewService {
  constructor(private readonly db: DataSource) {}

  async listSchools(): Promise<{ id: string; name: string }[]> {
    return this.db.query(
      'SELECT id, name FROM schools ORDER BY name ASC, created_at ASC',
    );
  }

  async overview(from: string, to: string, schoolId?: string) {
    if (!isValidIsoDayRange(from, to, 366))
      throw new BadRequestException(
        'from/to must be valid YYYY-MM-DD calendar dates at most 366 days apart',
      );
    if (schoolId !== undefined && !UUID.test(schoolId))
      throw new BadRequestException('schoolId must be a UUID');
    const local = (col: string) =>
      `(${col} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
    const tokens = (col: string) =>
      `COALESCE(sum(CASE WHEN jsonb_typeof(${col}->'tokens')='number'
        AND (${col}->>'tokens')::numeric > 0 THEN (${col}->>'tokens')::bigint END),0)::bigint`;
    const sent = `c.state<>'not_sent'`;
    const [grading, ai] = await Promise.all([
      this.db.query(
        `SELECT 'assessment_grading' AS source, c.purpose AS part,
                to_char(${local('c.created_at')},'YYYY-MM-DD') AS day,
                count(*)::int AS calls,
                count(*) FILTER (WHERE c.error_code IS NOT NULL)::int AS "errorCalls",
                ${tokens('c.input_usage')} AS "inputTokens",
                ${tokens('c.output_usage')} AS "outputTokens",
                COALESCE(sum(c.actual_cost_micros) FILTER (WHERE ${sent}),0)::bigint AS "knownCostMicros",
                count(*) FILTER (WHERE ${sent} AND c.actual_cost_micros IS NULL)::int AS "unknownCostCalls",
                COALESCE(sum(c.reserved_cost_micros) FILTER (WHERE ${sent} AND c.actual_cost_micros IS NULL),0)::bigint AS "unknownReservedMicros"
           FROM school_assessment_provider_calls c
          WHERE ($3::uuid IS NULL OR c.school_id=$3::uuid)
            AND ${vnDayRangeWhere('c.created_at', '$1', '$2')}
          GROUP BY 2,3`,
        [from, to, schoolId ?? null],
      ),
      // AI usage has no school; a school filter narrows the report to grading.
      schoolId
        ? Promise.resolve([])
        : this.db.query(
            `SELECT feature AS source, model AS part,
                    to_char(${local('created_at')},'YYYY-MM-DD') AS day,
                    count(*)::int AS calls,
                    count(*) FILTER (WHERE status='error')::int AS "errorCalls",
                    COALESCE(sum(prompt_tokens),0)::bigint AS "inputTokens",
                    COALESCE(sum(completion_tokens),0)::bigint AS "outputTokens",
                    COALESCE(sum(cost_micros),0)::bigint AS "knownCostMicros",
                    count(*) FILTER (WHERE status='ok' AND cost_micros IS NULL)::int AS "unknownCostCalls",
                    0::bigint AS "unknownReservedMicros"
               FROM ai_usage_logs
              WHERE ${vnDayRangeWhere('created_at', '$1', '$2')}
              GROUP BY 1,2,3`,
            [from, to],
          ),
    ]);
    const rows: CostRow[] = [...grading, ...ai].map((r: any) => ({
      source: r.source,
      part: r.part,
      day: r.day,
      calls: Number(r.calls),
      errorCalls: Number(r.errorCalls),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      knownCostMicros: Number(r.knownCostMicros),
      unknownCostCalls: Number(r.unknownCostCalls),
      unknownReservedMicros: Number(r.unknownReservedMicros),
    }));
    return {
      from,
      to,
      timeZone: 'Asia/Ho_Chi_Minh',
      schoolId: schoolId ?? null,
      ...buildCostOverview(rows),
    };
  }
}
