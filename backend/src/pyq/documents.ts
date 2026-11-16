import crypto from "node:crypto";
import { audit } from "../auth.js";
import { nameKey, stemKey } from "../governance.js";
import { HttpError, nid } from "../http.js";
import { Exam, PyqDocument, PyqPaper, Question, QuestionChangeLog, Subject, Topic } from "../models.js";
import { downloadFile, storageReady, uploadFile } from "../storage/index.js";
import { scheduleAnalysis } from "./analysis.js";
import { QUESTION_TYPES, extractAnswers, extractQuestions } from "./extract.js";

const KEYS = ["A", "B", "C", "D", "E", "F"];
export const DOC_TYPES = { "application/pdf": 60 * 1024 * 1024, "image/png": 10 * 1024 * 1024, "image/jpeg": 10 * 1024 * 1024, "image/webp": 10 * 1024 * 1024 } as const;
/** Answer key precedence when several versions exist: revised > final > tentative. */
const KEY_RANK: Record<string, number> = { revised: 3, final: 2, tentative: 1 };
const KEY_STATUS: Record<string, "official_revised" | "official_final" | "official_tentative"> = {
  revised: "official_revised",
  final: "official_final",
  tentative: "official_tentative",
};

export type SessionInfo = { examId: string; year: number; stage?: string; paperName?: string; language?: "en" | "ta" | "bilingual" | ""; shift?: string; subjectCode?: string };

/** Printed subject/paper code in a text, e.g. "(Subject Code 004)" or "Subject Code: 003" → "004" / "003". */
export function subjectCodeOf(text: string) {
  return /subject\s*code\s*[:\-]?\s*\(?\s*(\d{2,4})\b/i.exec(text || "")?.[1] || "";
}

const clean = (value?: string) => (value || "").trim().slice(0, 120);

function sessionFilter(info: SessionInfo) {
  return { examId: info.examId, year: info.year, stage: clean(info.stage), paperName: clean(info.paperName), language: info.language || "", shift: clean(info.shift) };
}

/** The session (PyqPaper) for these details, created on first use. */
async function sessionFor(info: SessionInfo, sourceName: string) {
  const filter = sessionFilter(info);
  const existing = await PyqPaper.findOne(filter);
  if (existing) {
    if (info.subjectCode && !existing.subjectCode) {
      existing.subjectCode = info.subjectCode;
      await existing.save();
    }
    return existing;
  }
  const exam = await Exam.findOne({ id: info.examId }).select("name").lean();
  const title = [exam?.name || "Exam", filter.year, filter.stage, filter.paperName, filter.shift].filter(Boolean).join(" · ");
  return PyqPaper.create({ id: nid(), ...filter, subjectCode: clean(info.subjectCode), title, sourceName: sourceName || "Official", status: "under_review", rightsStatus: "pending", generationSource: "import" });
}

/**
 * Add an original document (manual upload or discovery). Duplicate files (same hash)
 * are refused. Question papers join their session at once; answer keys join only a
 * session that already has a question paper with exactly the same details, otherwise
 * they wait for manual matching. Processing runs in the background.
 */
export async function addDocument(input: SessionInfo & {
  docType: "question_paper" | "answer_key";
  keyVersion?: "tentative" | "final" | "revised" | "";
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  source: { kind: "manual" | "discovered"; name: string; url?: string; sourceId?: string; pageUrl?: string };
  actorId: string;
}) {
  const limit = DOC_TYPES[input.mimeType as keyof typeof DOC_TYPES];
  if (!limit) throw new HttpError(415, "Upload a PDF, PNG, JPEG or WEBP file.", "FILE_TYPE");
  if (!input.buffer?.length) throw new HttpError(400, "The file is empty.", "BAD_REQUEST");
  if (input.buffer.length > limit) throw new HttpError(413, `File is larger than ${Math.round(limit / 1024 / 1024)} MB.`, "FILE_TOO_LARGE");
  if (input.mimeType === "application/pdf" && input.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(400, "File is not a PDF.", "BAD_REQUEST");
  if (!(await Exam.exists({ id: input.examId }))) throw new HttpError(404, "Exam not found", "NOT_FOUND");
  const sha256 = crypto.createHash("sha256").update(input.buffer).digest("hex");
  const duplicate = await PyqDocument.findOne({ sha256, status: { $ne: "rejected" } }).select("id year docType").lean();
  if (duplicate) throw Object.assign(new HttpError(409, `This file was already added (${duplicate.docType.replace("_", " ")}, ${duplicate.year}).`, "DUPLICATE_DOCUMENT"), { documentId: duplicate.id });

  const filter = sessionFilter(input);
  let paperId = "";
  if (input.docType === "question_paper") {
    paperId = (await sessionFor(input, input.source.name)).id;
  } else {
    const session = await PyqPaper.findOne(filter).select("id").lean();
    if (session && (await PyqDocument.exists({ paperId: session.id, docType: "question_paper", status: { $ne: "rejected" } }))) paperId = session.id;
  }
  const keyVersion = input.docType === "answer_key" ? input.keyVersion || "final" : "";
  const versionNo = input.docType === "answer_key" && paperId ? (await PyqDocument.countDocuments({ paperId, docType: "answer_key", keyVersion })) + 1 : 1;

  const id = nid();
  let fileId = "";
  if (await storageReady()) {
    const exam = await Exam.findOne({ id: input.examId }).select("name").lean();
    try {
      const file = await uploadFile({
        buffer: input.buffer,
        name: input.fileName,
        mimeType: input.mimeType,
        kind: input.docType === "question_paper" ? "pyq_paper" : "pyq_answer_key",
        ownerType: input.source.kind === "manual" ? "admin" : "system",
        ownerId: input.actorId,
        refType: "pyq_document",
        refId: id,
        folderPath: ["PYQ", exam?.name || input.examId, String(input.year), filter.paperName || "General", input.docType === "question_paper" ? "question-papers" : "answer-keys"],
      });
      fileId = file.id;
    } catch (error) {
      console.warn(`PYQ document ${id}: not saved to storage: ${error instanceof Error ? error.message : error}`);
    }
  }
  const doc = await PyqDocument.create({
    id,
    paperId,
    ...filter,
    subjectCode: clean(input.subjectCode),
    docType: input.docType,
    keyVersion,
    versionNo,
    fileId,
    fileName: input.fileName.slice(0, 200),
    mimeType: input.mimeType,
    size: input.buffer.length,
    sha256,
    source: { kind: input.source.kind, name: input.source.name, url: input.source.url || "", sourceId: input.source.sourceId || "", pageUrl: input.source.pageUrl || "" },
    status: "uploaded",
    uploadedBy: input.actorId,
  });
  await audit(input.actorId, "pyq_document_add", "pyq_document", id, { docType: input.docType, year: input.year, source: input.source.kind, stored: Boolean(fileId) });
  // Stored originals are read again when their turn comes, so queued files do not sit in memory.
  queueProcessing(id, fileId ? undefined : input.buffer);
  return doc.toObject();
}

/** A "found but not downloadable" document: the admin downloads it and uploads it. */
export async function addLinkOnly(input: SessionInfo & { docType: "question_paper" | "answer_key"; keyVersion?: string; url: string; pageUrl?: string; sourceName: string; sourceId: string; reason: string }) {
  if (await PyqDocument.exists({ $or: [{ "source.url": input.url }, { alsoFoundAt: input.url }] })) return null;
  return PyqDocument.create({
    id: nid(),
    ...sessionFilter(input),
    subjectCode: clean(input.subjectCode),
    docType: input.docType,
    keyVersion: input.docType === "answer_key" ? input.keyVersion || "final" : "",
    source: { kind: "discovered", name: input.sourceName, url: input.url, sourceId: input.sourceId, pageUrl: input.pageUrl || "" },
    status: "link_only",
    warnings: [input.reason],
  });
}

async function syllabusText(examId: string) {
  const [subjects, topics] = await Promise.all([
    Subject.find({ examId, status: { $ne: "draft" } }).sort({ order: 1 }).lean(),
    Topic.find({ examId, status: { $ne: "draft" } }).sort({ order: 1 }).lean(),
  ]);
  const text = subjects
    .map((subject) => `- ${subject.nameEn || subject.name}: ${topics.filter((topic) => topic.subjectId === subject.id).map((topic) => topic.nameEn || topic.name).join("; ")}`)
    .join("\n");
  return { subjects, topics, text };
}

function matchByName<T extends { name: string; nameEn?: string | null; nameTa?: string | null }>(rows: T[], wanted: string) {
  const key = nameKey(wanted);
  if (!key) return undefined;
  const names = (row: T) => [row.nameEn, row.name, row.nameTa].map(nameKey).filter(Boolean);
  return rows.find((row) => names(row).includes(key)) || rows.find((row) => names(row).some((name) => name.includes(key) || key.includes(name)));
}

/** Read the original file again from storage (for retries). */
async function originalBytes(doc: { fileId: string }) {
  if (!doc.fileId) throw new HttpError(409, "The original file is not in storage. Upload it again.", "FILE_NOT_STORED");
  return (await downloadFile(doc.fileId, { id: "system", role: "admin" })).buffer;
}

/** Extract a document's content. Question papers → PYQ questions; answer keys → official answers + validation. */
export async function processDocument(documentId: string, buffer?: Buffer) {
  const doc = await PyqDocument.findOne({ id: documentId });
  if (!doc) throw new HttpError(404, "Document not found", "NOT_FOUND");
  if (doc.status === "link_only") throw new HttpError(409, "Upload this document first.", "LINK_ONLY");
  doc.set({ status: "processing", processing: { method: "", error: "", questions: 0, answers: 0, startedAt: new Date(), finishedAt: null }, warnings: [] });
  await doc.save();
  try {
    const bytes = buffer || (await originalBytes(doc));
    const exam = await Exam.findOne({ id: doc.examId }).lean();
    if (!exam) throw new HttpError(404, "Exam not found", "NOT_FOUND");
    if (doc.docType === "question_paper") {
      const { subjects, topics, text } = await syllabusText(exam.id);
      const result = await extractQuestions({
        buffer: bytes,
        mimeType: doc.mimeType,
        language: doc.language,
        label: `${exam.name} ${doc.year} ${doc.paperName}`.trim(),
        syllabus: text,
        onProgress: async (page, pages) => {
          await PyqDocument.updateOne({ id: doc.id }, { $set: { "processing.error": `Reading page ${page} of ${pages}…` } });
        },
      });
      const byNumber = new Map<number, (typeof result.questions)[number]>();
      for (const item of result.questions) if (!byNumber.has(item.number)) byNumber.set(item.number, item);
      if (!byNumber.size) throw new HttpError(422, "No questions could be read from this document.", "NO_QUESTIONS");

      // Replace this document's earlier unpublished extraction.
      await Question.deleteMany({ pyqDocumentId: doc.id, status: { $ne: "published" } });
      const published = new Set((await Question.find({ pyqDocumentId: doc.id }).select("pyqNumber").lean()).map((row) => row.pyqNumber));
      const items = [...byNumber.values()].sort((a, b) => a.number - b.number).filter((item) => !published.has(item.number));
      const keys = items.map((item) => stemKey(item.stem));
      const elsewhere = await Question.find({ examId: exam.id, source: "pyq", stemKey: { $in: keys }, pyqDocumentId: { $ne: doc.id } }).select("id stemKey pyqYear pyqNumber").lean();
      const dupOf = new Map(elsewhere.map((row) => [row.stemKey, row]));
      const docs = items.map((item) => {
        const subject = matchByName(subjects, item.subject);
        const topic = matchByName(subject ? topics.filter((row) => row.subjectId === subject.id) : topics, item.topic);
        const stem = item.stem.trim();
        const dup = dupOf.get(stemKey(stem));
        const notes = [
          item.incomplete ? "Unreadable or cut off — check against the original" : "",
          item.hasFigure ? "Uses a figure/table — check the original" : "",
          dup ? `Possible duplicate of ${dup.pyqYear} Q${dup.pyqNumber}` : "",
          "No official answer yet",
        ].filter(Boolean);
        return {
          id: nid(),
          examId: exam.id,
          subjectId: topic?.subjectId || subject?.id || "unmapped",
          topicId: topic?.id || "unmapped",
          subtopic: item.subtopic || "",
          aiSuggestedKey: item.options.some((_, index) => KEYS[index] === item.markedAnswer) ? item.markedAnswer : "",
          stem,
          stemKey: stemKey(stem),
          options: item.options.map((option, index) => ({ key: KEYS[index], text: option.text.trim() })),
          correctKey: "?",
          keyStatus: "unverified",
          explanation: "",
          difficulty: item.difficulty,
          language: /[஀-௿]/.test(stem) ? "ta" : "en",
          source: "pyq",
          pyqYear: doc.year,
          pyqPaperId: doc.paperId,
          pyqDocumentId: doc.id,
          pyqNumber: item.number,
          pyqPage: item.page,
          questionType: (QUESTION_TYPES as readonly string[]).includes(item.questionType) ? item.questionType : "other",
          duplicateOf: dup?.id || "",
          status: "under_review",
          rightsStatus: "pending",
          marks: exam.pattern?.marksPerQuestion || 1.5,
          flagReason: notes.join(" · "),
        };
      });
      if (docs.length) await Question.insertMany(docs);
      const warnings = [
        ...docs.filter((row) => /Unreadable/.test(row.flagReason)).map((row) => `Q${row.pyqNumber}: unreadable or incomplete`),
        ...docs.filter((row) => row.duplicateOf).map((row) => `Q${row.pyqNumber}: possible duplicate`),
      ];
      const numbers = [...byNumber.keys()].sort((a, b) => a - b);
      const gaps = numbers.length ? Array.from({ length: numbers[numbers.length - 1] }, (_, i) => i + 1).filter((n) => !byNumber.has(n)) : [];
      if (gaps.length) warnings.unshift(`Question numbers not found: ${gaps.slice(0, 30).join(", ")}${gaps.length > 30 ? "…" : ""}`);
      if (doc.paperId) {
        const all = await Question.find({ pyqPaperId: doc.paperId }).sort({ pyqNumber: 1 }).select("id").lean();
        await PyqPaper.updateOne({ id: doc.paperId }, { $set: { questionIds: all.map((row) => row.id) } });
      }
      // Answers the paper visibly marks are kept only as AI suggestions on each question; never as the official key.
      const suggested = docs.filter((row) => row.aiSuggestedKey).length;
      if (suggested) warnings.unshift(`AI saw ${suggested} marked answers — shown as suggestions only. Accept each one, or upload the official answer key.`);
      doc.set({
        status: "processed",
        pages: result.pages,
        warnings,
        answers: [],
        processing: { method: result.method, error: "", questions: byNumber.size, answers: 0, startedAt: doc.processing?.startedAt, finishedAt: new Date() },
      });
    } else {
      const result = await extractAnswers({ buffer: bytes, mimeType: doc.mimeType, language: doc.language });
      const sections = new Map<string, Map<number, { number: number; key: string; note: string }>>();
      for (const item of result.answers) {
        const part = sections.get(item.section) || new Map();
        sections.set(item.section, part);
        if (!part.has(item.number)) part.set(item.number, { number: item.number, key: item.key.trim().toUpperCase(), note: item.note || "" });
      }
      const parts = [...sections.entries()].filter(([, part]) => part.size);
      if (!parts.length) throw new HttpError(422, "No answers could be read from this answer key.", "NO_ANSWERS");
      const sorted = (part: Map<number, { number: number; key: string; note: string }>) => [...part.values()].sort((a, b) => a.number - b.number);
      const done = { method: result.method, error: "", questions: 0, startedAt: doc.processing?.startedAt, finishedAt: new Date() };
      // Earlier split parts of this document are replaced (approved parts are kept as they are).
      await PyqDocument.deleteMany({ splitFrom: doc.id, status: { $ne: "approved" } });
      const [[firstSection, firstAnswers], ...others] = parts;
      for (const [section, part] of others) {
        // An approved part stays as the admin approved it.
        if (await PyqDocument.exists({ splitFrom: doc.id, sha256: `${doc.sha256}#${section}`.slice(0, 200), status: "approved" })) continue;
        const { _id, createdAt, updatedAt, ...copy } = doc.toObject() as Record<string, unknown>;
        void _id; void createdAt; void updatedAt;
        await PyqDocument.create({
          ...copy,
          id: nid(),
          splitFrom: doc.id,
          paperId: "",
          paperName: clean(section),
          subjectCode: subjectCodeOf(`Subject Code ${section}`) || "",
          sha256: `${doc.sha256}#${section}`.slice(0, 200),
          alsoFoundAt: [],
          answers: sorted(part),
          status: "processed",
          warnings: [`Part of ${doc.fileName} (one PDF with ${parts.length} subject keys).`, ...(await validateAnswerKey("", sorted(part)))],
          processing: { ...done, answers: part.size },
        });
      }
      if (firstSection) {
        doc.set({ paperName: doc.paperName || clean(firstSection), subjectCode: doc.subjectCode || subjectCodeOf(`Subject Code ${firstSection}`) });
      }
      const warnings = await validateAnswerKey(doc.paperId, sorted(firstAnswers));
      if (others.length) warnings.unshift(`This PDF holds ${parts.length} subject keys — split into ${parts.length} answer keys, one per paper.`);
      doc.set({ answers: sorted(firstAnswers), pages: result.pages, status: "processed", warnings, processing: { ...done, answers: firstAnswers.size } });
    }
    await doc.save();
    // Link waiting answer keys to their papers; a re-read paper gets its approved official answers again.
    // A problem here never fails the document that was just read.
    try {
      await autoMatchKeys(doc.examId, doc.year);
      if (doc.docType === "question_paper" && doc.paperId) {
        for (const key of await PyqDocument.find({ paperId: doc.paperId, docType: "answer_key", status: "processed" }).lean()) {
          const warnings = await validateAnswerKey(doc.paperId, key.answers.map((a) => ({ number: a.number || 0, key: a.key || "", note: a.note || "" })));
          await PyqDocument.updateOne({ id: key.id }, { $set: { warnings } });
        }
        if (await PyqDocument.exists({ paperId: doc.paperId, docType: "answer_key", status: "approved" })) await applyOfficialKeys(doc.paperId, "system");
      }
    } catch (error) {
      console.warn(`PYQ matching after ${doc.id}: ${error instanceof Error ? error.message : error}`);
    }
    if (doc.docType === "question_paper") scheduleAnalysis(doc.examId);
    return (await PyqDocument.findOne({ id: doc.id }).lean()) || doc.toObject();
  } catch (error) {
    doc.set({ status: "failed", processing: { ...(doc.processing || {}), error: error instanceof Error ? error.message.slice(0, 300) : "Processing failed", finishedAt: new Date() } });
    await doc.save();
    throw error;
  }
}

/**
 * Link waiting answer keys (no session yet) of an exam year to their question papers:
 * by the printed subject code; or, when the year has exactly one paper and nothing
 * conflicts, to that paper. Anything unclear stays "Matching required" for the admin.
 */
export async function autoMatchKeys(examId: string, year: number) {
  const keys = await PyqDocument.find({ examId, year, docType: "answer_key", paperId: "", status: { $in: ["processed", "approved"] } }).lean();
  if (!keys.length) return 0;
  const paperIds = await PyqDocument.distinct("paperId", { examId, year, docType: "question_paper", status: { $nin: ["rejected", "link_only"] }, paperId: { $ne: "" } });
  const sessions = await PyqPaper.find({ id: { $in: paperIds } }).lean();
  let linked = 0;
  for (const key of keys) {
    const multiPart = Boolean(key.splitFrom) || (await PyqDocument.exists({ splitFrom: key.id }));
    const byCode = key.subjectCode ? sessions.filter((row) => row.subjectCode === key.subjectCode) : [];
    // The only paper of the year, when the key states nothing the paper does not (a key with no details fits).
    const fits = (row: (typeof sessions)[number]) =>
      (["stage", "paperName", "language", "shift", "subjectCode"] as const).every((field) => !key[field] || key[field] === row[field]);
    const only = sessions.length === 1 && !multiPart && fits(sessions[0]) ? sessions[0] : null;
    const target = byCode.length === 1 ? byCode[0] : only;
    if (!target) continue;
    // Atomic: two papers finishing together must not both link (or overwrite) the same key.
    const versionNo = (await PyqDocument.countDocuments({ paperId: target.id, docType: "answer_key", keyVersion: key.keyVersion })) + 1;
    const warnings = await validateAnswerKey(target.id, key.answers.map((a) => ({ number: a.number || 0, key: a.key || "", note: a.note || "" })));
    const claimed = await PyqDocument.updateOne({ id: key.id, paperId: "" }, { $set: { paperId: target.id, versionNo, warnings } });
    if (!claimed.modifiedCount) continue;
    await audit("system", "pyq_document_automatch", "pyq_document", key.id, { paperId: target.id, by: byCode.length === 1 ? "subject code" : "only paper of the year" });
    if (key.status === "approved") await applyOfficialKeys(target.id, "system");
    linked += 1;
  }
  return linked;
}

/** Compare an answer key with the session's questions: missing, extra and impossible answers. */
async function validateAnswerKey(paperId: string, answers: Array<{ number: number; key: string; note: string }>) {
  if (!paperId) return ["Not matched to a question paper yet — matching required."];
  const questions = await Question.find({ pyqPaperId: paperId }).select("pyqNumber options").lean();
  const byNumber = new Map(questions.map((question) => [question.pyqNumber, question]));
  const keyed = new Set(answers.map((answer) => answer.number));
  const warnings: string[] = [];
  const unknown = answers.filter((answer) => !byNumber.has(answer.number)).map((answer) => answer.number);
  const missing = questions.map((question) => question.pyqNumber!).filter((number) => !keyed.has(number));
  const bad = answers.filter((answer) => answer.key && byNumber.has(answer.number) && !byNumber.get(answer.number)!.options.some((option) => option.key === answer.key)).map((answer) => answer.number);
  const special = answers.filter((answer) => !answer.key || answer.note).map((answer) => `Q${answer.number}: ${answer.note || "no option"}`);
  if (questions.length && answers.length !== questions.length) warnings.push(`Answer key has ${answers.length} answers; the paper has ${questions.length} questions.`);
  if (unknown.length) warnings.push(`Answers for questions not in the paper: ${unknown.slice(0, 30).join(", ")}`);
  if (missing.length) warnings.push(`No answer for: ${missing.slice(0, 30).join(", ")}${missing.length > 30 ? "…" : ""}`);
  if (bad.length) warnings.push(`Answer is not one of the options for: ${bad.join(", ")}`);
  warnings.push(...special.slice(0, 20));
  return warnings;
}

/** Mark a document as processing, unless it already is (a run stuck for 30+ minutes may be retried). */
export async function claimDocument(documentId: string) {
  const stale = new Date(Date.now() - 30 * 60 * 1000);
  const claimed = await PyqDocument.updateOne(
    { id: documentId, status: { $ne: "link_only" }, $or: [{ status: { $ne: "processing" } }, { "processing.startedAt": { $lt: stale } }, { "processing.startedAt": null }] },
    { $set: { status: "processing", "processing.startedAt": new Date(), "processing.error": "" } },
  );
  if (!claimed.matchedCount) {
    const doc = await PyqDocument.findOne({ id: documentId }).select("status").lean();
    if (!doc) throw new HttpError(404, "Document not found", "NOT_FOUND");
    if (doc.status === "link_only") throw new HttpError(409, "Upload this document first.", "LINK_ONLY");
    throw new HttpError(409, "This document is already being processed.", "ALREADY_PROCESSING");
  }
}

export async function retryDocument(documentId: string, actorId: string) {
  await audit(actorId, "pyq_document_retry", "pyq_document", documentId);
  queueProcessing(documentId);
}

/** At most this many documents are read at once (AI OCR is slow and rate-limited). */
const PROCESS_CONCURRENCY = Math.max(1, Number(process.env.PYQ_PROCESS_CONCURRENCY || 2));
const waiting: Array<{ id: string; buffer?: Buffer }> = [];
const active = new Set<string>();

/** Queue a document for processing; a document already queued or running is not added again. */
export function queueProcessing(documentId: string, buffer?: Buffer) {
  if (active.has(documentId) || waiting.some((item) => item.id === documentId)) return;
  waiting.push({ id: documentId, buffer });
  if (active.size >= PROCESS_CONCURRENCY) {
    void PyqDocument.updateOne({ id: documentId }, { $set: { status: "processing", "processing.error": "Waiting for other documents to finish…" } }).catch(() => undefined);
  }
  pumpQueue();
}

function pumpQueue() {
  while (active.size < PROCESS_CONCURRENCY && waiting.length) {
    const next = waiting.shift()!;
    active.add(next.id);
    void processDocument(next.id, next.buffer)
      .catch((error) => console.warn(`PYQ document ${next.id} processing failed: ${error instanceof Error ? error.message : error}`))
      .finally(() => {
        active.delete(next.id);
        pumpQueue();
      });
  }
}

/** Manually match a document to a session (answer keys found separately, or corrections). */
export async function linkDocument(documentId: string, paperId: string, actorId: string) {
  const [doc, session] = await Promise.all([PyqDocument.findOne({ id: documentId }), PyqPaper.findOne({ id: paperId }).lean()]);
  if (!doc) throw new HttpError(404, "Document not found", "NOT_FOUND");
  if (!session) throw new HttpError(404, "Session not found", "NOT_FOUND");
  if (session.examId !== doc.examId || session.year !== doc.year) throw new HttpError(400, "Exam and year must match the session.", "MISMATCH");
  doc.paperId = session.id;
  if (doc.docType === "answer_key") doc.warnings = await validateAnswerKey(session.id, doc.answers.map((a) => ({ number: a.number || 0, key: a.key || "", note: a.note || "" })));
  await doc.save();
  if (doc.docType === "answer_key" && doc.status === "approved") await applyOfficialKeys(session.id, actorId);
  await audit(actorId, "pyq_document_link", "pyq_document", documentId, { paperId });
  return doc.toObject();
}

/**
 * Apply the session's approved official answer keys to its questions: for each
 * question the highest version wins (revised > final > tentative, newest first).
 * Admin-set keys are kept. Changes to published questions are logged.
 */
async function applyOfficialKeys(paperId: string, actorId: string) {
  // Only approved official answer key documents; AI suggestions are never applied here.
  const keys = await PyqDocument.find({ paperId, docType: "answer_key", status: "approved" }).lean();
  keys.sort((a, b) => (KEY_RANK[b.keyVersion] || 0) - (KEY_RANK[a.keyVersion] || 0) || b.versionNo - a.versionNo);
  const best = new Map<number, { key: string; status: string; note: string }>();
  for (const doc of keys) {
    const status = KEY_STATUS[doc.keyVersion] || "official_final";
    for (const answer of doc.answers) if (!best.has(answer.number!)) best.set(answer.number!, { key: answer.key || "", status, note: answer.note || "" });
  }
  const questions = await Question.find({ pyqPaperId: paperId });
  let applied = 0;
  for (const question of questions) {
    if (question.keyStatus === "admin") continue;
    const official = best.get(question.pyqNumber!);
    if (!official) continue;
    const valid = question.options.some((option) => option.key === official.key);
    if (!valid) {
      question.set({ flagReason: `Official key "${official.key || official.note || "?"}" is not one of the options — set the answer manually` });
      await question.save();
      continue;
    }
    if (question.correctKey === official.key && question.keyStatus === official.status) continue;
    if (question.status === "published" && question.correctKey !== official.key) {
      await QuestionChangeLog.create({ id: nid(), questionId: question.id, actorId, reason: `Official answer key (${official.status.replace("official_", "")})`, oldCorrectKey: question.correctKey, newCorrectKey: official.key, oldAnswerMistake: "Superseded by the official answer key", newAnswerWhyCorrect: "Official answer key", before: { correctKey: question.correctKey }, after: { correctKey: official.key } });
    }
    question.set({ correctKey: official.key, keyStatus: official.status, flagReason: question.flagReason.replace(/(^| · )No official answer yet/, "").replace(/^ · /, "") });
    await question.save();
    applied += 1;
  }
  return applied;
}

/** Admin approval. Approving an answer key applies its official answers. */
export async function reviewDocument(documentId: string, decision: "approve" | "reject", actorId: string) {
  const doc = await PyqDocument.findOne({ id: documentId });
  if (!doc) throw new HttpError(404, "Document not found", "NOT_FOUND");
  if (decision === "approve") {
    if (doc.status !== "processed" && doc.status !== "approved") throw new HttpError(409, "Only processed documents can be approved.", "NOT_PROCESSED");
    if (doc.docType === "answer_key" && !doc.paperId) throw new HttpError(409, "Match this answer key to a question paper first.", "MATCHING_REQUIRED");
  }
  doc.set({ status: decision === "approve" ? "approved" : "rejected", reviewedBy: actorId });
  await doc.save();
  let applied = 0;
  if (doc.paperId && doc.docType === "answer_key") applied = await applyOfficialKeys(doc.paperId, actorId);
  if (decision === "reject" && doc.docType === "question_paper") await Question.updateMany({ pyqDocumentId: doc.id, status: { $ne: "published" } }, { $set: { status: "rejected" } });
  if (doc.docType === "question_paper") scheduleAnalysis(doc.examId);
  await audit(actorId, `pyq_document_${decision}`, "pyq_document", documentId, { applied });
  return { status: doc.status, applied };
}

/** Matching status of a session, as shown to the admin. */
export function matchStatus(docs: Array<{ docType: string; status: string; paperId: string }>) {
  const live = docs.filter((doc) => doc.status !== "rejected");
  const qp = live.some((doc) => doc.docType === "question_paper" && doc.status !== "link_only");
  const ak = live.some((doc) => doc.docType === "answer_key" && doc.status !== "link_only");
  const labels: string[] = [];
  if (qp && ak) labels.push("Both Found");
  else if (qp) labels.push("Question Paper Found", "Answer Key Missing");
  else if (ak) labels.push("Answer Key Found", "Question Paper Missing");
  else labels.push("Question Paper Missing", "Answer Key Missing");
  if (live.some((doc) => doc.status === "link_only")) labels.push("Link Found (download manually)");
  if (live.some((doc) => !doc.paperId && doc.status !== "link_only")) labels.push("Matching Required");
  if (live.some((doc) => doc.status === "processed" || doc.status === "failed")) labels.push("Verification Required");
  return labels;
}

/**
 * Publish a session: rights must be verified and its question paper approved. Only
 * questions with an official (or admin-set) answer go live; the rest stay hidden.
 */
export async function publishSession(paperId: string, actorId: string) {
  const session = await PyqPaper.findOne({ id: paperId });
  if (!session) throw new HttpError(404, "Session not found", "NOT_FOUND");
  if (session.rightsStatus !== "verified") throw new HttpError(400, "Verify the rights before publishing.", "RIGHTS_NOT_VERIFIED");
  if (!(await PyqDocument.exists({ paperId, docType: "question_paper", status: "approved" }))) throw new HttpError(400, "Approve the question paper first.", "QP_NOT_APPROVED");
  const result = await Question.updateMany(
    { pyqPaperId: paperId, status: "under_review", correctKey: { $in: KEYS }, keyStatus: { $in: ["official_final", "official_revised", "official_tentative", "admin"] } },
    { $set: { status: "published", rightsStatus: "verified", reviewedBy: actorId } },
  );
  const pending = await Question.countDocuments({ pyqPaperId: paperId, status: { $nin: ["published", "rejected"] } });
  session.status = "published";
  await session.save();
  await audit(actorId, "pyq_publish", "pyq", paperId, { published: result.modifiedCount, pending });
  return { published: result.modifiedCount || 0, pending };
}
