import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { detectStudentLanguage, transcribeAudio, tutorReply } from "../ai.js";
import { assertAiBudgetAvailable, estimateAiInr } from "../ai-budget.js";
import { dayKey, HttpError, nid, wrap } from "../http.js";
import { ensurePracticeQuestions, recordAnswerStats, recordSeen, visibleToStudent } from "../question-ai.js";
import { DAILY_SET_STALE_MS, generateDailyMockSet, generatingAgeMs, studentDailyMocks } from "../daily-mock.js";

/** After a failure, wait this long before a mock start triggers a fresh attempt (avoids hammering a broken provider). */
const MOCK_RETRY_AFTER_MS = 10 * 60 * 1000;
import { scoreAttempt } from "../scoring.js";
import { escapeRegex, unlockHint, type PracticeLevel } from "../governance.js";
import { NO_PROGRESS, topicProgress } from "../practice-progress.js";
import {
  AiUsage,
  AppConfig,
  Conversation,
  DailyMockSet,
  CurrentAffair,
  CurrentAffairReport,
  Exam,
  MemoryItem,
  MockAttempt,
  MockTest,
  PracticeSession,
  PyqPaper,
  Question,
  QuestionReport,
  SyncReceipt,
  Topic,
  User,
} from "../models.js";



export const learningRouter = Router();

learningRouter.use(requireAuth);

function studentId(req: { user?: { id: string; role: string } }) {
  if (!req.user) throw new HttpError(401, "Authentication required", "UNAUTHORIZED");
  if (req.user.role !== "student") throw new HttpError(403, "This area is for student accounts", "FORBIDDEN");
  return req.user.id;
}

function visibleQuestion(question: { id: string; stem: string; options: unknown; difficulty: string; topicId: string; subjectId: string; examId: string; language: string }, reveal = false, extra?: { correctKey: string; explanation: string }) {
  return {
    id: question.id,
    stem: question.stem,
    options: question.options,
    difficulty: question.difficulty,
    topicId: question.topicId,
    subjectId: question.subjectId,
    examId: question.examId,
    language: question.language,
    ...(reveal && extra ? { correctKey: extra.correctKey, explanation: extra.explanation } : {}),
  };
}

/** Errors a student can act on pass through; AI/provider internals become a friendly retry message. */
function friendlyPracticeError(error: unknown): never {
  if (error instanceof HttpError) {
    if (["LEVEL_LOCKED", "NOT_FOUND", "FORBIDDEN", "BAD_REQUEST", "NO_QUESTIONS", "NOTHING_TO_RETRY"].includes(error.code)) throw error;
    if (error.code === "SYLLABUS_EMPTY") throw new HttpError(404, "Topics for this exam are not ready yet. Please check back soon.", "SYLLABUS_EMPTY");
  }
  console.warn(`Practice could not be prepared: ${error instanceof Error ? error.message : error}`);
  throw new HttpError(503, "We couldn't prepare questions right now. Please try again in a minute.", "PRACTICE_UNAVAILABLE");
}

const LEVEL_NAMES: Record<PracticeLevel, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

async function topicNames(ids: string[], language: "en" | "ta") {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const topics = await Topic.find({ id: { $in: unique } }).select("id name nameEn nameTa").lean();
  return new Map(topics.map((topic) => [topic.id, (language === "ta" ? topic.nameTa : topic.nameEn) || topic.name]));
}

learningRouter.post(
  "/practice/sessions",
  wrap(async (req, res) => {
    const body = z
      .object({
        examId: z.string().min(8),
        topicId: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        count: z.number().int().min(1).max(20).optional(),
        /** Re-practise the wrong answers of this earlier set. */
        retryOf: z.string().optional(),
      })
      .parse(req.body);
    const me = studentId(req);

    if (body.retryOf) {
      const original = await PracticeSession.findOne({ id: body.retryOf, studentId: me }).lean();
      if (!original) throw new HttpError(404, "Practice session not found", "NOT_FOUND");
      const wrong = original.answers.filter((answer) => !answer.correct).map((answer) => answer.questionId);
      if (!wrong.length) throw new HttpError(400, "No wrong answers to retry in this set.", "NOTHING_TO_RETRY");
      const rows = await Question.find({ id: { $in: wrong }, ...visibleToStudent(me) }).lean();
      const byId = new Map(rows.map((row) => [row.id, row]));
      const questions = wrong.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
      const session = await PracticeSession.create({
        id: nid(),
        studentId: me,
        examId: original.examId,
        topicId: original.topicId,
        difficulty: original.difficulty,
        kind: "retry",
        retryOf: original.id,
        questionIds: questions.map((question) => question.id),
      });
      return res.status(201).json({
        data: { id: session.id, status: session.status, kind: "retry", topicId: session.topicId, difficulty: session.difficulty, generated: false, repeated: 0, progress: null, questions: questions.map((question) => visibleQuestion(question)) },
      });
    }

    // Levels open topic by topic: Easy always, Medium after Easy is passed, Hard after Medium.
    const progress = await topicProgress(me, body.examId);
    // Without a topic or level, quick practice is Easy (open everywhere), so no level is skipped.
    let difficulty = body.difficulty || (body.topicId ? undefined : "easy");
    let topicIds: string[] | undefined;
    if (body.topicId) {
      const topic = progress.get(body.topicId) || NO_PROGRESS;
      difficulty ||= topic.current;
      if (!topic.levels[difficulty].unlocked) throw new HttpError(403, unlockHint(difficulty), "LEVEL_LOCKED");
    } else if (difficulty && difficulty !== "easy") {
      const level = difficulty;
      const topics = await Topic.find({ examId: body.examId, status: "published" }).select("id").lean();
      topicIds = topics.map((topic) => topic.id).filter((id) => (progress.get(id) || NO_PROGRESS).levels[level].unlocked);
      if (!topicIds.length) {
        throw new HttpError(403, `${LEVEL_NAMES[level]} opens topic by topic. ${unlockHint(level)}`, "LEVEL_LOCKED");
      }
    }

    // Starting a new set closes any unfinished one; its unanswered questions become free again.
    await PracticeSession.updateMany({ studentId: me, examId: body.examId, status: "active" }, { $set: { status: "abandoned", completedAt: new Date() } });
    const count = body.count || 5;
    let prepared;
    try {
      prepared = await ensurePracticeQuestions({ studentId: me, examId: body.examId, topicId: body.topicId, topicIds, difficulty, count });
    } catch (error) {
      friendlyPracticeError(error);
    }
    const session = await PracticeSession.create({
      id: nid(),
      studentId: me,
      examId: body.examId,
      topicId: body.topicId || "",
      difficulty: difficulty || "",
      questionIds: prepared.questions.map((question) => question.id),
    });
    res.status(201).json({
      data: {
        id: session.id,
        status: session.status,
        kind: "practice",
        topicId: session.topicId,
        difficulty: session.difficulty,
        generated: prepared.generatedLive > 0,
        repeated: prepared.repeated,
        progress: body.topicId ? progress.get(body.topicId) || NO_PROGRESS : null,
        questions: prepared.questions.map((question) => visibleQuestion(question)),
      },
    });
  }),
);

/** The unfinished set to offer as "Continue practice", if any. */
learningRouter.get(
  "/practice/active",
  wrap(async (req, res) => {
    const filter: Record<string, unknown> = { studentId: studentId(req), status: "active" };
    if (typeof req.query.examId === "string") filter.examId = req.query.examId;
    const session = await PracticeSession.findOne(filter).sort({ createdAt: -1 }).lean();
    if (!session || session.answers.length >= session.questionIds.length) return res.json({ data: null });
    const names = await topicNames([session.topicId], req.user!.language === "ta" ? "ta" : "en");
    res.json({
      data: {
        id: session.id,
        examId: session.examId,
        kind: session.kind || "practice",
        topicId: session.topicId,
        topicName: names.get(session.topicId) || "",
        difficulty: session.difficulty,
        answered: session.answers.length,
        total: session.questionIds.length,
      },
    });
  }),
);

/**
 * A set with its questions in order. Answered questions carry the student's answer,
 * the correct answer and the explanation (for resume and the result review);
 * unanswered ones stay hidden so they can be served again later.
 */
learningRouter.get(
  "/practice/sessions/:id",
  wrap(async (req, res) => {
    const session = await PracticeSession.findOne({ id: req.params.id, studentId: studentId(req) }).lean();
    if (!session) throw new HttpError(404, "Practice session not found", "NOT_FOUND");
    const questions = await Question.find({ id: { $in: session.questionIds } }).lean();
    const byId = new Map(questions.map((question) => [question.id, question]));
    const answerFor = new Map(session.answers.map((answer) => [answer.questionId, answer]));
    const correctCount = session.answers.filter((answer) => answer.correct).length;
    const answered = session.answers.length;
    // Weakest topic of this set: the one with the most wrong answers, when accuracy is low.
    const wrongByTopic = new Map<string, number>();
    for (const answer of session.answers) {
      const topicId = byId.get(answer.questionId)?.topicId;
      if (!answer.correct && topicId) wrongByTopic.set(topicId, (wrongByTopic.get(topicId) || 0) + 1);
    }
    const weakTopicId = answered && correctCount / answered < 0.7 ? [...wrongByTopic.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "" : "";
    const names = await topicNames([session.topicId, weakTopicId], req.user!.language === "ta" ? "ta" : "en");
    res.json({
      data: {
        id: session.id,
        status: session.status,
        kind: session.kind || "practice",
        examId: session.examId,
        topicId: session.topicId,
        topicName: names.get(session.topicId) || "",
        difficulty: session.difficulty,
        answered,
        correct: correctCount,
        total: session.questionIds.length,
        weakTopic: weakTopicId ? { id: weakTopicId, name: names.get(weakTopicId) || "" } : null,
        questions: session.questionIds
          .map((id) => {
            const question = byId.get(id);
            if (!question) return null;
            const answer = answerFor.get(id);
            return {
              ...visibleQuestion(question, Boolean(answer), question),
              ...(answer ? { yourAnswer: answer.selectedKey, correct: Boolean(answer.correct) } : {}),
            };
          })
          .filter(Boolean),
      },
    });
  }),
);

learningRouter.post(
  "/practice/sessions/:id/answers",
  wrap(async (req, res) => {
    const body = z.object({ questionId: z.string(), selectedKey: z.string().min(1).max(2) }).parse(req.body);
    const session = await PracticeSession.findOne({ id: req.params.id, studentId: studentId(req) });
    if (!session) throw new HttpError(404, "Practice session not found", "NOT_FOUND");
    if (!session.questionIds.includes(body.questionId)) throw new HttpError(400, "Question is not part of this session", "BAD_REQUEST");
    const question = await Question.findOne({ id: body.questionId, ...visibleToStudent(studentId(req)) });
    if (!question) throw new HttpError(404, "Question not found", "NOT_FOUND");
    // The first answer is final: once the correct answer has been shown it cannot be changed.
    const existing = session.answers.find((answer) => answer.questionId === body.questionId);
    if (existing) {
      return res.json({
        data: { questionId: question.id, selectedKey: existing.selectedKey, correct: Boolean(existing.correct), correctKey: question.correctKey, explanation: question.explanation, alreadyAnswered: true },
      });
    }
    if (session.status !== "active") throw new HttpError(409, "This practice session is already complete", "CONFLICT");
    const correct = question.correctKey === body.selectedKey;
    session.answers.push({ questionId: body.questionId, selectedKey: body.selectedKey, correct, answeredAt: new Date(), markedForReview: false });
    await session.save();
    await recordSeen(studentId(req), session.examId, [question.id], "practice");
    // Retries re-answer known questions, so only first-time answers feed the wrong-key signal.
    if (session.kind !== "retry") void recordAnswerStats(question.id, correct).catch(() => undefined);
    res.json({
      data: { questionId: question.id, selectedKey: body.selectedKey, correct, correctKey: question.correctKey, explanation: question.explanation, alreadyAnswered: false },
    });
  }),
);

learningRouter.post(
  "/practice/sessions/:id/complete",
  wrap(async (req, res) => {
    const me = studentId(req);
    const session = await PracticeSession.findOne({ id: req.params.id, studentId: me });
    if (!session) throw new HttpError(404, "Practice session not found", "NOT_FOUND");
    if (session.status === "active") {
      session.status = "completed";
      session.completedAt = new Date();
      await session.save();
    }
    const correct = session.answers.filter((answer) => answer.correct).length;
    // Level standing of the topics practised in this set, for the result screen.
    const answeredIds = session.answers.map((answer) => answer.questionId);
    const topicIds = [...new Set((await Question.find({ id: { $in: answeredIds } }).select("topicId").lean()).map((row) => row.topicId))];
    const [progress, names] = await Promise.all([topicProgress(me, session.examId), topicNames(topicIds, req.user!.language === "ta" ? "ta" : "en")]);
    res.json({
      data: {
        id: session.id,
        status: session.status,
        kind: session.kind || "practice",
        correct,
        answered: session.answers.length,
        total: session.questionIds.length,
        topics: topicIds.map((topicId) => ({ topicId, name: names.get(topicId) || "", ...(progress.get(topicId) || NO_PROGRESS) })),
      },
    });
  }),
);

/** Reports needed before a question is hidden from everyone pending admin review. */
const REPORTS_TO_HIDE = 3;

learningRouter.post(
  "/questions/:id/report",
  wrap(async (req, res) => {
    const body = z.object({ reason: z.enum(["wrong_answer", "unclear", "other"]), note: z.string().max(500).optional() }).parse(req.body);
    const me = studentId(req);
    // Flagged questions can still be reported (they were visible when the student saw them).
    const question = await Question.findOne({ id: req.params.id, $or: visibleToStudent(me).$or }).select("id reportCount flagged reviewedBy").lean();
    if (!question) throw new HttpError(404, "Question not found", "NOT_FOUND");
    try {
      await QuestionReport.create({ id: nid(), questionId: question.id, studentId: me, reason: body.reason, note: body.note || "" });
    } catch (error) {
      // One report per student per question.
      if ((error as { code?: number }).code === 11000) return res.json({ data: { reported: true, alreadyReported: true } });
      throw error;
    }
    const updated = await Question.findOneAndUpdate({ id: question.id }, { $inc: { reportCount: 1 } }, { new: true }).lean();
    if (updated && !updated.flagged && (updated.reportCount || 0) >= REPORTS_TO_HIDE) {
      await Question.updateOne({ id: question.id }, { $set: { flagged: true, flagReason: `${updated.reportCount} student reports` } });
    }
    res.status(201).json({ data: { reported: true, alreadyReported: false } });
  }),
);

/** Reports on one current-affairs item before it is hidden from everyone. */
const CA_REPORTS_TO_HIDE = 2;

/**
 * Published current affairs in the student's exam language.
 * - no filter: the latest published day
 * - ?day=YYYY-MM-DD: one day
 * - ?from=YYYY-MM-DD&to=YYYY-MM-DD: a date range (newest first, up to 300 items)
 * - ?category=…: one category, combined with any of the above
 */
learningRouter.get(
  "/current-affairs",
  wrap(async (req, res) => {
    studentId(req);
    const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const category = typeof req.query.category === "string" && /^[a-z]{3,20}$/.test(req.query.category) ? req.query.category : "";
    const base: Record<string, unknown> = { status: "published", ...(category ? { category } : {}) };
    const days = (await CurrentAffair.distinct("newsDay", { status: "published" })).sort().reverse().slice(0, 14) as string[];
    let from = "";
    let to = "";
    if (isDay(req.query.from) || isDay(req.query.to)) {
      from = isDay(req.query.from) ? req.query.from : "0000-01-01";
      to = isDay(req.query.to) ? req.query.to : "9999-12-31";
      if (from > to) [from, to] = [to, from];
    } else {
      const latest = isDay(req.query.day)
        ? req.query.day
        : (await CurrentAffair.findOne(base).sort({ newsDay: -1 }).select("newsDay").lean())?.newsDay || "";
      from = latest;
      to = latest;
    }
    if (!from) return res.json({ data: { day: "", from: "", to: "", days, items: [] } });
    const lang = req.user!.language === "ta" ? "ta" : "en";
    const rows = await CurrentAffair.find({ ...base, newsDay: { $gte: from, $lte: to } })
      .sort({ newsDay: -1, order: 1 })
      .limit(300)
      .lean();
    const items = rows.map((row) => {
      const text = lang === "ta" && row.ta?.title ? row.ta : row.en;
      return {
        id: row.id,
        newsDay: row.newsDay,
        category: row.category,
        title: text?.title || "",
        points: text?.points || [],
        quiz: text?.quiz || null,
        sources: (row.sources || []).map((source) => ({ title: source.title || "", url: source.url || "" })),
      };
    });
    res.json({ data: { day: from === to ? from : "", from, to, days, items } });
  }),
);

learningRouter.post(
  "/current-affairs/:id/report",
  wrap(async (req, res) => {
    const me = studentId(req);
    const item = await CurrentAffair.findOne({ id: req.params.id, status: "published" }).select("id").lean();
    if (!item) throw new HttpError(404, "Item not found", "NOT_FOUND");
    try {
      await CurrentAffairReport.create({ id: nid(), itemId: item.id, studentId: me });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return res.json({ data: { reported: true, alreadyReported: true } });
      throw error;
    }
    const updated = await CurrentAffair.findOneAndUpdate({ id: item.id }, { $inc: { reportCount: 1 } }, { new: true }).lean();
    if (updated && (updated.reportCount || 0) >= CA_REPORTS_TO_HIDE) {
      await CurrentAffair.updateOne({ id: item.id }, { $set: { status: "hidden" } });
    }
    res.status(201).json({ data: { reported: true, alreadyReported: false } });
  }),
);

learningRouter.get(
  "/practice/history",
  wrap(async (req, res) => {
    const sessions = await PracticeSession.find({ studentId: studentId(req) }).sort({ createdAt: -1 }).limit(30).lean();
    const names = await topicNames(sessions.map((session) => session.topicId), req.user!.language === "ta" ? "ta" : "en");
    res.json({
      data: sessions.map((session) => ({
        id: session.id,
        examId: session.examId,
        status: session.status,
        kind: session.kind || "practice",
        topicId: session.topicId,
        topicName: names.get(session.topicId) || "",
        difficulty: session.difficulty,
        total: session.questionIds.length,
        answered: session.answers.length,
        correct: session.answers.filter((answer) => answer.correct).length,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
      })),
    });
  }),
);

learningRouter.get(
  "/mocks",
  wrap(async (req, res) => {
    // Only the daily mock of the student's own exams (primary first); built from each exam's pattern.
    let mocks = await studentDailyMocks(studentId(req));
    if (typeof req.query.examId === "string") mocks = mocks.filter((mock) => mock.examId === req.query.examId);
    const today = dayKey();
    const [attempts, sets] = await Promise.all([
      MockAttempt.find({ studentId: studentId(req), mockId: { $in: mocks.map((mock) => mock.id) } }).sort({ createdAt: -1 }).lean(),
      DailyMockSet.find({ studentId: studentId(req), dayKey: today, mockId: { $in: mocks.map((mock) => mock.id) } })
        .select("mockId status target progress error updatedAt startedAt questionIds")
        .lean(),
    ]);
    const setFor = new Map(sets.map((set) => [set.mockId, set]));
    res.json({
      data: mocks.map((mock) => {
        const mine = attempts.filter((attempt) => attempt.mockId === mock.id);
        const todayAttempt = mine.find((attempt) => attempt.dayKey === today);
        const lastSubmitted = mine.find((attempt) => attempt.status === "submitted");
        const set = setFor.get(mock.id);
        const stalled = set?.status === "generating" && generatingAgeMs(set) >= DAILY_SET_STALE_MS;
        return {
          id: mock.id,
          examId: mock.examId,
          title: mock.title,
          durationMinutes: mock.durationMinutes,
          questionCount: set?.status === "ready" ? set.questionIds.length : set?.target || patternCount(mock.instructions),
          marksPerQuestion: mock.marksPerQuestion,
          negativeMarks: mock.negativeMarks,
          instructions: mock.instructions,
          todayStatus: todayAttempt?.status || "available",
          /** ready = today's personal set is generated; generating = being prepared now. */
          todaySet: !set || stalled ? "not_prepared" : set.status,
          preparation: set ? { done: set.progress || 0, total: set.target || 0, error: set.status === "failed" ? set.error : "" } : null,
          todayAttemptId: todayAttempt?.id || "",
          lastScore: lastSubmitted ? { rawScore: lastSubmitted.rawScore, maxScore: lastSubmitted.maxScore } : null,
        };
      }),
    });
  }),
);

/** Question count stated in a daily mock's first instruction ("200 questions · …"). */
function patternCount(instructions: string[] = []) {
  return Number(/^(\d+) questions/.exec(instructions[0] || "")?.[1] || 0);
}

learningRouter.post(
  "/mocks/:id/start",
  wrap(async (req, res) => {
    const mock = await MockTest.findOne({ id: req.params.id, status: "published", kind: "daily" });
    if (!mock) throw new HttpError(404, "Mock test not found", "NOT_FOUND");
    const me = await User.findOne({ id: studentId(req) }).select("primaryExamId examIds").lean();
    if (!me || (me.primaryExamId !== mock.examId && !(me.examIds || []).includes(mock.examId))) {
      throw new HttpError(403, "This mock belongs to an exam you have not selected.", "FORBIDDEN");
    }
    const today = dayKey();
    const existing = await MockAttempt.findOne({ studentId: studentId(req), mockId: mock.id, dayKey: today });
    if (existing?.status === "submitted") {
      throw new HttpError(409, "You already submitted this mock today. One attempt is allowed per mock per day.", "DAILY_LIMIT");
    }

    if (existing && existing.status === "in_progress" && existing.deadlineAt < new Date()) {
      await submitAttempt(existing);
      throw new HttpError(409, "Time ran out on today's attempt. It was submitted with your saved answers.", "TIME_UP");
    }
    if (existing) {
      const ids = attemptQuestionIds(existing, mock);
      const questions = await Question.find({ id: { $in: ids } }).select("-correctKey -explanation").lean();
      return res.json({ data: presentAttempt(existing, questions, ids) });
    }

    // Freeze the question set and marking rules on the attempt; never mutate the shared mock.
    // The mock is always today's personal set built from the exam pattern — never a partial bank sample.
    const owner = studentId(req);
    const dailySet = await DailyMockSet.findOne({ studentId: owner, mockId: mock.id, dayKey: today }).lean();
    if (dailySet?.status !== "ready" || !dailySet.questionIds.length) {
      const inProgress = dailySet?.status === "generating" && generatingAgeMs(dailySet) < DAILY_SET_STALE_MS;
      const recentFailure = dailySet?.status === "failed" && generatingAgeMs(dailySet) < MOCK_RETRY_AFTER_MS;
      if (recentFailure) {
        throw new HttpError(503, `Today's mock could not be prepared: ${dailySet.error || "AI provider error"}. It will be retried shortly.`, "MOCK_UNAVAILABLE");
      }
      if (!inProgress) {
        // Not started yet (new student, missed run) or abandoned: build it now in the background.
        void generateDailyMockSet({ studentId: owner, mockId: mock.id, dayKey: today }).catch((error) =>
          console.warn(`Daily mock for ${owner} failed: ${error instanceof Error ? error.message : error}`),
        );
      }
      const done = dailySet?.progress || 0;
      const total = dailySet?.target || 0;
      throw new HttpError(
        409,
        total ? `Today's mock is being prepared (${done} of ${total} questions). Please try again in a few minutes.` : "Today's mock is being prepared. Please try again in a few minutes.",
        "MOCK_PREPARING",
      );
    }
    const questionIds = [...dailySet.questionIds];
    let attempt;
    try {
      attempt = await MockAttempt.create({
        id: nid(),
        mockId: mock.id,
        studentId: studentId(req),
        dayKey: today,
        questionIds,
        marksPerQuestion: mock.marksPerQuestion,
        negativeMarks: mock.negativeMarks,
        deadlineAt: new Date(Date.now() + mock.durationMinutes * 60 * 1000),
        idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "",
      });
    } catch (error) {
      // A double click or retry raced us to the unique (student, mock, day) index: reuse that attempt.
      if ((error as { code?: number }).code !== 11000) throw error;
      const raced = await MockAttempt.findOne({ studentId: studentId(req), mockId: mock.id, dayKey: today });
      if (!raced) throw error;
      attempt = raced;
    }
    const ids = attemptQuestionIds(attempt, mock);
    const questions = await Question.find({ id: { $in: ids } }).select("-correctKey -explanation").lean();
    res.status(201).json({ data: presentAttempt(attempt, questions, ids) });
  }),
);

/** Attempts created before snapshots existed fall back to the mock's current list. */
function attemptQuestionIds(attempt: { questionIds?: string[] | null }, mock?: { questionIds?: string[] } | null): string[] {
  return attempt.questionIds?.length ? [...attempt.questionIds] : [...(mock?.questionIds || [])];
}

function attemptRules(
  attempt: { marksPerQuestion?: number | null; negativeMarks?: number | null },
  mock?: { marksPerQuestion?: number; negativeMarks?: number } | null,
) {
  return {
    marksPerQuestion: attempt.marksPerQuestion ?? mock?.marksPerQuestion ?? 1,
    negativeMarks: attempt.negativeMarks ?? mock?.negativeMarks ?? 0,
  };
}

/** Topics with the most wrong or skipped answers in a submitted attempt. */
async function weakAreas(
  answers: Array<{ questionId: string; selectedKey?: string | null; correct?: boolean | null }>,
  byQuestionId: Map<string, { topicId: string }>,
) {
  const tally = new Map<string, { total: number; correct: number }>();
  for (const answer of answers) {
    const question = byQuestionId.get(answer.questionId);
    if (!question?.topicId) continue;
    const row = tally.get(question.topicId) || { total: 0, correct: 0 };
    row.total += 1;
    if (answer.correct) row.correct += 1;
    tally.set(question.topicId, row);
  }
  const topics = await Topic.find({ id: { $in: [...tally.keys()] } }).select("id name nameEn").lean();
  const names = new Map(topics.map((topic) => [topic.id, topic.nameEn || topic.name]));
  return [...tally.entries()]
    .map(([topicId, row]) => ({
      topicId,
      topic: names.get(topicId) || "Topic",
      attempted: row.total,
      accuracy: Math.round((row.correct / row.total) * 100),
    }))
    .filter((row) => row.accuracy < 60)
    .sort((left, right) => left.accuracy - right.accuracy)
    .slice(0, 5);
}

function presentAttempt(
  attempt: { id: string; mockId: string; status: string; deadlineAt: Date; answers: unknown; startedAt: Date },
  questions: unknown[],
  order: string[],
) {
  const byId = new Map((questions as Array<{ id: string }>).map((question) => [question.id, question]));
  return {
    id: attempt.id,
    mockId: attempt.mockId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    answers: attempt.answers,
    questions: order.map((id) => byId.get(id)).filter(Boolean),
  };
}

learningRouter.put(
  "/mocks/attempts/:id",
  wrap(async (req, res) => {
    const body = z
      .object({
        answers: z.array(z.object({ questionId: z.string(), selectedKey: z.string().optional(), markedForReview: z.boolean().optional() })),
        idempotencyKey: z.string().optional(),
      })
      .parse(req.body);
    const attempt = await MockAttempt.findOne({ id: req.params.id, studentId: studentId(req) });
    if (!attempt) throw new HttpError(404, "Attempt not found", "NOT_FOUND");
    if (attempt.status !== "in_progress") return res.json({ data: { id: attempt.id, status: attempt.status, saved: true } });
    if (attempt.deadlineAt < new Date()) {
      await submitAttempt(attempt);
      throw new HttpError(409, "Time is up. The attempt was submitted with saved answers.", "TIME_UP");
    }
    const mock = attempt.questionIds?.length ? null : await MockTest.findOne({ id: attempt.mockId }).lean();
    const allowed = new Set(attemptQuestionIds(attempt, mock));
    const byId = new Map(
      (attempt.answers as Array<{ questionId: string; selectedKey?: string; markedForReview?: boolean; correct?: boolean; answeredAt?: Date }>).map(
        (answer) => [answer.questionId, answer],
      ),
    );
    for (const incoming of body.answers) {
      if (!allowed.has(incoming.questionId)) continue;
      const prior = byId.get(incoming.questionId);
      if (prior) {
        if (typeof incoming.selectedKey === "string") prior.selectedKey = incoming.selectedKey;
        if (typeof incoming.markedForReview === "boolean") prior.markedForReview = incoming.markedForReview;
        prior.answeredAt = new Date();
      } else {
        byId.set(incoming.questionId, {
          questionId: incoming.questionId,
          selectedKey: incoming.selectedKey || "",
          markedForReview: Boolean(incoming.markedForReview),
          correct: false,
          answeredAt: new Date(),
        });
      }
    }
    attempt.set("answers", [...byId.values()]);
    if (body.idempotencyKey) attempt.idempotencyKey = body.idempotencyKey;
    await attempt.save();
    res.json({ data: { id: attempt.id, status: attempt.status, saved: true, deadlineAt: attempt.deadlineAt } });
  }),
);

async function submitAttempt(attempt: any) {
  if (attempt.status === "submitted") return attempt;
  const mock = await MockTest.findOne({ id: attempt.mockId }).lean();
  if (!mock && !attempt.questionIds?.length) throw new HttpError(404, "Mock test not found", "NOT_FOUND");
  const questionIds = attemptQuestionIds(attempt, mock);
  const questions = await Question.find({ id: { $in: questionIds } }).lean();
  const byQuestionId = new Map(questions.map((question) => [question.id, question]));
  const selected = new Map(
    (attempt.answers as Array<{ selectedKey?: string; questionId: string }>)
      .filter((answer) => answer.selectedKey)
      .map((answer) => [answer.questionId, answer.selectedKey]),
  );
  const states = questionIds.map((questionId) => {
    const question = byQuestionId.get(questionId);
    const choice = selected.get(questionId);
    if (!question || !choice) return null;
    return question.correctKey === choice;
  });
  const scored = scoreAttempt(states, attemptRules(attempt, mock));
  attempt.set("answers", questionIds.map((questionId: string) => {
    const question = byQuestionId.get(questionId);
    const choice = selected.get(questionId) || "";
    return {
      questionId,
      selectedKey: choice,
      markedForReview: false,
      correct: Boolean(choice && question && question.correctKey === choice),
      answeredAt: new Date(),
    };
  }));
  attempt.status = "submitted";
  attempt.submittedAt = new Date();
  attempt.rawScore = scored.rawScore;
  attempt.maxScore = scored.maxScore;
  attempt.correctCount = scored.correct;
  attempt.incorrectCount = scored.incorrect;
  attempt.unansweredCount = scored.unanswered;
  await attempt.save();
  return attempt;
}

learningRouter.post(
  "/mocks/attempts/:id/submit",
  wrap(async (req, res) => {
    const attempt = await MockAttempt.findOne({ id: req.params.id, studentId: studentId(req) });
    if (!attempt) throw new HttpError(404, "Attempt not found", "NOT_FOUND");
    const key = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "";
    if (attempt.status === "submitted") return res.json({ data: resultPayload(attempt) });
    if (key) attempt.idempotencyKey = key;
    await submitAttempt(attempt);
    res.json({ data: resultPayload(attempt) });
  }),
);

function resultPayload(attempt: any) {
  return {
    id: attempt.id,
    mockId: attempt.mockId,
    status: attempt.status,
    rawScore: attempt.rawScore,
    maxScore: attempt.maxScore,
    correct: attempt.correctCount,
    incorrect: attempt.incorrectCount,
    unanswered: attempt.unansweredCount,
    submittedAt: attempt.submittedAt,
  };
}

learningRouter.get(
  "/mocks/attempts/:id",
  wrap(async (req, res) => {
    const attempt = await MockAttempt.findOne({ id: req.params.id, studentId: studentId(req) });
    if (!attempt) throw new HttpError(404, "Attempt not found", "NOT_FOUND");
    if (attempt.status === "in_progress" && attempt.deadlineAt < new Date()) await submitAttempt(attempt);
    if (attempt.status === "submitted") return res.json({ data: { id: attempt.id, status: attempt.status, redirect: "result" } });
    const mock = attempt.questionIds?.length ? null : await MockTest.findOne({ id: attempt.mockId }).lean();
    const ids = attemptQuestionIds(attempt, mock);
    const questions = await Question.find({ id: { $in: ids } }).select("-correctKey -explanation").lean();
    res.json({ data: presentAttempt(attempt, questions, ids) });
  }),
);

learningRouter.get(
  "/mocks/attempts/:id/result",
  wrap(async (req, res) => {
    const attempt = await MockAttempt.findOne({ id: req.params.id, studentId: studentId(req) }).lean();
    if (!attempt) throw new HttpError(404, "Attempt not found", "NOT_FOUND");
    if (attempt.status !== "submitted") throw new HttpError(409, "Submit the attempt before reviewing answers", "CONFLICT");
    const mock = await MockTest.findOne({ id: attempt.mockId }).lean();
    const ids = attemptQuestionIds(attempt, mock);
    const questions = await Question.find({ id: { $in: ids } }).lean();
    const byQuestionId = new Map(questions.map((question) => [question.id, question]));
    res.json({
      data: {
        ...resultPayload(attempt),
        title: mock?.title,
        weakAreas: await weakAreas(attempt.answers, byQuestionId),
        questions: ids.map((id) => {
          const question = byQuestionId.get(id);
          const answer = attempt.answers.find((item) => item.questionId === id);
          if (!question) return null;
          return {
            id: question.id,
            stem: question.stem,
            options: question.options,
            selectedKey: answer?.selectedKey || "",
            correctKey: question.correctKey,
            explanation: question.explanation,
            correct: Boolean(answer?.correct),
          };
        }).filter(Boolean),
      },
    });
  }),
);

learningRouter.get(
  "/pyq",
  wrap(async (req, res) => {
    const filter: Record<string, unknown> = { status: "published", rightsStatus: "verified" };
    if (typeof req.query.examId === "string") filter.examId = req.query.examId;
    const papers = await PyqPaper.find(filter).sort({ year: -1 }).lean();
    res.json({
      data: papers.map((paper) => ({
        id: paper.id,
        examId: paper.examId,
        title: paper.title,
        year: paper.year,
        sourceName: paper.sourceName,
        questionCount: paper.questionIds.length,
        note: paper.note,
      })),
    });
  }),
);

learningRouter.get(
  "/pyq/:id",
  wrap(async (req, res) => {
    const paper = await PyqPaper.findOne({ id: req.params.id, status: "published", rightsStatus: "verified" }).lean();
    if (!paper) throw new HttpError(404, "PYQ paper is not available", "NOT_FOUND");
    const questions = await Question.find({ id: { $in: paper.questionIds }, status: "published" }).lean();
    // Never expose keys/explanations before submit.
    res.json({
      data: {
        id: paper.id,
        examId: paper.examId,
        title: paper.title,
        year: paper.year,
        sourceName: paper.sourceName,
        note: paper.note,
        questionCount: paper.questionIds.length,
        questions: paper.questionIds
          .map((id) => questions.find((question) => question.id === id))
          .filter(Boolean)
          .map((question) => ({
            id: question!.id,
            stem: question!.stem,
            options: question!.options,
          })),
      },
    });
  }),
);

learningRouter.post(
  "/pyq/:id/submit",
  wrap(async (req, res) => {
    const body = z
      .object({
        answers: z.array(z.object({ questionId: z.string(), selectedKey: z.string().min(1).max(2) })).min(1),
      })
      .parse(req.body);
    const paper = await PyqPaper.findOne({ id: req.params.id, status: "published", rightsStatus: "verified" }).lean();
    if (!paper) throw new HttpError(404, "PYQ paper is not available", "NOT_FOUND");
    const allowed = new Set(paper.questionIds);
    for (const answer of body.answers) {
      if (!allowed.has(answer.questionId)) {
        throw new HttpError(400, "Answer includes a question outside this paper", "BAD_REQUEST");
      }
    }
    const questions = await Question.find({ id: { $in: paper.questionIds }, status: "published" }).lean();
    const byId = new Map(questions.map((question) => [question.id, question]));
    const pick = new Map(body.answers.map((answer) => [answer.questionId, answer.selectedKey]));
    const review = paper.questionIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((question) => {
        const selectedKey = pick.get(question!.id) || "";
        const correct = selectedKey === question!.correctKey;
        return {
          id: question!.id,
          stem: question!.stem,
          options: question!.options,
          selectedKey,
          correct,
          correctKey: question!.correctKey,
          explanation: question!.explanation,
        };
      });
    const correctCount = review.filter((item) => item.correct).length;
    res.json({
      data: {
        paperId: paper.id,
        total: review.length,
        answered: body.answers.length,
        correct: correctCount,
        questions: review,
      },
    });
  }),
);

learningRouter.post(
  "/tutor/messages",
  wrap(async (req, res) => {
    const body = z
      .object({
        message: z.string().trim().min(1).max(4000),
        conversationId: z.string().optional(),
        language: z.enum(["en", "ta", "tanglish"]).optional(),
        examId: z.string().optional(),
        attachment: z.object({
          name: z.string().min(1).max(180),
          mimeType: z.string().min(3).max(100),
          base64: z.string().min(1).max(800_000),
        }).optional(),
      })
      .parse(req.body);
    const [storedSettings, conversationFound] = await Promise.all([
      AppConfig.findOne({ id: "app" }).lean(),
      body.conversationId ? Conversation.findOne({ id: body.conversationId, studentId: studentId(req) }) : Promise.resolve(null),
      assertAiBudgetAvailable("AI Tutor"),
    ]);
    const settings = storedSettings || {
      aiProvider: "local" as "local" | "chatgpt" | "openai" | "gemini" | "ollama",
      chatgptEnabled: false as boolean | undefined,
      geminiEnabled: false as boolean | undefined,
      activePrompt: "You are ArivuVazhi, a calm government-exam tutor.",
    };
    const replyLanguage = detectStudentLanguage(body.message);
    let conversation = conversationFound;
    if (body.conversationId && !conversation) throw new HttpError(404, "Conversation not found", "NOT_FOUND");
    if (!conversation) {
      conversation = await Conversation.create({
        id: nid(),
        studentId: studentId(req),
        examId: body.examId || req.user!.primaryExamId || "",
        language: replyLanguage,
        title: body.message.slice(0, 80),
        messages: [],
      });
    } else {
      conversation.language = replyLanguage;
    }
    const chatgptOn = settings.chatgptEnabled ?? settings.aiProvider === "chatgpt";
    const geminiOn = settings.geminiEnabled ?? settings.aiProvider === "gemini";
    let provider = (settings.aiProvider || "local") as "local" | "chatgpt" | "openai" | "gemini" | "ollama";
    if (provider === "chatgpt" && !chatgptOn) provider = geminiOn ? "gemini" : "local";
    if (provider === "gemini" && !geminiOn) provider = chatgptOn ? "chatgpt" : "local";
    const history = (conversation.messages || [])
      .slice(-8)
      .map((item) => ({
        role: (item.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: String(item.content || ""),
      }))
      .filter((item) => item.content.trim().length > 0);
    const reply = await tutorReply({
      studentId: studentId(req),
      message: body.message,
      examId: conversation.examId || body.examId || req.user!.primaryExamId || "",
      provider,
      prompt: settings.activePrompt || "You are ArivuVazhi, a calm government-exam tutor.",
      history,
      attachment: body.attachment,
      useMemory: Boolean(req.user!.aiMemoryEnabled),
    });
    conversation.messages.push({ role: "user", content: body.message, sources: [], createdAt: new Date() });
    conversation.messages.push({ role: "assistant", content: reply.answer, sources: reply.sources.map((source) => source.title), createdAt: new Date() });
    const weak = req.user!.aiMemoryEnabled && /weak|struggle|difficult|கடினம்|புரியல/i.test(body.message);
    await Promise.all([
      conversation.save(),
      weak
        ? MemoryItem.create({ id: nid(), studentId: studentId(req), text: `Asked for help: ${body.message.slice(0, 180)}` })
        : Promise.resolve(),
      AiUsage.create({
      id: nid(),
      userId: studentId(req),
      provider: reply.providerUsed,
      feature: "tutor",
      tokens: reply.tokens,
      estimatedInr: estimateAiInr(reply.tokens, reply.providerUsed),
      }),
    ]);
    res.json({
      data: {
        conversationId: conversation.id,
        reply: reply.answer,
        sources: reply.sources,
        provider: reply.providerUsed,
        aiAvailable: reply.aiAvailable,
      },
    });
  }),
);

learningRouter.post(
  "/tutor/transcribe",
  wrap(async (req, res) => {
    const body = z.object({
      name: z.string().min(1).max(180),
      mimeType: z.string().min(3).max(100),
      base64: z.string().min(1).max(800_000),
    }).parse(req.body);
    studentId(req);
    await assertAiBudgetAvailable("Voice input");
    const text = await transcribeAudio(body);
    if (!text) throw new HttpError(503, "Voice transcription needs a valid OpenAI API key and a supported audio recording.", "AI_UNAVAILABLE");
    const tokens = Math.ceil(text.length / 4);
    await AiUsage.create({ id: nid(), userId: studentId(req), provider: "openai", feature: "transcribe", tokens, estimatedInr: estimateAiInr(tokens, "openai") });
    res.json({ data: { text } });
  }),
);

learningRouter.get(
  "/tutor/conversations",
  wrap(async (req, res) => {
    const filter: Record<string, unknown> = { studentId: studentId(req) };
    if (typeof req.query.examId === "string" && req.query.examId) filter.examId = req.query.examId;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (q) {
      const pattern = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ title: pattern }, { "messages.content": pattern }];
    }
    const filtered = await Conversation.find(filter)
      .sort({ updatedAt: -1 })
      .limit(40)
      .select({ id: 1, title: 1, examId: 1, language: 1, updatedAt: 1, messages: { $slice: -1 } })
      .lean();
    res.json({
      data: filtered.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        examId: conversation.examId,
        language: conversation.language,
        updatedAt: conversation.updatedAt,
        preview: conversation.messages.at(-1)?.content?.slice(0, 140) || "",
      })),
    });
  }),
);

learningRouter.get(
  "/tutor/conversations/:id",
  wrap(async (req, res) => {
    const conversation = await Conversation.findOne({ id: req.params.id, studentId: studentId(req) }).lean();
    if (!conversation) throw new HttpError(404, "Conversation not found", "NOT_FOUND");
    res.json({ data: conversation });
  }),
);

learningRouter.get(
  "/tutor/memory",
  wrap(async (req, res) => {
    const items = await MemoryItem.find({ studentId: studentId(req) }).sort({ createdAt: -1 }).lean();
    const user = await User.findOne({ id: studentId(req) }).lean();
    res.json({ data: { enabled: Boolean(user?.aiMemoryEnabled), items } });
  }),
);

learningRouter.patch(
  "/tutor/memory",
  wrap(async (req, res) => {
    const body = z
      .object({
        enabled: z.boolean().optional(),
        items: z.array(z.object({ id: z.string(), text: z.string().trim().min(1).max(500) })).optional(),
      })
      .parse(req.body);
    if (typeof body.enabled === "boolean") {
      await User.updateOne({ id: studentId(req) }, { aiMemoryEnabled: body.enabled });
    }
    if (body.items) {
      for (const item of body.items) {
        await MemoryItem.updateOne({ id: item.id, studentId: studentId(req) }, { text: item.text });
      }
    }
    const items = await MemoryItem.find({ studentId: studentId(req) }).lean();
    const user = await User.findOne({ id: studentId(req) }).lean();
    res.json({ data: { enabled: Boolean(user?.aiMemoryEnabled), items } });
  }),
);

learningRouter.delete(
  "/tutor/memory/:id",
  wrap(async (req, res) => {
    const result = await MemoryItem.deleteOne({ id: req.params.id, studentId: studentId(req) });
    if (!result.deletedCount) throw new HttpError(404, "Memory item not found", "NOT_FOUND");
    res.json({ data: { removed: true } });
  }),
);

learningRouter.post(
  "/tutor/memory/reset",
  wrap(async (req, res) => {
    await MemoryItem.deleteMany({ studentId: studentId(req) });
    res.json({ data: { reset: true } });
  }),
);

learningRouter.post(
  "/sync",
  wrap(async (req, res) => {
    const body = z
      .object({
        idempotencyKey: z.string().min(8).max(80),
        practiceAnswers: z
          .array(z.object({ sessionId: z.string(), questionId: z.string(), selectedKey: z.string() }))
          .max(100)
          .default([]),
        completeSessionIds: z.array(z.string()).max(20).default([]),
      })
      .parse(req.body);
    const prior = await SyncReceipt.findOne({ studentId: studentId(req), idempotencyKey: body.idempotencyKey }).lean();
    if (prior) return res.json(prior.response);
    const applied: string[] = [];
    const skipped: string[] = [];
    for (const item of body.practiceAnswers) {
      const session = await PracticeSession.findOne({ id: item.sessionId, studentId: studentId(req) });
      const question = await Question.findOne({ id: item.questionId, ...visibleToStudent(studentId(req)) });
      if (!session || session.status !== "active" || !question || !session.questionIds.includes(question.id)) {
        skipped.push(item.questionId);
        continue;
      }
      // The first answer is final, offline as online.
      if (session.answers.some((answer) => answer.questionId === question.id)) {
        skipped.push(item.questionId);
        continue;
      }
      const correct = question.correctKey === item.selectedKey;
      session.answers.push({ questionId: question.id, selectedKey: item.selectedKey, correct, answeredAt: new Date(), markedForReview: false });
      await session.save();
      await recordSeen(studentId(req), session.examId, [question.id], "practice");
      if (session.kind !== "retry") void recordAnswerStats(question.id, correct).catch(() => undefined);
      applied.push(question.id);
    }
    let completed = 0;
    for (const sessionId of body.completeSessionIds) {
      const session = await PracticeSession.findOne({ id: sessionId, studentId: studentId(req) });
      if (!session) continue;
      if (session.status === "active") {
        session.status = "completed";
        session.completedAt = new Date();
        await session.save();
      }
      completed += 1;
    }
    const response = { data: { applied: applied.length, skipped: skipped.length, completed, serverAuthoritative: true } };
    await SyncReceipt.create({ id: nid(), studentId: studentId(req), idempotencyKey: body.idempotencyKey, response });
    res.json(response);
  }),
);
