import { PRACTICE_LEVELS, topicLevelProgress, type PracticeLevel, type TopicLevelProgress } from "./governance.js";
import { PracticeSession, Question } from "./models.js";

export type AnsweredRow = { questionId: string; correct: boolean; topicId: string; subjectId: string; difficulty: string; examId: string };

/**
 * Every practice answer the student has given (answers are final once given),
 * oldest first. Retry sessions re-practise known questions and are not counted.
 */
export async function practiceAnswers(studentId: string, examId?: string): Promise<AnsweredRow[]> {
  const sessions = await PracticeSession.find({ studentId, kind: { $ne: "retry" }, ...(examId ? { examId } : {}) })
    .sort({ createdAt: 1 })
    .select("examId answers")
    .lean();
  const ids = [...new Set(sessions.flatMap((session) => session.answers.map((answer) => answer.questionId)))];
  if (!ids.length) return [];
  const questions = await Question.find({ id: { $in: ids } }).select("id topicId subjectId difficulty").lean();
  const byId = new Map(questions.map((question) => [question.id, question]));
  const rows: AnsweredRow[] = [];
  for (const session of sessions) {
    const answers = [...session.answers].sort((a, b) => new Date(a.answeredAt || 0).getTime() - new Date(b.answeredAt || 0).getTime());
    for (const answer of answers) {
      const question = byId.get(answer.questionId);
      if (!question) continue;
      rows.push({
        questionId: answer.questionId,
        correct: Boolean(answer.correct),
        topicId: question.topicId,
        subjectId: question.subjectId,
        difficulty: question.difficulty,
        examId: session.examId,
      });
    }
  }
  return rows;
}

/** Easy → Medium → Hard progress for every topic the student has practised. */
export function levelsByTopic(rows: AnsweredRow[]) {
  const grouped = new Map<string, Partial<Record<PracticeLevel, boolean[]>>>();
  for (const row of rows) {
    if (!PRACTICE_LEVELS.includes(row.difficulty as PracticeLevel)) continue;
    const topic = grouped.get(row.topicId) || {};
    const level = row.difficulty as PracticeLevel;
    (topic[level] ||= []).push(row.correct);
    grouped.set(row.topicId, topic);
  }
  const result = new Map<string, TopicLevelProgress>();
  for (const [topicId, answers] of grouped) result.set(topicId, topicLevelProgress(answers));
  return result;
}

export const NO_PROGRESS: TopicLevelProgress = topicLevelProgress({});

export async function topicProgress(studentId: string, examId: string) {
  return levelsByTopic(await practiceAnswers(studentId, examId));
}
