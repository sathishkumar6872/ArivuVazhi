import { Router } from "express";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../auth.js";
import { HttpError, nid, pageQuery, sendList, wrap } from "../http.js";
import {
  AiUsage,
  AppConfig,
  AppFeedback,
  AuditLog,
  Exam,
  KnowledgeSource,
  MockTest,
  Notification,
  PracticeSession,
  PyqPaper,
  Question,
  QuestionChangeLog,
  Subject,
  SyllabusSnapshot,
  Ticket,
  Topic,
  User,
} from "../models.js";
import {
  getChatGptPlanUsage,
  getChatGptStatus,
  refreshChatGptPlanModels,
  signOutChatGpt,
  startChatGptSignIn,
  testChatGptConnection,
} from "../chatgpt-auth.js";
import { getGeminiSettings, testGeminiConnection } from "../gemini-settings.js";
import { getOpenAiSettings, testOpenAiConnection } from "../openai-settings.js";
import { fetchExamSubjectsWithAi, fetchSubjectTopicsWithAi } from "../syllabus-ai.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin", "reviewer"));

const optionSchema = z.object({ key: z.string().min(1).max(2), text: z.string().min(1) });

adminRouter.get(
  "/overview",
  wrap(async (_req, res) => {
    const [students, questions, pendingQuestions, pendingTopics, openTickets, usage] = await Promise.all([
      User.countDocuments({ role: "student" }),
      Question.countDocuments({ status: "published" }),
      Question.countDocuments({ status: "under_review" }),
      Topic.countDocuments({ status: { $in: ["draft", "validation", "approved"] } }),
      Ticket.countDocuments({ status: { $in: ["open", "in_progress"] } }),
      AiUsage.aggregate([{ $group: { _id: null, tokens: { $sum: "$tokens" }, inr: { $sum: "$estimatedInr" }, requests: { $sum: 1 } } }]),
    ]);
    const recentStudents = await User.find({ role: "student" }).sort({ updatedAt: -1 }).limit(5).select("firstName lastName email lastActiveDate status").lean();
    res.json({
      data: {
        students,
        publishedQuestions: questions,
        awaitingApproval: pendingQuestions + pendingTopics,
        openTickets,
        ai: usage[0] || { tokens: 0, inr: 0, requests: 0 },
        recentStudents,
      },
    });
  }),
);

adminRouter.get(
  "/students",
  wrap(async (req, res) => {
    const { page, limit, skip } = pageQuery(req.query);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const filter: Record<string, unknown> = { role: "student" };
    if (q) filter.$or = [{ email: new RegExp(q, "i") }, { firstName: new RegExp(q, "i") }, { lastName: new RegExp(q, "i") }];
    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    const exams = await Exam.find({ id: { $in: items.map((item) => item.primaryExamId).filter(Boolean) } }).lean();
    const examName = new Map(exams.map((exam) => [exam.id, exam.name]));
    sendList(
      res,
      items.map((item) => ({
        id: item.id,
        firstName: item.firstName,
        lastName: item.lastName,
        email: item.email,
        status: item.status,
        language: item.language,
        primaryExam: examName.get(item.primaryExamId) || "",
        lastActiveDate: item.lastActiveDate,
        streak: item.streak,
      })),
      page,
      limit,
      total,
    );
  }),
);

adminRouter.patch(
  "/students/:id",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only an admin can change accounts", "FORBIDDEN");
    const body = z.object({ status: z.enum(["active", "inactive", "suspended"]) }).parse(req.body);
    const user = await User.findOneAndUpdate({ id: req.params.id, role: "student" }, { status: body.status }, { new: true }).lean();
    if (!user) throw new HttpError(404, "Student not found", "NOT_FOUND");
    await audit(req.user!.id, "student_status", "user", user.id, body);
    res.json({ data: { id: user.id, status: user.status } });
  }),
);

adminRouter.get(
  "/exams",
  wrap(async (_req, res) => {
    const exams = await Exam.find().sort({ createdAt: -1 }).lean();
    res.json({ data: exams });
  }),
);

adminRouter.post(
  "/exams",
  wrap(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        code: z.string().min(2),
        authority: z.string().min(2),
        description: z.string().optional().default(""),
        version: z.string().optional(),
        pattern: z
          .object({
            durationMinutes: z.number().positive(),
            totalQuestions: z.number().int().positive(),
            marksPerQuestion: z.number().nonnegative(),
            negativeMarks: z.number().nonnegative(),
            sections: z.array(z.object({ name: z.string(), questionCount: z.number() })).optional(),
          })
          .optional(),
      })
      .parse(req.body);
    const exam = await Exam.create({ id: nid(), lifecycle: "draft", ...body });
    await audit(req.user!.id, "exam_create", "exam", exam.id);
    res.status(201).json({ data: exam });
  }),
);

adminRouter.patch(
  "/exams/:id",
  wrap(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        authority: z.string().min(2).optional(),
        description: z.string().optional(),
        lifecycle: z.enum(["draft", "under_review", "published", "revised", "archived"]).optional(),
        version: z.string().optional(),
        pattern: z.record(z.any()).optional(),
      })
      .parse(req.body);
    const exam = await Exam.findOneAndUpdate({ id: req.params.id }, body, { new: true }).lean();
    if (!exam) throw new HttpError(404, "Exam not found", "NOT_FOUND");
    await audit(req.user!.id, "exam_update", "exam", exam.id, { lifecycle: body.lifecycle });
    res.json({ data: exam });
  }),
);

adminRouter.get(
  "/syllabus",
  wrap(async (req, res) => {
    const examId = z.string().parse(req.query.examId);
    const [subjects, topics, history] = await Promise.all([
      Subject.find({ examId }).sort({ order: 1 }).lean(),
      Topic.find({ examId }).sort({ order: 1 }).lean(),
      SyllabusSnapshot.find({ examId }).sort({ year: -1, createdAt: -1 }).lean(),
    ]);
    res.json({
      data: {
        current: subjects.map((subject) => ({
          ...subject,
          topics: topics.filter((topic) => topic.subjectId === subject.id),
        })),
        history,
      },
    });
  }),
);

adminRouter.post(
  "/syllabus/refresh",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only admin can refresh syllabus", "FORBIDDEN");
    const body = z.object({ examId: z.string(), year: z.number().int().optional() }).parse(req.body);
    const exam = await Exam.findOne({ id: body.examId }).lean();
    if (!exam) throw new HttpError(404, "Exam not found", "NOT_FOUND");
    const year = body.year || new Date().getFullYear();

    let fetched;
    try {
      fetched = await fetchExamSubjectsWithAi({
        exam: {
          name: exam.name,
          code: exam.code,
          authority: exam.authority,
          description: exam.description,
        },
        year,
      });
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Subject AI fetch failed", "SYLLABUS_AI_FAILED");
    }

    // Replace subjects only; clear old topics until each subject is updated.
    await Topic.deleteMany({ examId: body.examId });
    await Subject.deleteMany({ examId: body.examId });
    const createdSubjects = [];
    for (const [subjectIndex, subject] of fetched.subjects.entries()) {
      const subjectDoc = await Subject.create({
        id: nid(),
        examId: body.examId,
        name: subject.en,
        nameEn: subject.en,
        nameTa: subject.ta,
        order: subjectIndex + 1,
        status: "published",
      });
      createdSubjects.push(subjectDoc);
    }

    const snapshot = await SyllabusSnapshot.create({
      id: nid(),
      examId: body.examId,
      year,
      versionLabel: `${exam.code}-${year}-subjects`,
      source: "ai_search",
      status: "active",
      subjects: fetched.subjects.map((subject) => ({
        name: subject.en,
        nameEn: subject.en,
        nameTa: subject.ta,
        topics: [],
      })),
      notes: `${fetched.notes} Next: update topics subject-by-subject.`,
      fetchedAt: new Date(),
    });
    await SyllabusSnapshot.updateMany(
      { examId: body.examId, id: { $ne: snapshot.id }, status: "active" },
      { $set: { status: "archived" } },
    );
    await audit(req.user!.id, "syllabus_subjects_refresh", "exam", body.examId, {
      year,
      snapshotId: snapshot.id,
      provider: fetched.provider,
      subjectCount: createdSubjects.length,
    });
    res.status(201).json({
      data: {
        ...snapshot.toObject(),
        provider: fetched.provider,
        subjectCount: createdSubjects.length,
        topicCount: 0,
        step: "subjects",
      },
    });
  }),
);

adminRouter.post(
  "/syllabus/subjects/:subjectId/refresh",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only admin can refresh subject topics", "FORBIDDEN");
    const body = z.object({ year: z.number().int().optional() }).parse(req.body || {});
    const subject = await Subject.findOne({ id: req.params.subjectId });
    if (!subject) throw new HttpError(404, "Subject not found", "NOT_FOUND");
    const exam = await Exam.findOne({ id: subject.examId }).lean();
    if (!exam) throw new HttpError(404, "Exam not found", "NOT_FOUND");
    const year = body.year || new Date().getFullYear();

    let fetched;
    try {
      fetched = await fetchSubjectTopicsWithAi({
        exam: { name: exam.name, code: exam.code, authority: exam.authority },
        year,
        subject: {
          nameEn: subject.nameEn || subject.name,
          nameTa: subject.nameTa || subject.name,
        },
      });
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Topic AI fetch failed", "SYLLABUS_TOPIC_AI_FAILED");
    }

    await Topic.deleteMany({ examId: subject.examId, subjectId: subject.id });
    const created = [];
    for (const [topicIndex, topic] of fetched.topics.entries()) {
      created.push(
        await Topic.create({
          id: nid(),
          examId: subject.examId,
          subjectId: subject.id,
          name: topic.en,
          nameEn: topic.en,
          nameTa: topic.ta,
          order: topicIndex + 1,
          status: "published",
        }),
      );
    }

    // Refresh active snapshot row for this subject if present.
    const active = await SyllabusSnapshot.findOne({ examId: subject.examId, status: "active" });
    if (active) {
      type SnapSubject = {
        name?: string | null;
        nameEn?: string | null;
        nameTa?: string | null;
        topics?: Array<{ name?: string | null; nameEn?: string | null; nameTa?: string | null }>;
      };
      const current = (active.subjects || []) as unknown as SnapSubject[];
      const subjectKey = subject.nameEn || subject.name;
      const updatedRow = {
        name: subjectKey,
        nameEn: subject.nameEn || subject.name,
        nameTa: subject.nameTa || subject.name,
        topics: fetched.topics.map((topic) => ({
          name: topic.en,
          nameEn: topic.en,
          nameTa: topic.ta,
        })),
      };
      let found = false;
      const nextSubjects = current.map((row) => {
        const match = (row.nameEn || row.name) === subjectKey || row.nameTa === subject.nameTa;
        if (!match) return row;
        found = true;
        return updatedRow;
      });
      if (!found) nextSubjects.push(updatedRow);
      active.set("subjects", nextSubjects);
      active.notes = `${active.notes || ""}\nUpdated topics: ${subjectKey} via ${fetched.provider}.`.trim();
      active.fetchedAt = new Date();
      await active.save();
    }

    await audit(req.user!.id, "syllabus_subject_topics_refresh", "subject", subject.id, {
      provider: fetched.provider,
      topicCount: created.length,
    });
    res.status(201).json({
      data: {
        subjectId: subject.id,
        provider: fetched.provider,
        topicCount: created.length,
        topics: created,
        step: "topics",
      },
    });
  }),
);

adminRouter.post(
  "/subjects",
  wrap(async (_req, res) => {
    throw new HttpError(403, "Manual subject create disabled. Use Syllabus → Refresh (AI) / history.", "MANUAL_SYLLABUS_DISABLED");
  }),
);

adminRouter.post(
  "/topics",
  wrap(async (_req, res) => {
    throw new HttpError(403, "Manual topic create disabled. Use Syllabus → Refresh (AI) / history.", "MANUAL_SYLLABUS_DISABLED");
  }),
);

adminRouter.patch(
  "/topics/:id",
  wrap(async (req, res) => {
    const body = z.object({ name: z.string().min(2).optional(), status: z.enum(["draft", "validation", "approved", "published"]).optional() }).parse(req.body);
    const topic = await Topic.findOneAndUpdate({ id: req.params.id }, body, { new: true }).lean();
    if (!topic) throw new HttpError(404, "Topic not found", "NOT_FOUND");
    await audit(req.user!.id, "topic_update", "topic", topic.id, body);
    res.json({ data: topic });
  }),
);

adminRouter.get(
  "/questions",
  wrap(async (req, res) => {
    const { page, limit, skip } = pageQuery(req.query);
    const filter: Record<string, unknown> = {};
    if (typeof req.query.examId === "string" && req.query.examId) filter.examId = req.query.examId;
    if (typeof req.query.status === "string" && req.query.status) filter.status = req.query.status;
    const [items, total] = await Promise.all([
      Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Question.countDocuments(filter),
    ]);
    sendList(res, items, page, limit, total);
  }),
);

adminRouter.post(
  "/questions",
  wrap(async (_req, res) => {
    throw new HttpError(
      403,
      "Admin cannot create questions. Practice/mock questions generate on the student side. Use correction flow only when a published key is wrong.",
      "ADMIN_CREATE_FORBIDDEN",
    );
  }),
);

adminRouter.patch(
  "/questions/:id",
  wrap(async (req, res) => {
    const body = z
      .object({
        stem: z.string().min(8).optional(),
        options: z.array(optionSchema).min(2).max(6).optional(),
        correctKey: z.string().optional(),
        explanation: z.string().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        status: z.enum(["draft", "under_review", "published", "rejected", "retired"]).optional(),
        changeReason: z.string().min(8).max(500).optional(),
        oldAnswerMistake: z.string().min(8).max(1000).optional(),
        newAnswerWhyCorrect: z.string().min(8).max(1000).optional(),
      })
      .parse(req.body);
    const question = await Question.findOne({ id: req.params.id });
    if (!question) throw new HttpError(404, "Question not found", "NOT_FOUND");
    const contentChanging =
      body.stem !== undefined ||
      body.options !== undefined ||
      body.correctKey !== undefined ||
      body.explanation !== undefined;
    if (contentChanging) {
      if (!body.changeReason) {
        throw new HttpError(400, "changeReason required for any question content edit", "REASON_REQUIRED");
      }
      if (body.correctKey !== undefined && body.correctKey !== question.correctKey) {
        if (!body.oldAnswerMistake || !body.newAnswerWhyCorrect) {
          throw new HttpError(
            400,
            "Answer key change needs oldAnswerMistake + newAnswerWhyCorrect",
            "ANSWER_CHANGE_EVIDENCE_REQUIRED",
          );
        }
      }
    }
    const before = {
      stem: question.stem,
      options: question.options,
      correctKey: question.correctKey,
      explanation: question.explanation,
      status: question.status,
    };
    Object.assign(question, {
      stem: body.stem ?? question.stem,
      options: body.options ?? question.options,
      correctKey: body.correctKey ?? question.correctKey,
      explanation: body.explanation ?? question.explanation,
      difficulty: body.difficulty ?? question.difficulty,
      status: body.status ?? question.status,
    });
    if (body.options || body.correctKey) {
      const keys = question.options.map((option: { key: string }) => option.key);
      if (!keys.includes(question.correctKey)) throw new HttpError(400, "correctKey must match an option", "BAD_REQUEST");
    }
    await question.save();
    if (contentChanging) {
      await QuestionChangeLog.create({
        id: nid(),
        questionId: question.id,
        actorId: req.user!.id,
        reason: body.changeReason || "",
        oldCorrectKey: before.correctKey,
        newCorrectKey: question.correctKey,
        oldAnswerMistake: body.oldAnswerMistake || "",
        newAnswerWhyCorrect: body.newAnswerWhyCorrect || "",
        before,
        after: {
          stem: question.stem,
          options: question.options,
          correctKey: question.correctKey,
          explanation: question.explanation,
          status: question.status,
        },
      });
    }
    await audit(req.user!.id, "question_update", "question", question.id, {
      status: question.status,
      changeReason: body.changeReason,
    });
    res.json({ data: question });
  }),
);

adminRouter.get(
  "/questions/:id/changes",
  wrap(async (req, res) => {
    const items = await QuestionChangeLog.find({ questionId: req.params.id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ data: items });
  }),
);

adminRouter.get(
  "/pyq",
  wrap(async (_req, res) => {
    const papers = await PyqPaper.find().sort({ year: -1 }).lean();
    res.json({ data: papers });
  }),
);

adminRouter.post(
  "/pyq",
  wrap(async (req, res) => {
    const body = z
      .object({
        examId: z.string(),
        title: z.string().min(2),
        year: z.number().int(),
        sourceName: z.string().min(2),
        questionIds: z.array(z.string()).default([]),
        note: z.string().optional().default(""),
        rightsStatus: z.enum(["pending", "verified", "rejected"]).optional(),
      })
      .parse(req.body);
    const paper = await PyqPaper.create({
      id: nid(),
      status: "under_review",
      rightsStatus: body.rightsStatus || "pending",
      ...body,
    });
    await audit(req.user!.id, "pyq_create", "pyq", paper.id);
    res.status(201).json({ data: paper });
  }),
);

adminRouter.patch(
  "/pyq/:id",
  wrap(async (req, res) => {
    const body = z
      .object({
        rightsStatus: z.enum(["pending", "verified", "rejected"]).optional(),
        status: z.enum(["draft", "under_review", "published", "rejected"]).optional(),
        note: z.string().optional(),
      })
      .parse(req.body);
    if (body.status === "published" && body.rightsStatus && body.rightsStatus !== "verified") {
      throw new HttpError(400, "PYQ can be published only after rights are verified", "BAD_REQUEST");
    }
    const existing = await PyqPaper.findOne({ id: req.params.id });
    if (!existing) throw new HttpError(404, "PYQ paper not found", "NOT_FOUND");
    if (body.status === "published" && (body.rightsStatus || existing.rightsStatus) !== "verified") {
      throw new HttpError(400, "PYQ can be published only after rights are verified", "BAD_REQUEST");
    }
    Object.assign(existing, body);
    await existing.save();
    await audit(req.user!.id, "pyq_update", "pyq", existing.id, body);
    res.json({ data: existing });
  }),
);

adminRouter.get(
  "/mocks",
  wrap(async (_req, res) => {
    res.json({ data: await MockTest.find().sort({ createdAt: -1 }).lean() });
  }),
);

adminRouter.post(
  "/mocks",
  wrap(async (req, res) => {
    const body = z
      .object({
        examId: z.string(),
        title: z.string().min(2),
        /** Empty = student-side AI fills questions on first start. */
        questionIds: z.array(z.string()).default([]),
        durationMinutes: z.number().int().positive(),
        marksPerQuestion: z.number().positive(),
        negativeMarks: z.number().nonnegative(),
        instructions: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const mock = await MockTest.create({
      id: nid(),
      status: "draft",
      instructions: body.instructions || [
        "Questions generate automatically when a student starts this mock.",
        "One attempt per mock per day.",
      ],
      ...body,
    });
    res.status(201).json({ data: mock });
  }),
);

adminRouter.patch(
  "/mocks/:id",
  wrap(async (req, res) => {
    const body = z.object({ status: z.enum(["draft", "published", "archived"]).optional(), title: z.string().optional() }).parse(req.body);
    const mock = await MockTest.findOneAndUpdate({ id: req.params.id }, body, { new: true }).lean();
    if (!mock) throw new HttpError(404, "Mock not found", "NOT_FOUND");
    await audit(req.user!.id, "mock_update", "mock", mock.id, body);
    res.json({ data: mock });
  }),
);

adminRouter.get(
  "/approvals",
  wrap(async (_req, res) => {
    const [questions, topics, sources, papers] = await Promise.all([
      Question.find({ status: "under_review" }).limit(30).lean(),
      Topic.find({ status: { $in: ["draft", "validation"] } }).limit(30).lean(),
      KnowledgeSource.find({ status: { $in: ["draft", "under_review"] } }).limit(30).lean(),
      PyqPaper.find({ status: "under_review" }).limit(30).lean(),
    ]);
    res.json({
      data: [
        ...questions.map((item) => ({ type: "question", id: item.id, title: item.stem.slice(0, 120), status: item.status })),
        ...topics.map((item) => ({ type: "topic", id: item.id, title: item.name, status: item.status })),
        ...sources.map((item) => ({ type: "source", id: item.id, title: item.title, status: item.status })),
        ...papers.map((item) => ({ type: "pyq", id: item.id, title: item.title, status: item.status, rightsStatus: item.rightsStatus })),
      ],
    });
  }),
);

adminRouter.post(
  "/approvals/:type/:id",
  wrap(async (req, res) => {
    const decision = z.object({ decision: z.enum(["approve", "reject"]) }).parse(req.body).decision;
    const { type, id } = req.params;
    if (type === "question") {
      const status = decision === "approve" ? "published" : "rejected";
      const item = await Question.findOneAndUpdate({ id }, { status }, { new: true }).lean();
      if (!item) throw new HttpError(404, "Question not found", "NOT_FOUND");
    } else if (type === "topic") {
      const status = decision === "approve" ? "published" : "draft";
      const item = await Topic.findOneAndUpdate({ id }, { status }, { new: true }).lean();
      if (!item) throw new HttpError(404, "Topic not found", "NOT_FOUND");
    } else if (type === "source") {
      const status = decision === "approve" ? "approved" : "retired";
      const rightsStatus = decision === "approve" ? "verified" : "rejected";
      const item = await KnowledgeSource.findOneAndUpdate({ id }, { status, rightsStatus }, { new: true }).lean();
      if (!item) throw new HttpError(404, "Source not found", "NOT_FOUND");
    } else if (type === "pyq") {
      const paper = await PyqPaper.findOne({ id });
      if (!paper) throw new HttpError(404, "PYQ paper not found", "NOT_FOUND");
      if (decision === "approve" && paper.rightsStatus !== "verified") {
        throw new HttpError(400, "Verify rights before publishing a PYQ paper", "BAD_REQUEST");
      }
      paper.status = decision === "approve" ? "published" : "rejected";
      await paper.save();
    } else {
      throw new HttpError(400, "Unknown approval type", "BAD_REQUEST");
    }
    await audit(req.user!.id, "approval_decision", type, id, { decision });
    res.json({ data: { type, id, decision } });
  }),
);

adminRouter.get(
  "/knowledge",
  wrap(async (_req, res) => {
    res.json({ data: await KnowledgeSource.find().sort({ createdAt: -1 }).lean() });
  }),
);

adminRouter.post(
  "/knowledge",
  wrap(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(2),
        text: z.string().min(20),
        examId: z.string().optional().default(""),
        topicId: z.string().optional().default(""),
        language: z.enum(["en", "ta", "tanglish"]).optional(),
        sourceType: z.string().optional(),
      })
      .parse(req.body);
    const source = await KnowledgeSource.create({
      id: nid(),
      status: "under_review",
      rightsStatus: "pending",
      language: body.language || "en",
      sourceType: body.sourceType || "notes",
      ...body,
    });
    res.status(201).json({ data: source });
  }),
);

adminRouter.get(
  "/ai",
  wrap(async (_req, res) => {
    const settings = await AppConfig.findOne({ id: "app" }).lean();
    let chatgpt = await getChatGptStatus();
    if (chatgpt.connected && !chatgpt.models.length) {
      try {
        const refreshed = await refreshChatGptPlanModels();
        chatgpt = { ...chatgpt, models: refreshed.models };
      } catch {
        // Keep page usable even if model list fails; Connect / Test can retry.
      }
    }
    const openai = await getOpenAiSettings();
    const gemini = await getGeminiSettings();
    const planUsage = chatgpt.connected ? await getChatGptPlanUsage() : null;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    // Missing flags (older docs): infer from aiProvider so existing setups keep working.
    const chatgptEnabled = settings?.chatgptEnabled ?? settings?.aiProvider === "chatgpt";
    const geminiEnabled = settings?.geminiEnabled ?? settings?.aiProvider === "gemini";
    let activeProvider = settings?.aiProvider || "local";
    if (activeProvider === "chatgpt" && !chatgptEnabled) activeProvider = geminiEnabled ? "gemini" : "local";
    if (activeProvider === "gemini" && !geminiEnabled) activeProvider = chatgptEnabled ? "chatgpt" : "local";
    const usageProvider = activeProvider === "gemini" ? "gemini" : activeProvider === "chatgpt" ? "chatgpt" : "local";
    const [today, allTime] = await Promise.all([
      AiUsage.aggregate([
        { $match: { provider: usageProvider, createdAt: { $gte: since } } },
        { $group: { _id: null, requests: { $sum: 1 }, tokens: { $sum: "$tokens" } } },
      ]),
      AiUsage.aggregate([
        { $match: { provider: usageProvider } },
        { $group: { _id: null, requests: { $sum: 1 }, tokens: { $sum: "$tokens" } } },
      ]),
    ]);
    res.json({
      data: {
        provider: activeProvider,
        chatgptEnabled,
        geminiEnabled,
        openaiModel: openai.model,
        chatgpt,
        gemini: {
          configured: gemini.configured,
          keyHint: gemini.keyHint,
          model: gemini.model,
          auto: gemini.auto,
          lastUsedModel: gemini.lastUsedModel,
          models: gemini.models,
          lastError: settings?.geminiLastError || "",
          lastCheckedAt: settings?.geminiLastCheckedAt || null,
        },
        planUsage,
        localUsage: {
          todayRequests: today[0]?.requests || 0,
          todayTokens: today[0]?.tokens || 0,
          totalRequests: allTime[0]?.requests || 0,
          totalTokens: allTime[0]?.tokens || 0,
          dailyStudentLimit: settings?.perUserDailyAiLimit || 40,
        },
      },
    });
  }),
);

adminRouter.post(
  "/ai/chatgpt/authorize",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only an admin can connect ChatGPT", "FORBIDDEN");
    res.json({ data: await startChatGptSignIn() });
  }),
);

adminRouter.post(
  "/ai/chatgpt/test",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only an admin can test ChatGPT", "FORBIDDEN");
    const result = await testChatGptConnection();
    if (!result.ok) throw new HttpError(400, result.message, "CHATGPT_TEST_FAILED");
    res.json({ data: result });
  }),
);

adminRouter.delete(
  "/ai/chatgpt",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only an admin can disconnect ChatGPT", "FORBIDDEN");
    const result = await signOutChatGpt();
    await audit(req.user!.id, "ai_chatgpt_disconnect", "config", "app", { revokedAtOpenAI: result.revoked });
    res.json({ data: { ...result, ...(await getChatGptStatus()) } });
  }),
);

adminRouter.post(
  "/ai/gemini/test",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only an admin can test Gemini", "FORBIDDEN");
    const body = z
      .object({
        geminiApiKey: z.string().min(10).max(200).optional(),
        geminiModel: z.string().min(3).max(80).optional(),
      })
      .parse(req.body || {});
    const result = await testGeminiConnection(body.geminiApiKey, body.geminiModel);
    if (!result.ok) throw new HttpError(400, result.message, "GEMINI_TEST_FAILED");
    res.json({ data: result });
  }),
);

adminRouter.patch(
  "/ai",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only an admin can change AI settings", "FORBIDDEN");
    const body = z
      .object({
        aiProvider: z.enum(["local", "chatgpt", "openai", "gemini", "ollama"]).optional(),
        activePrompt: z.string().min(10).optional(),
        promptVersion: z.string().optional(),
        monthlyBudgetInr: z.number().nonnegative().optional(),
        perUserDailyAiLimit: z.number().int().positive().optional(),
        maxSessions: z.number().int().positive().optional(),
        openaiApiKey: z.string().min(10).max(200).optional(),
        clearOpenAiKey: z.boolean().optional(),
        openaiModel: z.string().min(3).max(80).optional(),
        geminiApiKey: z.string().min(10).max(200).optional(),
        clearGeminiKey: z.boolean().optional(),
        geminiModel: z.string().min(3).max(80).optional(),
        chatgptEnabled: z.boolean().optional(),
        geminiEnabled: z.boolean().optional(),
      })
      .parse(req.body);
    const current = await AppConfig.findOne({ id: "app" }).lean();
    const update: Record<string, unknown> = {};
    if (body.aiProvider !== undefined) update.aiProvider = body.aiProvider;
    if (body.activePrompt !== undefined) update.activePrompt = body.activePrompt;
    if (body.promptVersion !== undefined) update.promptVersion = body.promptVersion;
    if (body.monthlyBudgetInr !== undefined) update.monthlyBudgetInr = body.monthlyBudgetInr;
    if (body.perUserDailyAiLimit !== undefined) update.perUserDailyAiLimit = body.perUserDailyAiLimit;
    if (body.maxSessions !== undefined) update.maxSessions = body.maxSessions;
    if (body.openaiModel !== undefined) update.openaiModel = body.openaiModel;
    if (body.geminiModel !== undefined) update.geminiModel = body.geminiModel;
    if (body.clearOpenAiKey) update.openaiApiKey = "";
    else if (body.openaiApiKey) update.openaiApiKey = body.openaiApiKey.trim();
    if (body.clearGeminiKey) {
      update.geminiApiKey = "";
      update.geminiModels = [];
      update.geminiEnabledModels = [];
      update.geminiLastError = "";
      update.geminiEnabled = false;
    } else if (body.geminiApiKey) {
      update.geminiApiKey = body.geminiApiKey.trim();
      update.geminiModel = "auto";
    }
    if (body.geminiModel === "auto") update.geminiModel = "auto";

    // Provider flags are independent — both ChatGPT and Gemini can be enabled together.
    // aiProvider = which enabled provider the student tutor actually uses.
    if (body.chatgptEnabled !== undefined) update.chatgptEnabled = body.chatgptEnabled;
    if (body.geminiEnabled !== undefined) update.geminiEnabled = body.geminiEnabled;

    const nextChat =
      body.chatgptEnabled !== undefined ? body.chatgptEnabled : Boolean(current?.chatgptEnabled ?? current?.aiProvider === "chatgpt");
    const nextGemini =
      body.geminiEnabled !== undefined ? body.geminiEnabled : Boolean(current?.geminiEnabled ?? current?.aiProvider === "gemini");

    if (body.aiProvider !== undefined) {
      if (body.aiProvider === "chatgpt" && !nextChat) {
        throw new HttpError(400, "Enable ChatGPT first, then set it as active tutor.", "PROVIDER_DISABLED");
      }
      if (body.aiProvider === "gemini" && !nextGemini) {
        throw new HttpError(400, "Enable Gemini first, then set it as active tutor.", "PROVIDER_DISABLED");
      }
      update.aiProvider = body.aiProvider;
      if (body.aiProvider === "chatgpt") update.chatgptEnabled = true;
      if (body.aiProvider === "gemini") update.geminiEnabled = true;
    } else if (body.chatgptEnabled === true && (current?.aiProvider === "local" || !nextGemini || current?.aiProvider === "chatgpt")) {
      // Turning ChatGPT on: become active if nothing else is active, or keep if already chatgpt.
      if (!nextGemini || current?.aiProvider !== "gemini") update.aiProvider = "chatgpt";
    } else if (body.geminiEnabled === true && (current?.aiProvider === "local" || !nextChat || current?.aiProvider === "gemini")) {
      if (!nextChat || current?.aiProvider !== "chatgpt") update.aiProvider = "gemini";
    } else if (body.chatgptEnabled === false || body.geminiEnabled === false) {
      const active = (update.aiProvider as string | undefined) || current?.aiProvider || "local";
      if (active === "chatgpt" && !nextChat) update.aiProvider = nextGemini ? "gemini" : "local";
      else if (active === "gemini" && !nextGemini) update.aiProvider = nextChat ? "chatgpt" : "local";
      else if (!nextChat && !nextGemini) update.aiProvider = "local";
    }

    const settings = await AppConfig.findOneAndUpdate({ id: "app" }, update, { new: true }).lean();
    await audit(req.user!.id, "ai_settings", "config", "app", {
      ...body,
      openaiApiKey: body.openaiApiKey ? "[set]" : body.clearOpenAiKey ? "[cleared]" : undefined,
      geminiApiKey: body.geminiApiKey ? "[set]" : body.clearGeminiKey ? "[cleared]" : undefined,
    });
    const openai = await getOpenAiSettings();
    const gemini = await getGeminiSettings();
    res.json({
      data: {
        provider: settings?.aiProvider || "local",
        chatgptEnabled: Boolean(settings?.chatgptEnabled),
        geminiEnabled: Boolean(settings?.geminiEnabled),
        promptVersion: settings?.promptVersion || "1.0",
        activePrompt: settings?.activePrompt || "",
        monthlyBudgetInr: settings?.monthlyBudgetInr || 0,
        perUserDailyAiLimit: settings?.perUserDailyAiLimit || 40,
        openaiConfigured: openai.configured,
        openaiKeyHint: openai.keyHint,
        openaiModel: openai.model,
        geminiConfigured: gemini.configured,
        geminiKeyHint: gemini.keyHint,
        geminiModel: gemini.model,
        geminiModels: gemini.models,
      },
    });
  }),
);

adminRouter.post(
  "/ai/test",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only an admin can test AI settings", "FORBIDDEN");
    const body = z.object({
      openaiApiKey: z.string().min(10).max(200).optional(),
      openaiModel: z.string().min(3).max(80).optional(),
    }).parse(req.body || {});
    const result = await testOpenAiConnection(body.openaiApiKey, body.openaiModel);
    if (!result.ok) throw new HttpError(400, result.message, "OPENAI_TEST_FAILED");
    res.json({ data: result });
  }),
);

adminRouter.get(
  "/support/tickets",
  wrap(async (_req, res) => {
    const tickets = await Ticket.find().sort({ updatedAt: -1 }).limit(100).lean();
    const students = await User.find({ id: { $in: tickets.map((ticket) => ticket.studentId) } }).lean();
    const names = new Map(students.map((student) => [student.id, `${student.firstName} ${student.lastName}`.trim()]));
    res.json({ data: tickets.map((ticket) => ({ ...ticket, studentName: names.get(ticket.studentId) || "Student" })) });
  }),
);

adminRouter.get(
  "/feedback",
  wrap(async (_req, res) => {
    const items = await AppFeedback.find().sort({ createdAt: -1 }).limit(200).lean();
    const students = await User.find({ id: { $in: items.map((item) => item.studentId) } }).lean();
    const names = new Map(students.map((student) => [student.id, `${student.firstName} ${student.lastName}`.trim()]));
    res.json({
      data: items.map((item) => ({ ...item, studentName: names.get(item.studentId) || "Student" })),
    });
  }),
);

adminRouter.patch(
  "/feedback/:id",
  wrap(async (req, res) => {
    const body = z.object({ status: z.enum(["new", "reviewed", "planned", "done"]) }).parse(req.body);
    const item = await AppFeedback.findOneAndUpdate({ id: req.params.id }, body, { new: true }).lean();
    if (!item) throw new HttpError(404, "Feedback not found", "NOT_FOUND");
    await audit(req.user!.id, "feedback_status", "feedback", item.id, body);
    res.json({ data: item });
  }),
);

adminRouter.post(
  "/support/tickets/:id/reply",
  wrap(async (req, res) => {
    const body = z.object({ body: z.string().min(1), status: z.enum(["open", "in_progress", "resolved"]).optional() }).parse(req.body);
    const ticket = await Ticket.findOne({ id: req.params.id });
    if (!ticket) throw new HttpError(404, "Ticket not found", "NOT_FOUND");
    ticket.replies.push({ authorId: req.user!.id, authorRole: req.user!.role, body: body.body, createdAt: new Date() });
    ticket.status = body.status || "in_progress";
    await ticket.save();
    await Notification.create({
      id: nid(),
      userId: ticket.studentId,
      title: "Support reply",
      body: `There is a reply on “${ticket.subject}”.`,
      channel: "in_app",
      status: "delivered",
    });
    res.json({ data: ticket });
  }),
);

adminRouter.get(
  "/notifications",
  wrap(async (_req, res) => {
    res.json({ data: await Notification.find().sort({ createdAt: -1 }).limit(50).lean() });
  }),
);

adminRouter.post(
  "/notifications",
  wrap(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(2),
        body: z.string().min(2),
        userId: z.string().optional().default(""),
        channel: z.enum(["in_app", "email", "push"]).optional(),
        status: z.enum(["draft", "scheduled", "delivered"]).optional(),
      })
      .parse(req.body);
    const item = await Notification.create({
      id: nid(),
      channel: body.channel || "in_app",
      status: body.status || "delivered",
      ...body,
    });
    await audit(req.user!.id, "notification_create", "notification", item.id);
    res.status(201).json({ data: item });
  }),
);

adminRouter.get(
  "/operations",
  wrap(async (_req, res) => {
    const [students, sessions, attemptsReady, usage] = await Promise.all([
      User.countDocuments({ role: "student", status: "active" }),
      PracticeSession.countDocuments(),
      PracticeSession.countDocuments({ status: "completed" }),
      AiUsage.aggregate([{ $group: { _id: null, inr: { $sum: "$estimatedInr" }, requests: { $sum: 1 } } }]),
    ]);
    const settings = await AppConfig.findOne({ id: "app" }).lean();
    res.json({
      data: {
        activeStudents: students,
        practiceSessions: sessions,
        completedPractice: attemptsReady,
        aiSpendInr: usage[0]?.inr || 0,
        aiRequests: usage[0]?.requests || 0,
        budgetInr: settings?.monthlyBudgetInr || 0,
        database: "MongoDB Atlas",
        hostingNote: "Free-tier limits must be validated before a public launch.",
      },
    });
  }),
);

adminRouter.get(
  "/audit",
  wrap(async (req, res) => {
    const { page, limit, skip } = pageQuery(req.query);
    const [items, total] = await Promise.all([
      AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(),
    ]);
    sendList(res, items, page, limit, total);
  }),
);
