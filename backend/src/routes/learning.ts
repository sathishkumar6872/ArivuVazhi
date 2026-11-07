import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { detectStudentLanguage, transcribeAudio, tutorReply } from "../ai.js";
import { assertAiBudgetAvailable, estimateAiInr } from "../ai-budget.js";
import { dayKey, HttpError, nid, wrap } from "../http.js";
import { ensureMockQuestions, ensurePracticeQuestions } from "../question-ai.js";
import { scoreAttempt } from "../scoring.js";
import {
  AiUsage,
  AppConfig,
  Conversation,
  Exam,
  MemoryItem,
  MockAttempt,
  MockTest,
  PracticeSession,
  PyqPaper,
  Question,
  SyncReceipt,
  User,
} from "../models.js";

/** Session-safe: published bank + learner AI items still under review. */
const SESSION_QUESTION_STATUS = { $in: ["published", "under_review"] } as const;

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

learningRouter.post(
  "/practice/sessions",
  wrap(async (req, res) => {
    const body = z
      .object({
        examId: z.string().min(8),
        topicId: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        count: z.number().int().min(1).max(20).optional(),
      })
      .parse(req.body);
    const count = body.count || 5;
    const picked = await ensurePracticeQuestions({
      studentId: studentId(req),
      examId: body.examId,
      topicId: body.topicId,
      difficulty: body.difficulty,
      count,
    });
    const session = await PracticeSession.create({
      id: nid(),
      studentId: studentId(req),
      examId: body.examId,
      topicId: body.topicId || "",
      difficulty: body.difficulty || "",
      questionIds: picked.map((question) => question.id),
    });
    res.status(201).json({
      data: {
        id: session.id,
        status: session.status,
        generated: picked.some((question) => question.source === "student_ai"),
        questions: picked.map((question) => visibleQuestion(question)),
      },
    });
  }),
);

learningRouter.get(
  "/practice/sessions/:id",
  wrap(async (req, res) => {
    const session = await PracticeSession.findOne({ id: req.params.id, studentId: studentId(req) }).lean();
    if (!session) throw new HttpError(404, "Practice session not found", "NOT_FOUND");
    const questions = await Question.find({ id: { $in: session.questionIds } }).lean();
    const byId = new Map(questions.map((question) => [question.id, question]));
    res.json({
      data: {
        id: session.id,
        status: session.status,
        examId: session.examId,
        answers: session.answers,
        questions: session.questionIds.map((id) => {
          const question = byId.get(id);
          if (!question) return null;
          const answered = session.answers.find((answer) => answer.questionId === id);
          return visibleQuestion(question, Boolean(answered), question);
        }).filter(Boolean),
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
    if (session.status !== "active") throw new HttpError(409, "This practice session is already complete", "CONFLICT");
    if (!session.questionIds.includes(body.questionId)) throw new HttpError(400, "Question is not part of this session", "BAD_REQUEST");
    const question = await Question.findOne({ id: body.questionId, status: SESSION_QUESTION_STATUS });
    if (!question) throw new HttpError(404, "Question not found", "NOT_FOUND");
    const correct = question.correctKey === body.selectedKey;
    const existing = session.answers.find((answer) => answer.questionId === body.questionId);
    if (existing) {
      existing.selectedKey = body.selectedKey;
      existing.correct = correct;
      existing.answeredAt = new Date();
    } else {
      session.answers.push({ questionId: body.questionId, selectedKey: body.selectedKey, correct, answeredAt: new Date(), markedForReview: false });
    }
    await session.save();
    res.json({
      data: {
        questionId: question.id,
        selectedKey: body.selectedKey,
        correct,
        correctKey: question.correctKey,
        explanation: question.explanation,
      },
    });
  }),
);

learningRouter.post(
  "/practice/sessions/:id/complete",
  wrap(async (req, res) => {
    const session = await PracticeSession.findOne({ id: req.params.id, studentId: studentId(req) });
    if (!session) throw new HttpError(404, "Practice session not found", "NOT_FOUND");
    session.status = "completed";
    session.completedAt = new Date();
    await session.save();
    const correct = session.answers.filter((answer) => answer.correct).length;
    res.json({ data: { id: session.id, status: session.status, correct, answered: session.answers.length, total: session.questionIds.length } });
  }),
);

learningRouter.get(
  "/practice/history",
  wrap(async (req, res) => {
    const sessions = await PracticeSession.find({ studentId: studentId(req) }).sort({ createdAt: -1 }).limit(30).lean();
    res.json({
      data: sessions.map((session) => ({
        id: session.id,
        examId: session.examId,
        status: session.status,
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
    const filter: Record<string, unknown> = { status: "published" };
    if (typeof req.query.examId === "string") filter.examId = req.query.examId;
    const mocks = await MockTest.find(filter).lean();
    const attempts = await MockAttempt.find({ studentId: studentId(req) }).sort({ createdAt: -1 }).lean();
    const today = dayKey();
    res.json({
      data: mocks.map((mock) => {
        const mine = attempts.filter((attempt) => attempt.mockId === mock.id);
        const todayAttempt = mine.find((attempt) => attempt.dayKey === today);
        const lastSubmitted = mine.find((attempt) => attempt.status === "submitted");
        return {
          id: mock.id,
          examId: mock.examId,
          title: mock.title,
          durationMinutes: mock.durationMinutes,
          questionCount: mock.questionIds.length,
          marksPerQuestion: mock.marksPerQuestion,
          negativeMarks: mock.negativeMarks,
          instructions: mock.instructions,
          todayStatus: todayAttempt?.status || "available",
          todayAttemptId: todayAttempt?.id || "",
          lastScore: lastSubmitted ? { rawScore: lastSubmitted.rawScore, maxScore: lastSubmitted.maxScore } : null,
        };
      }),
    });
  }),
);

learningRouter.post(
  "/mocks/:id/start",
  wrap(async (req, res) => {
    const mock = await MockTest.findOne({ id: req.params.id, status: "published" });
    if (!mock) throw new HttpError(404, "Mock test not found", "NOT_FOUND");
    const today = dayKey();
    const existing = await MockAttempt.findOne({ studentId: studentId(req), mockId: mock.id, dayKey: today });
    if (existing?.status === "submitted") {
      throw new HttpError(409, "You already submitted this mock today. One attempt is allowed per mock per day.", "DAILY_LIMIT");
    }

    const exam = await Exam.findOne({ id: mock.examId }).lean();
    const targetCount =
      mock.questionIds.length ||
      Math.min(25, Math.max(8, exam?.pattern?.totalQuestions ? Math.min(exam.pattern.totalQuestions, 20) : 10));
    const readyForMock = await Question.find({ id: { $in: mock.questionIds }, status: SESSION_QUESTION_STATUS }).lean();
    if (!mock.questionIds.length || readyForMock.length < Math.min(5, targetCount)) {
      const generated = await ensureMockQuestions({
        studentId: studentId(req),
        examId: mock.examId,
        existingIds: mock.questionIds,
        targetCount,
      });
      mock.questionIds = generated.map((question) => question.id);
      await mock.save();
    }

    if (existing) {
      const questions = await Question.find({ id: { $in: mock.questionIds }, status: SESSION_QUESTION_STATUS })
        .select("-correctKey -explanation")
        .lean();
      return res.json({ data: presentAttempt(existing, questions, mock.questionIds) });
    }
    const attempt = await MockAttempt.create({
      id: nid(),
      mockId: mock.id,
      studentId: studentId(req),
      dayKey: today,
      deadlineAt: new Date(Date.now() + mock.durationMinutes * 60 * 1000),
      idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : "",
    });
    const questions = await Question.find({ id: { $in: mock.questionIds }, status: SESSION_QUESTION_STATUS })
      .select("-correctKey -explanation")
      .lean();
    res.status(201).json({ data: presentAttempt(attempt, questions, mock.questionIds) });
  }),
);

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
    const mock = await MockTest.findOne({ id: attempt.mockId }).lean();
    const allowed = new Set(mock?.questionIds || []);
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
  if (!mock) throw new HttpError(404, "Mock test not found", "NOT_FOUND");
  const questions = await Question.find({ id: { $in: mock.questionIds } }).lean();
  const selected = new Map(
    (attempt.answers as Array<{ selectedKey?: string; questionId: string }>)
      .filter((answer) => answer.selectedKey)
      .map((answer) => [answer.questionId, answer.selectedKey]),
  );
  const states = mock.questionIds.map((questionId) => {
    const question = questions.find((item) => item.id === questionId);
    const choice = selected.get(questionId);
    if (!question || !choice) return null;
    return question.correctKey === choice;
  });
  const scored = scoreAttempt(states, { marksPerQuestion: mock.marksPerQuestion, negativeMarks: mock.negativeMarks });
  attempt.set("answers", mock.questionIds.map((questionId: string) => {
    const question = questions.find((item) => item.id === questionId);
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
    const attempt = await MockAttempt.findOne({ id: req.params.id, studentId: studentId(req) }).lean();
    if (!attempt) throw new HttpError(404, "Attempt not found", "NOT_FOUND");
    if (attempt.status === "submitted") return res.json({ data: { id: attempt.id, status: attempt.status, redirect: "result" } });
    const mock = await MockTest.findOne({ id: attempt.mockId }).lean();
    const questions = await Question.find({ id: { $in: mock?.questionIds || [] }, status: SESSION_QUESTION_STATUS })
      .select("-correctKey -explanation")
      .lean();
    res.json({ data: presentAttempt(attempt, questions, mock?.questionIds || []) });
  }),
);

learningRouter.get(
  "/mocks/attempts/:id/result",
  wrap(async (req, res) => {
    const attempt = await MockAttempt.findOne({ id: req.params.id, studentId: studentId(req) }).lean();
    if (!attempt) throw new HttpError(404, "Attempt not found", "NOT_FOUND");
    if (attempt.status !== "submitted") throw new HttpError(409, "Submit the attempt before reviewing answers", "CONFLICT");
    const mock = await MockTest.findOne({ id: attempt.mockId }).lean();
    const questions = await Question.find({ id: { $in: mock?.questionIds || [] } }).lean();
    res.json({
      data: {
        ...resultPayload(attempt),
        title: mock?.title,
        questions: (mock?.questionIds || []).map((id) => {
          const question = questions.find((item) => item.id === id);
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
    const settings = (await AppConfig.findOne({ id: "app" }).lean()) || {
      aiProvider: "local" as "local" | "chatgpt" | "openai" | "gemini" | "ollama",
      chatgptEnabled: false as boolean | undefined,
      geminiEnabled: false as boolean | undefined,
      activePrompt: "You are ArivuVazhi, a calm government-exam tutor.",
      perUserDailyAiLimit: 40,
    };
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const used = await AiUsage.countDocuments({ userId: studentId(req), createdAt: { $gte: since } });
    if (used >= (settings.perUserDailyAiLimit || 40)) {
      throw new HttpError(429, "Daily AI Tutor limit reached. Try again tomorrow.", "AI_LIMIT");
    }
    await assertAiBudgetAvailable("AI Tutor");
    const replyLanguage = detectStudentLanguage(body.message);
    let conversation = body.conversationId
      ? await Conversation.findOne({ id: body.conversationId, studentId: studentId(req) })
      : null;
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
    const reply = await tutorReply({
      studentId: studentId(req),
      message: body.message,
      examId: conversation.examId,
      provider,
      prompt: settings.activePrompt || "You are ArivuVazhi, a calm government-exam tutor.",
      attachment: body.attachment,
    });
    conversation.messages.push({ role: "user", content: body.message, sources: [], createdAt: new Date() });
    conversation.messages.push({ role: "assistant", content: reply.answer, sources: reply.sources.map((source) => source.title), createdAt: new Date() });
    await conversation.save();
    const user = await User.findOne({ id: studentId(req) }).lean();
    if (user?.aiMemoryEnabled) {
      const weak = /weak|struggle|difficult|கடினம்|புரியல/i.test(body.message);
      if (weak) {
        await MemoryItem.create({ id: nid(), studentId: studentId(req), text: `Asked for help: ${body.message.slice(0, 180)}` });
      }
    }
    await AiUsage.create({
      id: nid(),
      userId: studentId(req),
      provider: reply.providerUsed,
      feature: "tutor",
      tokens: reply.tokens,
      estimatedInr: estimateAiInr(reply.tokens, reply.providerUsed),
    });
    res.json({ data: { conversationId: conversation.id, reply: reply.answer, sources: reply.sources, provider: reply.providerUsed } });
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
    const text = await transcribeAudio(body);
    if (!text) throw new HttpError(503, "Voice transcription needs a valid OpenAI API key and a supported audio recording.", "AI_UNAVAILABLE");
    res.json({ data: { text } });
  }),
);

learningRouter.get(
  "/tutor/conversations",
  wrap(async (req, res) => {
    const filter: Record<string, unknown> = { studentId: studentId(req) };
    if (typeof req.query.examId === "string" && req.query.examId) filter.examId = req.query.examId;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const conversations = await Conversation.find(filter).sort({ updatedAt: -1 }).limit(40).lean();
    const filtered = q
      ? conversations.filter((conversation) =>
          `${conversation.title} ${conversation.messages.map((message) => message.content).join(" ")}`.toLowerCase().includes(q.toLowerCase()),
        )
      : conversations;
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
      const question = await Question.findOne({ id: item.questionId, status: SESSION_QUESTION_STATUS });
      if (!session || session.status !== "active" || !question || !session.questionIds.includes(question.id)) {
        skipped.push(item.questionId);
        continue;
      }
      const correct = question.correctKey === item.selectedKey;
      const existing = session.answers.find((answer) => answer.questionId === question.id);
      if (existing) {
        existing.selectedKey = item.selectedKey;
        existing.correct = correct;
        existing.answeredAt = new Date();
      } else {
        session.answers.push({ questionId: question.id, selectedKey: item.selectedKey, correct, answeredAt: new Date(), markedForReview: false });
      }
      await session.save();
      applied.push(question.id);
    }
    let completed = 0;
    for (const sessionId of body.completeSessionIds) {
      const session = await PracticeSession.findOne({ id: sessionId, studentId: studentId(req) });
      if (!session) continue;
      session.status = "completed";
      session.completedAt = new Date();
      await session.save();
      completed += 1;
    }
    const response = { data: { applied: applied.length, skipped: skipped.length, completed, serverAuthoritative: true } };
    await SyncReceipt.create({ id: nid(), studentId: studentId(req), idempotencyKey: body.idempotencyKey, response });
    res.json(response);
  }),
);
