export function buildQuizSessionQuestionOrder(
  questions: Array<{ id: string }>,
): string[] {
  return questions.map((question) => question.id);
}

export const isQuestionInSessionOrder = (
  questionOrder: string[] | null | undefined,
  questionId: string,
): boolean => (questionOrder ?? []).includes(questionId);

export const hasAnsweredQuestion = (
  answers: Array<{ questionId: string }> | null | undefined,
  questionId: string,
): boolean =>
  (answers ?? []).some((answer) => answer.questionId === questionId);

export function calculateQuizSessionProgress(input: {
  questionOrder?: string[] | null;
  answers?: Array<{ questionId: string }> | null;
}) {
  const totalQuestions = input.questionOrder?.length ?? 0;
  const answeredQuestions = input.answers?.length ?? 0;

  return {
    totalQuestions,
    answeredQuestions,
    currentQuestionIndex: Math.min(answeredQuestions, totalQuestions),
  };
}

export interface QuizStatsResultInput {
  totalQuizzes: number;
  totalSessions: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  averageTimePerQuestion: number;
  passRate: number;
  watchedTopics: string[];
}

export function buildQuizStatsResult(input: QuizStatsResultInput) {
  return {
    totalQuizzes: input.totalQuizzes,
    totalSessions: input.totalSessions,
    averageScore: input.averageScore,
    highestScore: input.highestScore,
    lowestScore: input.lowestScore,
    averageTimePerQuestion: input.averageTimePerQuestion,
    passRate: input.passRate,
    watchedTopics: input.watchedTopics,
    passedQuizzes: Math.round((input.totalSessions * input.passRate) / 100),
  };
}

export interface TopicQuizStatsResultInput {
  topic: string;
  totalQuizzes: number;
  totalSessions: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passRate: number;
  favoriteQuestionTypes: string[];
}

export function buildTopicQuizStatsResult(input: TopicQuizStatsResultInput) {
  return {
    topic: input.topic,
    totalQuizzes: input.totalQuizzes,
    totalSessions: input.totalSessions,
    averageScore: input.averageScore,
    highestScore: input.highestScore,
    lowestScore: input.lowestScore,
    passRate: input.passRate,
    favoriteQuestionTypes: input.favoriteQuestionTypes,
    strengths: input.averageScore >= 70 ? input.favoriteQuestionTypes : [],
    weaknesses: input.averageScore < 70 ? input.favoriteQuestionTypes : [],
  };
}

export function parseNumericStat(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function uniqueNonEmpty(
  values: Array<string | null | undefined>,
): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}
