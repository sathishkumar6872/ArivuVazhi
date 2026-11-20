import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../auth.js";
import { HttpError, dayKey, nid, pageQuery, sendList, wrap } from "../http.js";
import {
  AiUsage,
  AppConfig,
  AppFeedback,
  AuditLog,
  DailyMockSet,
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
  makeChatGptBackupPrimary,
  removeChatGptBackup,
  signOutChatGpt,
  startChatGptSignIn,
  testChatGptConnection,
} from "../chatgpt-auth.js";
import { getGeminiSettings, testGeminiConnection } from "../gemini-settings.js";
import { getOpenAiSettings, testOpenAiConnection } from "../openai-settings.js";
import { fetchExamSubjectsWithAi, fetchSubjectTopicsWithAi } from "../syllabus-ai.js";
import { dailyMockJobStatus, getDailyMockRun, startDailyMockJob } from "../jobs.js";
import { currentAffairsStatus, startCurrentAffairsJob } from "../current-affairs.js";
import { canTransitionExam, allowedExamTransitions, escapeRegex, EXAM_LIFECYCLES, planSyllabusMerge } from "../governance.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin", "reviewer"));

/** Reviewers may read and decide approvals only. All other writes require admin. */
adminRouter.use((req, _res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  if (req.user?.role === "admin") return next();
  const path = req.path || "";
  if (req.user?.role === "reviewer" && req.method === "POST" && path.startsWith("/approvals")) return next();
  return next(new HttpError(403, "Reviewers can only read and decide approvals. Admin required for this write.", "FORBIDDEN"));
});

const optionSchema = z.object({ key: z.string().min(1).max(2), text: z.string().min(1) });

adminRouter.get(
  "/overview",
  wrap(async (_req, res) => {
    const [students, questions, pendingQuestions, pendingTopics, openTickets, usage] = await Promise.all([
      User.countDocuments({ role: "student" }),
      Question.countDocuments({ status: "published" }),
      Question.countDocuments({ status: "under_review" }),
      Topic.countDocuments({ status: "validation" }),
      Ticket.countDocuments({ status: { $in: ["open", "in_progress"] } }),
      AiUsage.aggregate([{ $group: { _id: null, tokens: { $sum: "$tokens" }, inr: { $sum: "$estimatedInr" }, requests: { $sum: 1 } } }]),
    ]);
    const [recentStudents, mockSets, flaggedQuestions, settings, currentAffairs] = await Promise.all([
      User.find({ role: "student" }).sort({ updatedAt: -1 }).limit(5).select("firstName lastName email lastActiveDate status").lean(),
      // Today's personal daily mock sets, by status (ready / generating / failed).
      DailyMockSet.aggregate<{ _id: string; count: number }>([
        { $match: { dayKey: dayKey() } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Question.countDocuments({ flagged: true }),
      AppConfig.findOne({ id: "app" }).select("aiProvider tutorLastError tutorLastErrorAt").lean(),
      currentAffairsStatus(),
    ]);
    const mocks = Object.fromEntries(mockSets.map((row) => [row._id, row.count]));
    res.json({
      data: {
        students,
        publishedQuestions: questions,
        awaitingApproval: pendingQuestions + pendingTopics,
        openTickets,
        flaggedQuestions,
        mocksToday: { ready: mocks.ready || 0, generating: mocks.generating || 0, failed: mocks.failed || 0 },
        aiStatus: {
          provider: settings?.aiProvider || "local",
          lastError: settings?.tutorLastError || "",
          lastErrorAt: settings?.tutorLastErrorAt || null,
        },
        currentAffairs,
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
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const filter: Record<string, unknown> = { role: "student" };
    if (q) {
      const pattern = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ email: pattern }, { firstName: pattern }, { lastName: pattern }];
    }
    if (typeof req.query.status === "string" && ["active", "inactive", "suspended"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
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
        lifecycle: z.enum(EXAM_LIFECYCLES).optional(),
        version: z.string().optional(),
        pattern: z
          .object({
            durationMinutes: z.number().positive(),
            totalQuestions: z.number().int().positive(),
            marksPerQuestion: z.number().nonnegative(),
            negativeMarks: z.number().nonnegative(),
            sections: z.array(z.object({ name: z.string().min(1), questionCount: z.number().int().nonnegative() })).optional(),
          })
          .partial()
          .optional(),
      })
      .parse(req.body);
    const current = await Exam.findOne({ id: req.params.id }).lean();
    if (!current) throw new HttpError(404, "Exam not found", "NOT_FOUND");
    if (body.lifecycle && !canTransitionExam(current.lifecycle, body.lifecycle)) {
      const next = allowedExamTransitions(current.lifecycle);
      throw new HttpError(
        400,
        `Cannot move an exam from ${current.lifecycle} to ${body.lifecycle}. Allowed: ${next.join(", ") || "none"}.`,
        "INVALID_TRANSITION",
      );
    }
    const update: Record<string, unknown> = { ...body };
    delete update.pattern;
    if (body.pattern) {
      for (const [key, value] of Object.entries(body.pattern)) update[`pattern.${key}`] = value;
    }
    const exam = await Exam.findOneAndUpdate({ id: req.params.id }, { $set: update }, { new: true }).lean();
    if (!exam) throw new HttpError(404, "Exam not found", "NOT_FOUND");
    await audit(req.user!.id, "exam_update", "exam", exam.id, {
      lifecycle: body.lifecycle,
      fromLifecycle: current.lifecycle,
      pattern: body.pattern,
    });
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

    // Non-destructive merge: matching subjects keep their IDs (and their topics,
    // questions and student progress); new ones wait in validation for approval;
    // ones no longer listed are withdrawn (hidden), never deleted.
    const existingSubjects = await Subject.find({ examId: body.examId }).lean();
    const plan = planSyllabusMerge(existingSubjects, fetched.subjects);
    await Promise.all([
      ...plan.keep.map((item) =>
        Subject.updateOne({ id: item.row.id }, { $set: { order: item.order, nameEn: item.en, nameTa: item.ta || item.row.nameTa } }),
      ),
      plan.withdraw.length
        ? Subject.updateMany({ id: { $in: plan.withdraw.map((row) => row.id) } }, { $set: { status: "draft" } })
        : Promise.resolve(),
    ]);
    const createdSubjects = plan.create.length
      ? await Subject.insertMany(
          plan.create.map((item) => ({
            id: nid(),
            examId: body.examId,
            name: item.en,
            nameEn: item.en,
            nameTa: item.ta,
            order: item.order,
            status: "validation",
          })),
        )
      : [];

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
      kept: plan.keep.length,
      proposed: createdSubjects.length,
      withdrawn: plan.withdraw.length,
    });
    res.status(201).json({
      data: {
        ...snapshot.toObject(),
        provider: fetched.provider,
        subjectCount: plan.keep.length + createdSubjects.length,
        kept: plan.keep.length,
        proposed: createdSubjects.length,
        withdrawn: plan.withdraw.length,
        note: "New subjects wait in Content Approval before students see them.",
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

    const existingTopics = await Topic.find({ examId: subject.examId, subjectId: subject.id }).lean();
    const topicPlan = planSyllabusMerge(existingTopics, fetched.topics);
    await Promise.all([
      ...topicPlan.keep.map((item) =>
        Topic.updateOne({ id: item.row.id }, { $set: { order: item.order, nameEn: item.en, nameTa: item.ta || item.row.nameTa } }),
      ),
      topicPlan.withdraw.length
        ? Topic.updateMany({ id: { $in: topicPlan.withdraw.map((row) => row.id) } }, { $set: { status: "draft" } })
        : Promise.resolve(),
    ]);
    const created = topicPlan.create.length
      ? await Topic.insertMany(
          topicPlan.create.map((item) => ({
            id: nid(),
            examId: subject.examId,
            subjectId: subject.id,
            name: item.en,
            nameEn: item.en,
            nameTa: item.ta,
            order: item.order,
            status: "validation",
          })),
        )
      : [];

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
      kept: topicPlan.keep.length,
      proposed: created.length,
      withdrawn: topicPlan.withdraw.length,
    });
    res.status(201).json({
      data: {
        subjectId: subject.id,
        provider: fetched.provider,
        topicCount: topicPlan.keep.length + created.length,
        kept: topicPlan.keep.length,
        proposed: created.length,
        withdrawn: topicPlan.withdraw.length,
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
    if (req.query.flagged === "true") filter.flagged = true;
    if (typeof req.query.reviewedBy === "string" && req.query.reviewedBy) {
      filter.reviewedBy = req.query.reviewedBy === "admin" ? { $nin: ["", "auto"] } : req.query.reviewedBy === "none" ? "" : req.query.reviewedBy;
    }
    if (typeof req.query.q === "string" && req.query.q.trim()) filter.stem = { $regex: escapeRegex(req.query.q.trim().slice(0, 80)), $options: "i" };
    // "served" = most-answered first, so the questions most students see are reviewed first.
    const sort: Record<string, 1 | -1> = req.query.sort === "served" ? { "stats.answered": -1, createdAt: -1 } : { createdAt: -1 };
    const [items, total] = await Promise.all([
      Question.find(filter).sort(sort).skip(skip).limit(limit).lean(),
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
        subjectId: z.string().min(1).optional(),
        topicId: z.string().min(1).optional(),
        subtopic: z.string().max(120).optional(),
        questionType: z.string().max(40).optional(),
        status: z.enum(["draft", "under_review", "published", "rejected", "retired"]).optional(),
        changeReason: z.string().min(8).max(500).optional(),
        oldAnswerMistake: z.string().min(8).max(1000).optional(),
        newAnswerWhyCorrect: z.string().min(8).max(1000).optional(),
      })
      .parse(req.body);
    const question = await Question.findOne({ id: req.params.id });
    if (!question) throw new HttpError(404, "Question not found", "NOT_FOUND");
    // Classification edits (subject/topic) must point at this exam's syllabus.
    if (body.topicId !== undefined) {
      const topic = await Topic.findOne({ id: body.topicId }).lean();
      if (!topic) throw new HttpError(400, "Unknown topic", "BAD_REQUEST");
      if (body.subjectId && body.subjectId !== topic.subjectId) throw new HttpError(400, "Topic is not in this subject", "BAD_REQUEST");
      body.subjectId = topic.subjectId;
    }
    if (body.subjectId !== undefined) {
      const subject = await Subject.findOne({ id: body.subjectId }).lean();
      if (!subject || subject.examId !== question.examId) throw new HttpError(400, "Unknown subject for this exam", "BAD_REQUEST");
      if (body.topicId === undefined && body.subjectId !== question.subjectId) body.topicId = "unmapped";
    }
    const contentChanging =
      body.stem !== undefined ||
      body.options !== undefined ||
      body.correctKey !== undefined ||
      body.explanation !== undefined;
    if (contentChanging) {
      if (!body.changeReason) {
        throw new HttpError(400, "changeReason required for any question content edit", "REASON_REQUIRED");
      }
      // Setting a key on a question that had none (e.g. an imported PYQ) is not a correction.
      if (body.correctKey !== undefined && body.correctKey !== question.correctKey && question.correctKey !== "?") {
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
      subjectId: body.subjectId ?? question.subjectId,
      topicId: body.topicId ?? question.topicId,
      subtopic: body.subtopic ?? question.subtopic,
      questionType: body.questionType ?? question.questionType,
      status: body.status ?? question.status,
    });
    if (body.status === "published" || body.status === "rejected" || contentChanging) {
      // An admin decision overrides the AI check and clears student-report / wrong-key flags.
      question.set({ reviewedBy: req.user!.id, flagged: false, flagReason: "" });
    }
    // An answer set by hand is an admin answer, never an "official" one.
    if (body.correctKey !== undefined && body.correctKey !== before.correctKey) question.set({ keyStatus: "admin" });
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

// PYQ management lives in routes/pyq-admin.ts (/api/v1/admin/pyq/...).

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
        "Questions are drawn from the approved question bank when you start.",
        "One attempt per mock per day.",
      ],
      ...body,
    });
    await audit(req.user!.id, "mock_create", "mock", mock.id, { examId: body.examId });
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
    const [questions, subjects, topics, sources, papers] = await Promise.all([
      Question.find({ $or: [{ status: "under_review" }, { flagged: true }] }).sort({ flagged: -1, "stats.answered": -1, createdAt: 1 }).limit(30).lean(),
      Subject.find({ status: "validation" }).limit(30).lean(),
      Topic.find({ status: "validation" }).limit(30).lean(),
      KnowledgeSource.find({ status: { $in: ["draft", "under_review"] } }).limit(30).lean(),
      PyqPaper.find({ status: "under_review" }).limit(30).lean(),
    ]);
    res.json({
      data: [
        ...questions.map((item) => ({
          type: "question",
          id: item.id,
          title: item.stem.slice(0, 120),
          status: item.flagged ? "flagged" : item.status,
          note: item.flagReason || "",
          answered: item.stats?.answered || 0,
          reports: item.reportCount || 0,
        })),
        ...subjects.map((item) => ({ type: "subject", id: item.id, title: item.nameEn || item.name, status: item.status })),
        ...topics.map((item) => ({ type: "topic", id: item.id, title: item.nameEn || item.name, status: item.status })),
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
      const item = await Question.findOneAndUpdate(
        { id },
        { $set: { status, reviewedBy: req.user!.id, flagged: false, flagReason: "" } },
        { new: true },
      ).lean();
      if (!item) throw new HttpError(404, "Question not found", "NOT_FOUND");
    } else if (type === "subject") {
      const status = decision === "approve" ? "published" : "draft";
      const item = await Subject.findOneAndUpdate({ id }, { status }, { new: true }).lean();
      if (!item) throw new HttpError(404, "Subject not found", "NOT_FOUND");
    } else if (type === "topic") {
      const status = decision === "approve" ? "published" : "draft";
      const item = await Topic.findOneAndUpdate({ id }, { status }, { new: true }).lean();
      if (!item) throw new HttpError(404, "Topic not found", "NOT_FOUND");
      // A topic can't be visible under a hidden subject.
      if (decision === "approve") {
        await Subject.updateOne({ id: item.subjectId, status: "validation" }, { $set: { status: "published" } });
      }
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
    await audit(req.user!.id, "knowledge_create", "knowledge", source.id, { examId: body.examId });
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
        tutor: {
          lastError: settings?.tutorLastError || "",
          lastErrorAt: settings?.tutorLastErrorAt || null,
        },
        localUsage: {
          todayRequests: today[0]?.requests || 0,
          todayTokens: today[0]?.tokens || 0,
          totalRequests: allTime[0]?.requests || 0,
          totalTokens: allTime[0]?.tokens || 0,
        },
      },
    });
  }),
);

adminRouter.post(
  "/ai/chatgpt/authorize",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only an admin can connect ChatGPT", "FORBIDDEN");
    const body = z.object({ backup: z.boolean().optional() }).parse(req.body || {});
    res.json({ data: await startChatGptSignIn({ backup: body.backup }) });
  }),
);

adminRouter.post(
  "/ai/chatgpt/backups/:id/primary",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only an admin can change the main ChatGPT account", "FORBIDDEN");
    await makeChatGptBackupPrimary(String(req.params.id));
    await audit(req.user!.id, "ai_chatgpt_make_primary", "config", "app", {});
    res.json({ data: await getChatGptStatus() });
  }),
);

adminRouter.delete(
  "/ai/chatgpt/backups/:id",
  wrap(async (req, res) => {
    if (req.user!.role !== "admin") throw new HttpError(403, "Only an admin can remove a ChatGPT account", "FORBIDDEN");
    const result = await removeChatGptBackup(String(req.params.id));
    await audit(req.user!.id, "ai_chatgpt_backup_remove", "config", "app", { revokedAtOpenAI: result.revoked });
    res.json({ data: { ...result, ...(await getChatGptStatus()) } });
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
    const [storage, pool] = await Promise.all([databaseUsage(), questionPool()]);
    res.json({
      data: {
        storage,
        questionPool: pool,
        activeStudents: students,
        practiceSessions: sessions,
        completedPractice: attemptsReady,
        aiSpendInr: usage[0]?.inr || 0,
        aiRequests: usage[0]?.requests || 0,
        budgetInr: settings?.monthlyBudgetInr || 0,
        database: "MongoDB Atlas",
        hostingNote: "Free-tier limits must be validated before a public launch.",
        dailyMockJob: await dailyMockJobStatus(),
      },
    });
  }),
);

/** Database size against the plan limit (DB_LIMIT_MB, default the 512 MB Atlas free tier). */
async function databaseUsage() {
  const limitMb = Number(process.env.DB_LIMIT_MB || 512);
  const stats = await mongoose.connection.db!.command({ dbStats: 1, scale: 1024 * 1024 });
  const usedMb = Number(stats.dataSize || 0) + Number(stats.indexSize || 0);
  const percent = limitMb ? Math.round((usedMb / limitMb) * 100) : 0;
  return {
    usedMb: Math.round(usedMb * 10) / 10,
    dataMb: Math.round(Number(stats.dataSize || 0) * 10) / 10,
    indexMb: Math.round(Number(stats.indexSize || 0) * 10) / 10,
    limitMb,
    percent,
    warning: percent >= 80 ? `Database is ${percent}% full. Clean up or upgrade the plan.` : "",
  };
}

/** Shared question pool per exam: published (auto / admin), awaiting review, flagged. */
async function questionPool() {
  const rows = await Question.aggregate<{ _id: { examId: string; state: string }; n: number }>([
    {
      $group: {
        _id: {
          examId: "$examId",
          state: { $cond: [{ $eq: ["$flagged", true] }, "flagged", { $cond: [{ $eq: ["$status", "published"] }, { $cond: [{ $eq: ["$reviewedBy", "auto"] }, "auto", "approved"] }, "$status"] }] },
        },
        n: { $sum: 1 },
      },
    },
  ]);
  const exams = await Exam.find({ id: { $in: [...new Set(rows.map((row) => row._id.examId))] } }).select("id name").lean();
  const name = new Map(exams.map((exam) => [exam.id, exam.name]));
  const byExam = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const counts = byExam.get(row._id.examId) || {};
    counts[row._id.state] = row.n;
    byExam.set(row._id.examId, counts);
  }
  return [...byExam.entries()].map(([examId, counts]) => ({ examId, exam: name.get(examId) || examId, ...counts }));
}

adminRouter.post(
  "/jobs/daily-mocks",
  wrap(async (req, res) => {
    const start = await startDailyMockJob("manual");
    if (!start.started) return res.status(200).json({ data: { started: false, reason: start.reason, runId: start.runId } });
    void start.done.catch((error) => console.warn(`Daily mock job failed: ${error?.message || error}`));
    await audit(req.user!.id, "job_trigger", "job", "daily_mock_sets");
    res.status(202).json({ data: { started: true, runId: start.runId } });
  }),
);

adminRouter.post(
  "/jobs/current-affairs",
  wrap(async (req, res) => {
    const start = await startCurrentAffairsJob("manual");
    if (start.started) await audit(req.user!.id, "job_trigger", "job", "current_affairs");
    res.status(start.started ? 202 : 200).json({ data: start });
  }),
);

adminRouter.get(
  "/jobs/daily-mocks/:runId",
  wrap(async (req, res) => {
    const run = await getDailyMockRun(req.params.runId);
    if (!run) throw new HttpError(404, "Job run not found", "NOT_FOUND");
    res.json({ data: run });
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
