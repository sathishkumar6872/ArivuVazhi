import express, { Router } from "express";
import { z } from "zod";
import { audit, requireAuth, requireRole } from "../auth.js";
import { HttpError, nid, wrap } from "../http.js";
import { AppConfig, Exam, PyqCollection, PyqDocument, PyqJob, PyqPaper, PyqSource, Question, Subject, Topic } from "../models.js";
import { QUESTION_TYPES } from "../pyq/extract.js";
import { downloadFile } from "../storage/index.js";
import { addDocument, claimDocument, linkDocument, matchStatus, publishSession, retryDocument, reviewDocument } from "../pyq/documents.js";
import { failStaleJobs, missingDocuments, runDiscovery } from "../pyq/discovery.js";

/** Admin PYQ management. Reviewers may read; only admins change anything. */
export const pyqAdminRouter = Router();
pyqAdminRouter.use(requireAuth, requireRole("admin", "reviewer"));
pyqAdminRouter.use((req, _res, next) => {
  if (req.method === "GET" || req.user?.role === "admin") return next();
  return next(new HttpError(403, "Only an admin can change PYQ data.", "FORBIDDEN"));
});

const fileBody = express.raw({ type: ["application/pdf", "image/png", "image/jpeg", "image/webp"], limit: "60mb" });
const session = {
  stage: z.string().max(120).optional().default(""),
  paperName: z.string().max(120).optional().default(""),
  language: z.enum(["en", "ta", "bilingual", ""]).optional().default(""),
  shift: z.string().max(60).optional().default(""),
  subjectCode: z.string().max(20).optional().default(""),
};

// ---------- AI provider for PYQ work ----------

pyqAdminRouter.get(
  "/settings",
  wrap(async (_req, res) => {
    const settings = await AppConfig.findOne({ id: "app" }).lean();
    res.json({
      data: {
        provider: settings?.pyqProvider || "auto",
        activeProvider: settings?.aiProvider || "local",
        chatgptEnabled: Boolean(settings?.chatgptEnabled ?? settings?.aiProvider === "chatgpt"),
        geminiEnabled: Boolean(settings?.geminiEnabled ?? settings?.aiProvider === "gemini"),
      },
    });
  }),
);

pyqAdminRouter.put(
  "/settings",
  wrap(async (req, res) => {
    const body = z.object({ provider: z.enum(["auto", "chatgpt", "gemini"]) }).parse(req.body);
    await AppConfig.updateOne({ id: "app" }, { $set: { pyqProvider: body.provider } }, { upsert: true });
    await audit(req.user!.id, "pyq_provider_update", "settings", "app", body);
    res.json({ data: body });
  }),
);

// ---------- Sessions (exam + year + stage + paper + language + shift) ----------

pyqAdminRouter.get(
  "/sessions",
  wrap(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (typeof req.query.examId === "string" && req.query.examId) filter.examId = req.query.examId;
    if (typeof req.query.year === "string" && req.query.year) filter.year = Number(req.query.year);
    const sessions = await PyqPaper.find(filter).sort({ year: -1, paperName: 1 }).lean();
    const docs = await PyqDocument.find({ paperId: { $in: sessions.map((row) => row.id) } }).select("paperId docType status").lean();
    res.json({
      data: sessions.map((row) => {
        const mine = docs.filter((doc) => doc.paperId === row.id);
        return { ...row, documents: mine.length, matchStatus: matchStatus(mine) };
      }),
    });
  }),
);

pyqAdminRouter.get(
  "/sessions/:id",
  wrap(async (req, res) => {
    const row = await PyqPaper.findOne({ id: req.params.id }).lean();
    if (!row) throw new HttpError(404, "Session not found", "NOT_FOUND");
    const [documents, questions, subjects, topics] = await Promise.all([
      PyqDocument.find({ paperId: row.id }).sort({ docType: 1, createdAt: 1 }).lean(),
      Question.find({ pyqPaperId: row.id }).sort({ pyqNumber: 1 }).lean(),
      Subject.find({ examId: row.examId }).sort({ order: 1 }).select("id name").lean(),
      Topic.find({ examId: row.examId }).sort({ order: 1 }).select("id name subjectId").lean(),
    ]);
    // Syllabus lists let the admin correct each question's subject/topic.
    res.json({ data: { ...row, documents, questions, matchStatus: matchStatus(documents), syllabus: { subjects, topics, questionTypes: QUESTION_TYPES } } });
  }),
);

pyqAdminRouter.patch(
  "/sessions/:id",
  wrap(async (req, res) => {
    const body = z.object({ rightsStatus: z.enum(["pending", "verified", "rejected"]).optional(), title: z.string().min(2).max(200).optional() }).parse(req.body);
    const row = await PyqPaper.findOneAndUpdate({ id: req.params.id }, { $set: body }, { new: true }).lean();
    if (!row) throw new HttpError(404, "Session not found", "NOT_FOUND");
    await audit(req.user!.id, "pyq_session_update", "pyq", row.id, body);
    res.json({ data: row });
  }),
);

pyqAdminRouter.post("/sessions/:id/publish", wrap(async (req, res) => res.json({ data: await publishSession(req.params.id, req.user!.id) })));

// ---------- Documents ----------

/** Manual upload of a question paper or answer key (PDF or scanned image). */
pyqAdminRouter.post(
  "/documents",
  fileBody,
  wrap(async (req, res) => {
    const query = z
      .object({
        examId: z.string().min(8),
        year: z.coerce.number().int().min(1980).max(2100),
        docType: z.enum(["question_paper", "answer_key"]),
        keyVersion: z.enum(["tentative", "final", "revised", ""]).optional().default(""),
        sourceName: z.string().min(2).max(200),
        sourceUrl: z.string().url().max(500).optional().or(z.literal("")),
        fileName: z.string().min(1).max(200),
        ...session,
      })
      .parse(req.query);
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const mimeType = String(req.headers["content-type"] || "").split(";")[0].trim();
    try {
      const doc = await addDocument({
        ...query,
        buffer,
        mimeType,
        source: { kind: "manual", name: query.sourceName, url: query.sourceUrl || "" },
        actorId: req.user!.id,
      });
      res.status(202).json({ data: doc });
    } catch (error) {
      if ((error as { code?: string }).code === "DUPLICATE_DOCUMENT") {
        return res.status(409).json({ error: { code: "DUPLICATE_DOCUMENT", message: (error as Error).message, documentId: (error as { documentId?: string }).documentId } });
      }
      throw error;
    }
  }),
);

pyqAdminRouter.get(
  "/documents",
  wrap(async (req, res) => {
    const filter: Record<string, unknown> = {};
    for (const key of ["examId", "status", "docType"]) if (typeof req.query[key] === "string" && req.query[key]) filter[key] = req.query[key];
    if (req.query.unmatched === "true") filter.paperId = "";
    res.json({ data: await PyqDocument.find(filter).sort({ year: -1, createdAt: -1 }).limit(300).lean() });
  }),
);

pyqAdminRouter.get(
  "/documents/:id",
  wrap(async (req, res) => {
    const doc = await PyqDocument.findOne({ id: req.params.id }).lean();
    if (!doc) throw new HttpError(404, "Document not found", "NOT_FOUND");
    res.json({ data: doc });
  }),
);

/** The original file, for side-by-side review (served inline; admins/reviewers only). */
pyqAdminRouter.get(
  "/documents/:id/file",
  wrap(async (req, res) => {
    const doc = await PyqDocument.findOne({ id: req.params.id }).lean();
    if (!doc) throw new HttpError(404, "Document not found", "NOT_FOUND");
    if (!doc.fileId) throw new HttpError(404, "The original file is not in storage.", "FILE_NOT_STORED");
    const { file, buffer } = await downloadFile(doc.fileId, req.user!);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
  }),
);

pyqAdminRouter.post("/documents/:id/retry", wrap(async (req, res) => {
  const found = await PyqDocument.findOne({ id: req.params.id }).select("id splitFrom").lean();
  if (!found) throw new HttpError(404, "Document not found", "NOT_FOUND");
  // A part of a split answer key is re-read through its original PDF (which recreates the parts).
  const doc = found.splitFrom ? { id: found.splitFrom } : found;
  // Mark it at once so the admin (and polling) sees the retry has started; 409 if it is already running.
  await claimDocument(doc.id);
  await retryDocument(doc.id, req.user!.id);
  res.status(202).json({ data: { id: doc.id, status: "processing" } });
}));

pyqAdminRouter.post(
  "/documents/:id/review",
  wrap(async (req, res) => {
    const body = z.object({ decision: z.enum(["approve", "reject"]) }).parse(req.body);
    res.json({ data: await reviewDocument(req.params.id, body.decision, req.user!.id) });
  }),
);

pyqAdminRouter.post(
  "/documents/:id/link",
  wrap(async (req, res) => {
    const body = z.object({ paperId: z.string().min(8) }).parse(req.body);
    res.json({ data: await linkDocument(req.params.id, body.paperId, req.user!.id) });
  }),
);

// ---------- Collection settings and overview ----------

pyqAdminRouter.get(
  "/collections/:examId",
  wrap(async (req, res) => res.json({ data: await PyqCollection.findOne({ examId: req.params.examId }).lean() })),
);

pyqAdminRouter.put(
  "/collections/:examId",
  wrap(async (req, res) => {
    const year = new Date().getFullYear();
    const body = z
      .object({
        startYear: z.number().int().min(1980).max(year + 1),
        endYear: z.number().int().min(1980).max(year + 1),
        languages: z.array(z.enum(["en", "ta", "bilingual"])).min(1),
        stages: z.array(z.string().min(1).max(120)).max(20).default([]),
        method: z.enum(["manual", "automatic", "both"]),
        docTypes: z.array(z.enum(["question_paper", "answer_key"])).min(1),
        schedule: z.enum(["off", "weekly"]).default("off"),
      })
      .refine((value) => value.startYear <= value.endYear, "Start year must be on or before end year")
      .parse(req.body);
    if (!(await Exam.exists({ id: req.params.examId }))) throw new HttpError(404, "Exam not found", "NOT_FOUND");
    const row = await PyqCollection.findOneAndUpdate({ examId: req.params.examId }, { $set: { ...body, examId: req.params.examId } }, { upsert: true, new: true }).lean();
    await audit(req.user!.id, "pyq_collection_update", "exam", req.params.examId, body);
    res.json({ data: row });
  }),
);

/** Year-by-year coverage for the selected range: what is found, missing or waiting. */
pyqAdminRouter.get(
  "/overview",
  wrap(async (req, res) => {
    const examId = z.string().min(8).parse(req.query.examId);
    const settings = await PyqCollection.findOne({ examId }).lean();
    const year = new Date().getFullYear();
    const range = settings || { startYear: year - 4, endYear: year, docTypes: ["question_paper", "answer_key"] };
    const docs = await PyqDocument.find({ examId, year: { $gte: range.startYear, $lte: range.endYear } }).select("year docType status paperId").lean();
    const years = [];
    for (let y = range.endYear; y >= range.startYear; y -= 1) {
      const mine = docs.filter((doc) => doc.year === y);
      years.push({
        year: y,
        questionPapers: mine.filter((doc) => doc.docType === "question_paper" && doc.status !== "rejected" && doc.status !== "link_only").length,
        answerKeys: mine.filter((doc) => doc.docType === "answer_key" && doc.status !== "rejected" && doc.status !== "link_only").length,
        linkOnly: mine.filter((doc) => doc.status === "link_only").length,
        awaitingReview: mine.filter((doc) => doc.status === "processed").length,
        failed: mine.filter((doc) => doc.status === "failed").length,
        status: matchStatus(mine),
      });
    }
    res.json({ data: { settings, years, missing: await missingDocuments(examId, range) } });
  }),
);

// ---------- Discovery sources ----------

const sourceBody = z.object({
  name: z.string().min(2).max(120),
  url: z.string().url().max(500).refine((url) => url.startsWith("https://") || url.startsWith("http://"), "Use an http(s) URL"),
  type: z.enum(["official", "verified"]).default("official"),
  examIds: z.array(z.string()).max(50).default([]),
  enabled: z.boolean().default(true),
});

pyqAdminRouter.get("/sources", wrap(async (_req, res) => res.json({ data: await PyqSource.find().sort({ type: 1, name: 1 }).lean() })));

pyqAdminRouter.post(
  "/sources",
  wrap(async (req, res) => {
    const body = sourceBody.parse(req.body);
    const row = await PyqSource.create({ id: nid(), ...body });
    await audit(req.user!.id, "pyq_source_create", "pyq_source", row.id, { url: body.url });
    res.status(201).json({ data: row });
  }),
);

pyqAdminRouter.patch(
  "/sources/:id",
  wrap(async (req, res) => {
    const body = sourceBody.partial().parse(req.body);
    const row = await PyqSource.findOneAndUpdate({ id: req.params.id }, { $set: body }, { new: true }).lean();
    if (!row) throw new HttpError(404, "Source not found", "NOT_FOUND");
    await audit(req.user!.id, "pyq_source_update", "pyq_source", row.id, body);
    res.json({ data: row });
  }),
);

pyqAdminRouter.delete(
  "/sources/:id",
  wrap(async (req, res) => {
    const result = await PyqSource.deleteOne({ id: req.params.id });
    if (!result.deletedCount) throw new HttpError(404, "Source not found", "NOT_FOUND");
    await audit(req.user!.id, "pyq_source_delete", "pyq_source", req.params.id);
    res.json({ data: { deleted: true } });
  }),
);

// ---------- Discovery jobs ----------

pyqAdminRouter.post(
  "/discovery/run",
  wrap(async (req, res) => {
    const body = z.object({ examId: z.string().min(8) }).parse(req.body);
    const job = await runDiscovery(body.examId, "manual", req.user!.id);
    await audit(req.user!.id, "pyq_discovery_run", "exam", body.examId, { jobId: job.id });
    res.status(202).json({ data: job });
  }),
);

/** Add "reading questions" progress: how many of the job's documents are processed. */
async function withReading<T extends { documentIds?: string[] }>(jobs: T[]) {
  const ids = jobs.flatMap((job) => job.documentIds || []);
  const docs = ids.length ? await PyqDocument.find({ id: { $in: ids } }).select("id status").lean() : [];
  const state = new Map(docs.map((doc) => [doc.id, doc.status]));
  return jobs.map((job) => {
    const mine = (job.documentIds || []).map((id) => state.get(id));
    return {
      ...job,
      reading: {
        total: mine.length,
        done: mine.filter((status) => status && status !== "uploaded" && status !== "processing").length,
        failed: mine.filter((status) => status === "failed").length,
      },
    };
  });
}

pyqAdminRouter.get(
  "/jobs",
  wrap(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (typeof req.query.examId === "string" && req.query.examId) filter.examId = req.query.examId;
    await failStaleJobs();
    res.json({ data: await withReading(await PyqJob.find(filter).sort({ createdAt: -1 }).limit(30).lean()) });
  }),
);

pyqAdminRouter.get(
  "/jobs/:id",
  wrap(async (req, res) => {
    const job = await PyqJob.findOne({ id: req.params.id }).lean();
    if (!job) throw new HttpError(404, "Job not found", "NOT_FOUND");
    res.json({ data: (await withReading([job]))[0] });
  }),
);
