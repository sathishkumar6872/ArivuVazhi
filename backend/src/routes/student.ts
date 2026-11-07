import { Router } from "express";
import { z } from "zod";
import { audit, publicUser, requireAuth } from "../auth.js";
import { dayKey, HttpError, nid, sendList, pageQuery, wrap } from "../http.js";
import {
  AppFeedback,
  Bookmark,
  Exam,
  Note,
  Notification,
  PlannerTask,
  PracticeSession,
  Question,
  Subject,
  Ticket,
  Topic,
  User,
} from "../models.js";

export const studentRouter = Router();
studentRouter.use(requireAuth);

function owner(req: { user?: { id: string } }) {
  if (!req.user) throw new HttpError(401, "Authentication required", "UNAUTHORIZED");
  return req.user.id;
}

studentRouter.get(
  "/me",
  wrap(async (req, res) => {
    res.json({ data: publicUser(req.user!) });
  }),
);

studentRouter.patch(
  "/profile",
  wrap(async (req, res) => {
    const body = z
      .object({
        firstName: z.string().trim().min(1).max(60).optional(),
        lastName: z.string().trim().max(60).optional(),
        phone: z.string().trim().max(20).optional(),
        language: z.enum(["ta", "en"]).optional(),
        education: z.array(z.object({ level: z.string(), institution: z.string(), year: z.string() })).optional(),
        examHistory: z.array(z.object({ examName: z.string(), year: z.string(), result: z.string() })).optional(),
        preferences: z.object({
          carryForward: z.boolean(),
          notifications: z.boolean(),
          appLanguage: z.enum(["ta", "en"]).optional(),
        }).optional(),
        aiMemoryEnabled: z.boolean().optional(),
      })
      .parse(req.body);
    const user = await User.findOneAndUpdate({ id: owner(req) }, body, { new: true }).lean();
    res.json({ data: publicUser(user as never) });
  }),
);

studentRouter.post(
  "/onboarding",
  wrap(async (req, res) => {
    const body = z
      .object({
        language: z.enum(["ta", "en"]),
        examId: z.string().min(8),
        education: z.array(z.object({ level: z.string(), institution: z.string(), year: z.string() })).optional(),
      })
      .parse(req.body);
    const exam = await Exam.findOne({ id: body.examId, lifecycle: "published" }).lean();
    if (!exam) throw new HttpError(404, "Published exam not found", "NOT_FOUND");
    const user = await User.findOneAndUpdate(
      { id: owner(req) },
      {
        language: body.language,
        primaryExamId: exam.id,
        examIds: [exam.id],
        onboardingComplete: true,
        education: body.education || [],
      },
      { new: true },
    ).lean();
    const today = dayKey();
    const existing = await PlannerTask.countDocuments({ studentId: owner(req), dueDate: today });
    if (!existing) {
      await PlannerTask.insertMany([
        { id: nid(), studentId: owner(req), examId: exam.id, title: "Read today's syllabus topic", dueDate: today, minutes: 40, status: "pending" },
        { id: nid(), studentId: owner(req), examId: exam.id, title: "Complete a 10-question practice set", dueDate: today, minutes: 25, status: "pending" },
        { id: nid(), studentId: owner(req), examId: exam.id, title: "Ask the AI Tutor one doubt", dueDate: today, minutes: 15, status: "pending" },
      ]);
    }
    await audit(owner(req), "onboarding_complete", "user", owner(req), { examId: exam.id });
    res.json({ data: publicUser(user as never) });
  }),
);

studentRouter.post(
  "/exams/:examId/select",
  wrap(async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.examId, lifecycle: "published" }).lean();
    if (!exam) throw new HttpError(404, "Published exam not found", "NOT_FOUND");
    const makePrimary = req.body?.primary !== false;
    const user = await User.findOne({ id: owner(req) });
    if (!user) throw new HttpError(404, "Account not found", "NOT_FOUND");
    if (!user.examIds.includes(exam.id)) user.examIds.push(exam.id);
    if (makePrimary) user.primaryExamId = exam.id;
    await user.save();
    res.json({ data: publicUser(user.toObject() as never) });
  }),
);

studentRouter.get(
  "/exams",
  wrap(async (_req, res) => {
    const exams = await Exam.find({ lifecycle: "published" }).sort({ name: 1 }).lean();
    res.json({ data: exams.map(presentExam) });
  }),
);

function localizedLabel(
  item: { name?: string; nameEn?: string; nameTa?: string },
  language: "en" | "ta",
) {
  if (language === "ta") return item.nameTa || item.nameEn || item.name || "";
  return item.nameEn || item.name || item.nameTa || "";
}

studentRouter.get(
  "/exams/:id",
  wrap(async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.id, lifecycle: "published" }).lean();
    if (!exam) throw new HttpError(404, "Published exam not found", "NOT_FOUND");
    const me = await User.findOne({ id: owner(req) }).lean();
    const language = (me?.language === "ta" ? "ta" : "en") as "en" | "ta";
    const subjects = await Subject.find({ examId: exam.id, status: "published" }).sort({ order: 1 }).lean();
    const topics = await Topic.find({ examId: exam.id, status: "published" }).sort({ order: 1 }).lean();
    const sessions = await PracticeSession.find({ studentId: owner(req), examId: exam.id, status: "completed" }).lean();
    const topicStats = new Map<string, { correct: number; total: number }>();
    for (const session of sessions) {
      const questions = await Question.find({ id: { $in: session.questionIds } }).select("id topicId").lean();
      const topicByQuestion = new Map(questions.map((question) => [question.id, question.topicId]));
      for (const answer of session.answers) {
        const topicId = topicByQuestion.get(answer.questionId);
        if (!topicId) continue;
        const stat = topicStats.get(topicId) || { correct: 0, total: 0 };
        stat.total += 1;
        if (answer.correct) stat.correct += 1;
        topicStats.set(topicId, stat);
      }
    }
    res.json({
      data: {
        ...presentExam(exam),
        subjects: subjects.map((subject) => ({
          ...subject,
          name: localizedLabel(subject, language),
          nameEn: subject.nameEn || subject.name,
          nameTa: subject.nameTa || subject.name,
          topics: topics
            .filter((topic) => topic.subjectId === subject.id)
            .map((topic) => {
              const stat = topicStats.get(topic.id) || { correct: 0, total: 0 };
              const accuracy = stat.total ? Math.round((stat.correct / stat.total) * 100) : 0;
              return {
                ...topic,
                name: localizedLabel(topic, language),
                nameEn: topic.nameEn || topic.name,
                nameTa: topic.nameTa || topic.name,
                attempted: stat.total,
                accuracy,
                studied: stat.total >= 2 && accuracy >= 60,
              };
            }),
        })),
      },
    });
  }),
);

function presentExam(exam: any) {
  return {
    id: exam.id,
    name: exam.name,
    code: exam.code,
    authority: exam.authority,
    description: exam.description,
    lifecycle: exam.lifecycle,
    version: exam.version,
    pattern: exam.pattern,
  };
}

studentRouter.get(
  "/planner",
  wrap(async (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : dayKey();
    const user = await User.findOne({ id: owner(req) }).lean();
    // Browsing future days must be read-only. Carry unfinished work only when
    // today's plan is requested; otherwise a week view can repeatedly push the
    // same tasks through every date it loads.
    if (user?.preferences?.carryForward && date === dayKey()) {
      await PlannerTask.updateMany(
        { studentId: owner(req), status: "pending", dueDate: { $lt: date } },
        { dueDate: date },
      );
    }
    const tasks = await PlannerTask.find({ studentId: owner(req), dueDate: date }).sort({ createdAt: 1 }).lean();
    res.json({ data: tasks });
  }),
);

studentRouter.post(
  "/planner",
  wrap(async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(2).max(160),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        minutes: z.number().int().min(5).max(240).optional(),
        examId: z.string().optional(),
      })
      .parse(req.body);
    const task = await PlannerTask.create({
      id: nid(),
      studentId: owner(req),
      examId: body.examId || req.user!.primaryExamId,
      title: body.title,
      dueDate: body.dueDate,
      minutes: body.minutes || 30,
    });
    res.status(201).json({ data: task });
  }),
);

studentRouter.patch(
  "/planner/:id",
  wrap(async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(2).max(160).optional(),
        status: z.enum(["pending", "completed", "skipped"]).optional(),
        minutes: z.number().int().min(5).max(240).optional(),
      })
      .parse(req.body);
    const task = await PlannerTask.findOneAndUpdate({ id: req.params.id, studentId: owner(req) }, body, { new: true }).lean();
    if (!task) throw new HttpError(404, "Task not found", "NOT_FOUND");
    res.json({ data: task });
  }),
);

studentRouter.get(
  "/analytics",
  wrap(async (req, res) => {
    const sessions = await PracticeSession.find({ studentId: owner(req), status: "completed" }).lean();
    let correct = 0;
    let total = 0;
    const bySubject = new Map<string, { name: string; correct: number; total: number }>();
    for (const session of sessions) {
      const questions = await Question.find({ id: { $in: session.questionIds } }).lean();
      const subjects = await Subject.find({ id: { $in: questions.map((question) => question.subjectId) } }).lean();
      const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]));
      const questionMap = new Map(questions.map((question) => [question.id, question]));
      for (const answer of session.answers) {
        total += 1;
        if (answer.correct) correct += 1;
        const question = questionMap.get(answer.questionId);
        if (!question) continue;
        const name = subjectName.get(question.subjectId) || "Subject";
        const bucket = bySubject.get(question.subjectId) || { name, correct: 0, total: 0 };
        bucket.total += 1;
        if (answer.correct) bucket.correct += 1;
        bySubject.set(question.subjectId, bucket);
      }
    }
    const examId = req.user!.primaryExamId;
    const topicCount = examId ? await Topic.countDocuments({ examId, status: "published" }) : 0;
    const studiedTopics = new Set<string>();
    if (examId) {
      const examSessions = sessions.filter((session) => session.examId === examId);
      for (const session of examSessions) {
        const questions = await Question.find({ id: { $in: session.answers.filter((answer) => answer.correct).map((answer) => answer.questionId) } }).lean();
        questions.forEach((question) => studiedTopics.add(question.topicId));
      }
    }
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    const syllabus = topicCount ? Math.round((studiedTopics.size / topicCount) * 100) : 0;
    const readiness = total < 8 ? "Building" : accuracy >= 75 && syllabus >= 40 ? "Strong trend" : "Developing";
    res.json({
      data: {
        accuracy,
        attempted: total,
        streak: req.user!.streak,
        syllabusCompletion: syllabus,
        studiedTopics: studiedTopics.size,
        topicCount,
        readiness,
        caveat: "Readiness is an estimate from your practice. It is not a guarantee of passing.",
        subjects: [...bySubject.values()].map((subject) => ({
          name: subject.name,
          accuracy: subject.total ? Math.round((subject.correct / subject.total) * 100) : 0,
          attempted: subject.total,
        })),
      },
    });
  }),
);

studentRouter.get(
  "/bookmarks",
  wrap(async (req, res) => {
    const bookmarks = await Bookmark.find({ studentId: owner(req) }).sort({ createdAt: -1 }).lean();
    const questions = await Question.find({ id: { $in: bookmarks.map((item) => item.questionId) }, status: "published" })
      .select("-correctKey")
      .lean();
    res.json({ data: questions });
  }),
);

studentRouter.post(
  "/bookmarks",
  wrap(async (req, res) => {
    const questionId = z.object({ questionId: z.string() }).parse(req.body).questionId;
    const question = await Question.findOne({ id: questionId, status: "published" }).lean();
    if (!question) throw new HttpError(404, "Question not found", "NOT_FOUND");
    const existing = await Bookmark.findOne({ studentId: owner(req), questionId }).lean();
    if (existing) return res.json({ data: existing });
    const bookmark = await Bookmark.create({ id: nid(), studentId: owner(req), questionId });
    res.status(201).json({ data: bookmark });
  }),
);

studentRouter.delete(
  "/bookmarks/:questionId",
  wrap(async (req, res) => {
    await Bookmark.deleteOne({ studentId: owner(req), questionId: req.params.questionId });
    res.json({ data: { removed: true } });
  }),
);

studentRouter.get(
  "/notes",
  wrap(async (req, res) => {
    const notes = await Note.find({ studentId: owner(req) }).sort({ updatedAt: -1 }).lean();
    res.json({ data: notes });
  }),
);

studentRouter.post(
  "/notes",
  wrap(async (req, res) => {
    const body = z.object({ body: z.string().trim().min(1).max(4000), topicId: z.string().optional() }).parse(req.body);
    const note = await Note.create({ id: nid(), studentId: owner(req), topicId: body.topicId || "", body: body.body });
    res.status(201).json({ data: note });
  }),
);

studentRouter.delete(
  "/notes/:id",
  wrap(async (req, res) => {
    const result = await Note.deleteOne({ id: req.params.id, studentId: owner(req) });
    if (!result.deletedCount) throw new HttpError(404, "Note not found", "NOT_FOUND");
    res.json({ data: { removed: true } });
  }),
);

studentRouter.get(
  "/notifications",
  wrap(async (req, res) => {
    const items = await Notification.find({
      status: "delivered",
      $or: [{ userId: "" }, { userId: owner(req) }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({
      data: items.map((item) => ({ ...item, read: item.readBy.includes(owner(req)) })),
    });
  }),
);

studentRouter.post(
  "/notifications/:id/read",
  wrap(async (req, res) => {
    const item = await Notification.findOne({ id: req.params.id, $or: [{ userId: "" }, { userId: owner(req) }] });
    if (!item) throw new HttpError(404, "Notification not found", "NOT_FOUND");
    if (!item.readBy.includes(owner(req))) item.readBy.push(owner(req));
    await item.save();
    res.json({ data: { read: true } });
  }),
);

studentRouter.get(
  "/support/tickets",
  wrap(async (req, res) => {
    const { page, limit, skip } = pageQuery(req.query);
    const filter = { studentId: owner(req) };
    const [items, total] = await Promise.all([
      Ticket.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Ticket.countDocuments(filter),
    ]);
    sendList(res, items, page, limit, total);
  }),
);

studentRouter.post(
  "/support/tickets",
  wrap(async (req, res) => {
    const body = z
      .object({
        subject: z.string().trim().min(3).max(140),
        body: z.string().trim().min(3).max(4000),
        category: z.string().trim().max(40).optional(),
        priority: z.enum(["normal", "high"]).optional(),
      })
      .parse(req.body);
    const ticket = await Ticket.create({ id: nid(), studentId: owner(req), ...body, category: body.category || "general" });
    res.status(201).json({ data: ticket });
  }),
);

studentRouter.post(
  "/support/tickets/:id/reply",
  wrap(async (req, res) => {
    const body = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body).body;
    const ticket = await Ticket.findOne({ id: req.params.id, studentId: owner(req) });
    if (!ticket) throw new HttpError(404, "Ticket not found", "NOT_FOUND");
    ticket.replies.push({ authorId: owner(req), authorRole: "student", body, createdAt: new Date() });
    if (ticket.status === "resolved") ticket.status = "open";
    await ticket.save();
    res.json({ data: ticket });
  }),
);

studentRouter.get(
  "/feedback",
  wrap(async (req, res) => {
    const items = await AppFeedback.find({ studentId: owner(req) }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ data: items });
  }),
);

studentRouter.post(
  "/feedback",
  wrap(async (req, res) => {
    const body = z
      .object({
        category: z.enum(["app_update", "new_feature", "bug", "general"]),
        message: z.string().trim().min(5).max(4000),
        rating: z.number().int().min(1).max(5).optional(),
        appVersion: z.string().max(40).optional(),
      })
      .parse(req.body);
    const item = await AppFeedback.create({
      id: nid(),
      studentId: owner(req),
      category: body.category,
      message: body.message,
      rating: body.rating ?? null,
      appVersion: body.appVersion || "",
      status: "new",
    });
    res.status(201).json({ data: item });
  }),
);

studentRouter.get(
  "/dashboard",
  wrap(async (req, res) => {
    const user = req.user!;
    const exam = user.primaryExamId ? await Exam.findOne({ id: user.primaryExamId }).lean() : null;
    const today = dayKey();
    if (user.preferences?.carryForward) {
      await PlannerTask.updateMany({ studentId: user.id, status: "pending", dueDate: { $lt: today } }, { dueDate: today });
    }
    const tasks = await PlannerTask.find({ studentId: user.id, dueDate: today }).lean();
    const sessions = await PracticeSession.find({ studentId: user.id, status: "completed" }).lean();
    let correct = 0;
    let total = 0;
    sessions.forEach((session) => {
      session.answers.forEach((answer) => {
        total += 1;
        if (answer.correct) correct += 1;
      });
    });
    const unread = await Notification.countDocuments({
      status: "delivered",
      readBy: { $ne: user.id },
      $or: [{ userId: "" }, { userId: user.id }],
    });
    res.json({
      data: {
        greetingName: user.firstName,
        exam: exam ? { id: exam.id, name: exam.name, authority: exam.authority } : null,
        streak: user.streak,
        accuracy: total ? Math.round((correct / total) * 100) : 0,
        tasks,
        unreadNotifications: unread,
        onboardingComplete: user.onboardingComplete,
      },
    });
  }),
);
