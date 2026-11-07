export type AnswerState = "correct" | "incorrect" | "unanswered";

export interface ScoringRule {
  marksPerQuestion: number;
  negativeMarks: number;
}

export interface ScoredItem {
  state: AnswerState;
  awarded: number;
}

export function scoreItem(isCorrect: boolean | null, rule: ScoringRule): ScoredItem {
  if (isCorrect === null) return { state: "unanswered", awarded: 0 };
  if (isCorrect) return { state: "correct", awarded: rule.marksPerQuestion };
  return { state: "incorrect", awarded: -Math.abs(rule.negativeMarks) };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreAttempt(items: Array<boolean | null>, rule: ScoringRule) {
  const breakdown = items.map((item) => scoreItem(item, rule));
  const rawScore = round2(breakdown.reduce((sum, item) => sum + item.awarded, 0));
  const maxScore = round2(items.length * rule.marksPerQuestion);
  const correct = breakdown.filter((item) => item.state === "correct").length;
  const incorrect = breakdown.filter((item) => item.state === "incorrect").length;
  const unanswered = breakdown.filter((item) => item.state === "unanswered").length;
  return { rawScore, maxScore, correct, incorrect, unanswered, breakdown };
}
