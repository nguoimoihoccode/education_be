/**
 * Shapes shared by the API-side helpers that read an exam-version document.
 *
 * They used to live in ``grading.ts``; that whole grader moved to the Python
 * worker, but the API still matches a submitted page against this shape
 * (``exam-match``) and builds external-grade payloads from it
 * (``external-text``).
 */
export interface Question {
  questionKey: string;
  kind: string;
  text: string;
  maxUnits: number;
  criteria?: { id: string; maxUnits: number; [key: string]: unknown }[];
  [key: string]: unknown;
}

export interface Template {
  examCode: string;
  maxScoreUnits: number;
  questions: Question[];
  [key: string]: unknown;
}

export interface CriterionGrade {
  criterionId: string;
  pointsUnits: number | null;
  reason: string;
  evidenceRegionIds: string[];
  confidence?: 'high' | 'medium' | 'low';
}
