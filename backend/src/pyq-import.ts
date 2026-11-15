import crypto from "node:crypto";
// @ts-expect-error pdf-parse does not publish a declaration for this internal entry.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { z } from "zod";
import { config } from "./config.js";
import { nameKey, stemKey } from "./governance.js";
import { HttpError, nid } from "./http.js";
import { Exam, PyqPaper, Question, Subject, Topic } from "./models.js";
import { completeAiJson } from "./question-ai.js";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
/** Below this much text the PDF is almost certainly scanned images (no OCR yet). */
const MIN_TEXT_CHARS = 300;
const CHUNK_CHARS = 9000;
const KEYS = ["A", "B", "C", "D", "E", "F"];
export const QUESTION_TYPES = ["direct", "statement", "match", "assertion_reason", "sequence", "odd_one_out", "fill_blank", "other"] as const;

const fakeAi = () => process.env.AI_FAKE_QUESTIONS === "1" && !config.isProd;

export function fileMeta(kind: "questions" | "answers", name: string, buffer: Buffer) {
  return { kind, name: name.slice(0, 200), size: buffer.length, sha256: crypto.createHash("sha256").update(buffer).digest("hex"), uploadedAt: new Date() };
}

/** Validate an uploaded PDF and return its text. */
export async function pdfText(buffer: Buffer) {
  if (!buffer?.length) throw new HttpError(400, "Upload a PDF file.", "BAD_REQUEST");
  if (buffer.length > MAX_PDF_BYTES) throw new HttpError(413, "PDF is larger than 25 MB.", "FILE_TOO_LARGE");
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(400, "File is not a PDF.", "BAD_REQUEST");
  let parsed: { text?: string };
  try {
    parsed = await pdfParse(buffer);
  } catch {
    throw new HttpError(400, "This PDF could not be read. It may be damaged or password-protected.", "PDF_UNREADABLE");
  }
  const text = String(parsed.text || "").replace(/\r/g, "").trim();
  if (text.length < MIN_TEXT_CHARS) {
    throw new HttpError(422, "This PDF has no readable text (probably scanned images). OCR is not supported yet.", "PDF_NO_TEXT");
  }
  return text;
}

/** Split text into AI-sized chunks, breaking before a numbered question where possible. */
function chunkText(text: string) {
  const lines = text.split("\n");
  const out: string[] = [];
  let current = "";
  for (const line of lines) {
    const startsQuestion = /^\s*\d{1,3}\s*[.)]/.test(line);
    if (current.length > CHUNK_CHARS && startsQuestion) {
      out.push(current);
      current = "";
    }
    current += `${line}\n`;
  }
  if (current.trim()) out.push(current);
  return out;
}

const extractedSchema = z.object({
  questions: z.array(
    z.object({
      number: z.coerce.number().int().positive(),
      stem: z.string().min(2),
      options: z.array(z.object({ key: z.string().optional().default(""), text: z.string() })).min(2).max(6),
      subject: z.string().optional().default(""),
      topic: z.string().optional().default(""),
      questionType: z.string().optional().default("other"),
      difficulty: z.enum(["easy", "medium", "hard"]).optional().default("medium"),
      answer: z.string().optional().default(""),
    }),
  ),
});
type Extracted = z.infer<typeof extractedSchema>["questions"][number];

/** Local verification only: parse "1. stem / (A) .. (D) .." text without AI. */
function fakeExtract(text: string): Extracted[] {
  const out: Extracted[] = [];
  const blocks = text.split(/\n(?=\s*\d{1,3}\s*[.)]\s)/);
  for (const block of blocks) {
    const head = /^\s*(\d{1,3})\s*[.)]\s*([\s\S]*?)(?=\(\s*A\s*\))/i.exec(block);
    if (!head) continue;
    const options = [...block.matchAll(/\(\s*([A-D])\s*\)\s*([^\n(]+)/gi)].map((m) => ({ key: m[1].toUpperCase(), text: m[2].trim() }));
    if (options.length < 2) continue;
    out.push({ number: Number(head[1]), stem: head[2].replace(/\s+/g, " ").trim(), options, subject: "", topic: "", questionType: "direct", difficulty: "medium", answer: "" });
  }
  return out;
}

async function extractChunk(chunk: string, syllabus: string, paperLabel: string) {
  if (fakeAi()) return fakeExtract(chunk);
  const system = `You extract questions from an official government exam question paper (${paperLabel}).
Copy every question and option EXACTLY as printed. Never rewrite, translate, summarise, correct or invent anything.
Skip instructions, headers, page numbers and any question cut off at the start or end of this text.
If a question is printed in both Tamil and English, keep both, exactly as printed.
Use option keys A, B, C, D in printed order (map (a)/(1)/(i) to A, B, C, D).
subject and topic: choose the closest from the syllabus below, using the exact names given, or "" if none fits.
questionType: one of ${QUESTION_TYPES.join(", ")}.
difficulty: your estimate (easy, medium, hard).
answer: the option key only if the answer is printed in this text, otherwise "".
Return ONLY JSON: {"questions":[{"number":1,"stem":"...","options":[{"key":"A","text":"..."}],"subject":"","topic":"","questionType":"direct","difficulty":"medium","answer":""}]}

Syllabus:
${syllabus}`;
  const { json } = await completeAiJson({ system, user: chunk, feature: "pyq_extract", label: "PYQ extraction" });
  return extractedSchema.parse(json).questions;
}

const answerSchema = z.object({ answers: z.array(z.object({ number: z.coerce.number().int().positive(), key: z.string() })) });

/** Read "question number → option" pairs from an answer key. */
async function extractAnswers(text: string) {
  if (fakeAi()) {
    return [...text.matchAll(/(\d{1,3})\s*[-.:)]\s*\(?\s*([A-D])\s*\)?/gi)].map((m) => ({ number: Number(m[1]), key: m[2].toUpperCase() }));
  }
  const answers: Array<{ number: number; key: string }> = [];
  for (const chunk of chunkText(text)) {
    const { json } = await completeAiJson({
      system: `You read an official exam answer key. Return ONLY JSON {"answers":[{"number":1,"key":"A"}]} with every question number and its correct option letter (A, B, C or D) exactly as printed. Skip anything that is not an answer.`,
      user: chunk,
      feature: "pyq_answer_key",
      label: "PYQ answer key",
    });
    answers.push(...answerSchema.parse(json).answers);
  }
  return answers;
}

/** Match an AI-chosen name to a syllabus row by normalised name (exact, then containment). */
function matchByName<T extends { name: string; nameEn?: string | null; nameTa?: string | null }>(rows: T[], wanted: string) {
  const key = nameKey(wanted);
  if (!key) return undefined;
  const names = (row: T) => [row.nameEn, row.name, row.nameTa].map(nameKey).filter(Boolean);
  return rows.find((row) => names(row).includes(key)) || rows.find((row) => names(row).some((name) => name.includes(key) || key.includes(name)));
}

/**
 * Extract the uploaded paper into PYQ questions (status under_review, never shown to
 * students until an admin verifies rights and publishes). Re-importing replaces the
 * paper's unpublished questions and keeps published ones.
 */
export async function importPyqPaper(paperId: string, buffer: Buffer) {
  const paper = await PyqPaper.findOne({ id: paperId });
  if (!paper) throw new HttpError(404, "PYQ paper not found", "NOT_FOUND");
  paper.set("extraction", { status: "processing", error: "", questions: 0, withKey: 0, provider: "", finishedAt: null });
  await paper.save();
  try {
    const exam = await Exam.findOne({ id: paper.examId }).lean();
    if (!exam) throw new HttpError(404, "Exam not found", "NOT_FOUND");
    const text = await pdfText(buffer);
    const [subjects, topics] = await Promise.all([
      Subject.find({ examId: exam.id, status: { $ne: "draft" } }).sort({ order: 1 }).lean(),
      Topic.find({ examId: exam.id, status: { $ne: "draft" } }).sort({ order: 1 }).lean(),
    ]);
    const syllabus = subjects
      .map((subject) => `- ${subject.nameEn || subject.name}: ${topics.filter((topic) => topic.subjectId === subject.id).map((topic) => topic.nameEn || topic.name).join("; ")}`)
      .join("\n");

    const byNumber = new Map<number, Extracted>();
    for (const chunk of chunkText(text)) {
      for (const item of await extractChunk(chunk, syllabus || "(no syllabus yet)", `${exam.name} ${paper.year}`)) {
        if (!byNumber.has(item.number)) byNumber.set(item.number, item);
      }
    }
    if (!byNumber.size) throw new HttpError(422, "No questions could be read from this PDF.", "PDF_NO_QUESTIONS");

    // Replace this paper's earlier unpublished extraction.
    await Question.deleteMany({ pyqPaperId: paper.id, status: { $ne: "published" } });
    const published = new Set((await Question.find({ pyqPaperId: paper.id }).select("pyqNumber").lean()).map((row) => row.pyqNumber));

    const docs = [...byNumber.values()]
      .sort((a, b) => a.number - b.number)
      .filter((item) => !published.has(item.number))
      .map((item) => {
        const subject = matchByName(subjects, item.subject);
        const topic = matchByName(subject ? topics.filter((row) => row.subjectId === subject.id) : topics, item.topic);
        const options = item.options.map((option, index) => ({ key: KEYS[index], text: option.text.trim() }));
        const answer = item.answer.trim().toUpperCase();
        const hasKey = options.some((option) => option.key === answer);
        const stem = item.stem.trim();
        return {
          id: nid(),
          examId: exam.id,
          subjectId: topic?.subjectId || subject?.id || "unmapped",
          topicId: topic?.id || "unmapped",
          stem,
          stemKey: stemKey(stem),
          options,
          correctKey: hasKey ? answer : "?",
          explanation: "",
          difficulty: item.difficulty,
          language: /[஀-௿]/.test(stem) ? "ta" : "en",
          source: "pyq",
          pyqYear: paper.year,
          pyqPaperId: paper.id,
          pyqNumber: item.number,
          questionType: (QUESTION_TYPES as readonly string[]).includes(item.questionType) ? item.questionType : "other",
          status: "under_review",
          rightsStatus: "pending",
          marks: exam.pattern?.marksPerQuestion || 1.5,
          flagReason: hasKey ? "" : "Answer key missing",
        };
      });
    if (docs.length) await Question.insertMany(docs);
    const all = await Question.find({ pyqPaperId: paper.id }).sort({ pyqNumber: 1 }).select("id correctKey").lean();
    paper.questionIds = all.map((row) => row.id);
    paper.set("extraction", {
      status: "done",
      error: "",
      questions: all.length,
      withKey: all.filter((row) => row.correctKey !== "?").length,
      provider: fakeAi() ? "fake" : "ai",
      finishedAt: new Date(),
    });
    await paper.save();
    return paper;
  } catch (error) {
    paper.set("extraction", {
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 300) : "Extraction failed",
      questions: paper.questionIds.length,
      withKey: 0,
      provider: "",
      finishedAt: new Date(),
    });
    await paper.save();
    throw error;
  }
}

/** Apply an answer-key PDF to an extracted paper. */
export async function applyAnswerKey(paperId: string, buffer: Buffer) {
  const paper = await PyqPaper.findOne({ id: paperId });
  if (!paper) throw new HttpError(404, "PYQ paper not found", "NOT_FOUND");
  const answers = await extractAnswers(await pdfText(buffer));
  const questions = await Question.find({ pyqPaperId: paper.id }).select("id pyqNumber options correctKey status").lean();
  const byNumber = new Map(questions.map((question) => [question.pyqNumber, question]));
  let applied = 0;
  for (const answer of answers) {
    const question = byNumber.get(answer.number);
    const key = answer.key.trim().toUpperCase();
    if (!question || question.status === "published" || !question.options.some((option) => option.key === key)) continue;
    await Question.updateOne({ id: question.id }, { $set: { correctKey: key, flagReason: "" } });
    applied += 1;
  }
  const withKey = await Question.countDocuments({ pyqPaperId: paper.id, correctKey: { $ne: "?" } });
  paper.set("extraction.withKey", withKey);
  await paper.save();
  return { found: answers.length, applied, withKey, total: questions.length };
}

/**
 * Publish a verified paper: every question with a valid answer key goes live in the
 * PYQ section. Questions without a key stay under review.
 */
export async function publishPyqPaper(paperId: string, adminId: string) {
  const paper = await PyqPaper.findOne({ id: paperId });
  if (!paper) throw new HttpError(404, "PYQ paper not found", "NOT_FOUND");
  if (paper.rightsStatus !== "verified") throw new HttpError(400, "Verify the paper's rights before publishing.", "RIGHTS_NOT_VERIFIED");
  const ready = await Question.updateMany(
    { pyqPaperId: paper.id, status: "under_review", correctKey: { $in: KEYS } },
    { $set: { status: "published", rightsStatus: "verified", reviewedBy: adminId, flagReason: "" } },
  );
  const pending = await Question.countDocuments({ pyqPaperId: paper.id, status: { $ne: "published" } });
  paper.status = "published";
  await paper.save();
  return { published: ready.modifiedCount || 0, pending };
}
