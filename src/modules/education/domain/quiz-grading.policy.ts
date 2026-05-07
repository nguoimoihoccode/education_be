export function gradeQuizAnswer(input: {
  correctAnswer: string;
  userAnswer: string;
  points: number;
}) {
  const isCorrect =
    input.correctAnswer.trim().toLowerCase() ===
    input.userAnswer.trim().toLowerCase();

  return {
    isCorrect,
    points: isCorrect ? input.points : 0,
  };
}

export function calculateFinalQuizScore(input: {
  earnedPoints: number;
  totalPoints: number;
}): number {
  if (input.totalPoints <= 0) {
    return 0;
  }

  return Math.round((input.earnedPoints / input.totalPoints) * 100);
}
