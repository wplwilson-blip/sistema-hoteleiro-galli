import "server-only";

export type EvaluationScoreInput = {
  score: number | null;
  isNotApplicable: boolean;
  weight: number;
};

export function calculateEvaluationTotals(scores: EvaluationScoreInput[]) {
  const applicable = scores.filter((score) => !score.isNotApplicable && score.score != null);
  const totalScore = applicable.length
    ? applicable.reduce((sum, score) => sum + Number(score.score ?? 0), 0) / applicable.length
    : null;
  const weightSum = applicable.reduce((sum, score) => sum + Math.max(Number(score.weight ?? 0), 0), 0);
  const weightedScore = weightSum > 0
    ? applicable.reduce((sum, score) => sum + Number(score.score ?? 0) * Math.max(Number(score.weight ?? 0), 0), 0) / weightSum
    : totalScore;

  return {
    totalScore: totalScore == null ? null : Number(totalScore.toFixed(3)),
    weightedScore: weightedScore == null ? null : Number(weightedScore.toFixed(3))
  };
}

export function calculateCriterionWeightedScore(score: number | null, weight: number, isNotApplicable: boolean) {
  if (isNotApplicable || score == null) return null;
  return Number((score * Math.max(Number(weight ?? 0), 0)).toFixed(3));
}
