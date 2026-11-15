// @ts-expect-error pdf-parse does not publish a declaration for this internal entry.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { assertAiBudgetAvailable, estimateAiInr } from "../ai-budget.js";
import { config } from "../config.js";
import { completeGemini } from "../gemini-settings.js";
import { HttpError, nid } from "../http.js";
import { completeChatGptResponse } from "../chatgpt-auth.js";
import { AiUsage, AppConfig } from "../models.js";
import { getOpenAiSettings } from "../openai-settings.js";
import { completeAiJson } from "../question-ai.js";

export const QUESTION_TYPES = ["direct", "statement", "match", "assertion_reason", "sequence", "odd_one_out", "fill_blank", "other"] as const;
/** Inline files up to ~20 MB per request (Gemini and ChatGPT). */
const OCR_MAX_BYTES = 18 * 1024 * 1024;
/** Long scanned papers are read this many pages per AI call (the output must fit). */
const OCR_PAGES_PER_CALL = 8;
const CHUNK_CHARS = 9000;
const fakeAi = () => process.env.AI_FAKE_QUESTIONS === "1" && !config.isProd;

/** The provider chosen for PYQ work (Admin → PYQ management). */
export async function pyqProvider(): Promise<"auto" | "chatgpt" | "gemini"> {
  const settings = await AppConfig.findOne({ id: "app" }).select("pyqProvider").lean();
  return (settings?.pyqProvider as "auto" | "chatgpt" | "gemini") || "auto";
}

export type ExtractedQuestion = {
  number: number;
  stem: string;
  options: Array<{ key: string; text: string }>;
  subject: string;
  topic: string;
  subtopic: string;
  questionType: string;
  difficulty: "easy" | "medium" | "hard";
  page: number | null;
  /** Text was unreadable or cut off; needs admin attention. */
  incomplete: boolean;
  hasFigure: boolean;
  /** Option visibly marked as correct in the document (e.g. a tentative key paper), else "". Never AI-solved. */
  markedAnswer: string;
};
/** section: the subject heading the answer is under, when one key PDF covers several subjects ("" otherwise). */
export type ExtractedAnswer = { number: number; key: string; note: string; section: string };

/** pdf-parse is not safe to run concurrently (parallel uploads/downloads): read one PDF at a time. */
let pdfQueue: Promise<unknown> = Promise.resolve();

/** Per-page text of a PDF ([] when the PDF cannot be read). */
export function pdfPages(buffer: Buffer): Promise<string[]> {
  const run = pdfQueue.then(() => readPdfPages(buffer));
  pdfQueue = run.catch(() => undefined);
  return run;
}

async function readPdfPages(buffer: Buffer): Promise<string[]> {
  const pages: string[] = [];
  const render = async (pageData: { getTextContent: (o: object) => Promise<{ items: Array<{ str: string; transform: number[] }> }> }) => {
    const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    let lastY: number | undefined;
    let text = "";
    for (const item of content.items) {
      text += lastY === undefined || lastY === item.transform[5] ? item.str : `\n${item.str}`;
      lastY = item.transform[5];
    }
    pages.push(text);
    return text;
  };
  // pdf-parse does not wait for its own clean-up, so a read right after another can fail
  // ("bad XRef entry"): it gets its own copy of the bytes and one more try after a short pause.
  for (let attempt = 1; ; attempt += 1) {
    pages.length = 0;
    try {
      await pdfParse(Buffer.from(buffer), { pagerender: render });
      return pages;
    } catch (error) {
      if (attempt >= 3) {
        console.warn(`PDF read failed: ${error instanceof Error ? error.message : error}`);
        throw new HttpError(400, "This PDF could not be read. It may be damaged or password-protected.", "PDF_UNREADABLE");
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

/**
 * Text extraction is not enough when the PDF is scanned (almost no text) or when a
 * Tamil paper uses legacy fonts (text comes out as Latin junk instead of Tamil script).
 */
export function needsOcr(pages: string[], language: string) {
  const text = pages.join("\n");
  if (text.replace(/\s+/g, "").length < 300) return true;
  if (language === "ta" || language === "bilingual") {
    const letters = (text.match(/\p{L}/gu) || []).length || 1;
    const tamil = (text.match(/[஀-௿]/g) || []).length;
    if (tamil / letters < 0.05) return true;
  }
  return false;
}

function parseJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] || raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new HttpError(502, "AI did not return JSON.", "AI_BAD_JSON");
  return JSON.parse(body.slice(start, end + 1));
}

const questionItem = z
    .object({
      number: z.coerce.number().int().positive(),
      stem: z.string().min(1),
      options: z.array(z.object({ key: z.any().transform((value) => String(value ?? "")), text: z.any().transform((value) => String(value ?? "")) })).min(2),
      subject: z.string().optional().default(""),
      topic: z.string().optional().default(""),
      subtopic: z.any().transform((value) => (typeof value === "string" ? value.trim().slice(0, 120) : "")),
      questionType: z.string().optional().default("other"),
      difficulty: z.any().transform((value): "easy" | "medium" | "hard" => (["easy", "medium", "hard"].includes(String(value).toLowerCase()) ? (String(value).toLowerCase() as "easy" | "medium" | "hard") : "medium")),
      page: z.any().transform((value) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null)),
      incomplete: z.any().transform((value) => value === true || value === "true"),
      hasFigure: z.any().transform((value) => value === true || value === "true"),
      markedAnswer: z.any().transform((value) => (/^[A-F]$/i.test(String(value ?? "").trim()) ? String(value).trim().toUpperCase() : "")),
    })
    // More than 6 options means the AI split them (e.g. Tamil and English separately): keep 6, flag for the admin.
    .transform((q) => (q.options.length > 6 ? { ...q, options: q.options.slice(0, 6), incomplete: true } : q));

/** Questions from one AI answer: a malformed question is skipped (it shows as a missing number), never the whole paper. */
const questionSchema = {
  parse(json: unknown) {
    const rows = json && typeof json === "object" && Array.isArray((json as { questions?: unknown }).questions) ? (json as { questions: unknown[] }).questions : [];
    const questions = rows.flatMap((row) => {
      const parsed = questionItem.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
    if (rows.length && !questions.length) throw new Error("The AI answer had no readable questions.");
    return { questions };
  },
};
const answerSchema = z.object({
  answers: z.array(
    z.object({
      number: z.coerce.number().int().positive(),
      key: z.any().transform((value) => String(value ?? "")),
      note: z.any().transform((value) => String(value ?? "")),
      section: z.any().transform((value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 160)),
    }),
  ),
});

const QUESTION_RULES = (label: string, syllabus: string) => `You extract questions from an official government exam question paper (${label}).
Copy every question and option EXACTLY as printed. Never rewrite, translate, summarise, correct or invent anything.
Skip instructions, headers and page numbers. Keep the printed question numbers.
If a question is printed in both Tamil and English, keep both, exactly as printed; likewise an option printed in both languages stays ONE option with both texts.
Use option keys A, B, C, D in printed order (map (a)/(1)/(i) to A, B, C, D).
page: the page number the question starts on (from the "=== PAGE n ===" markers or the document).
incomplete: true if any part is unreadable or cut off. hasFigure: true if it depends on a diagram/table/image.
subject and topic: the closest from the syllabus below, using the exact names given, or "". subtopic: a short label (2-5 words) for the specific concept tested, or "".
questionType: one of ${QUESTION_TYPES.join(", ")}. difficulty: easy, medium or hard (estimate).
markedAnswer: ONLY if the document itself visibly marks the correct option (shaded, ticked, bold, underlined, or an answer printed with the question), give that option key; otherwise "". Never solve a question yourself.
Return ONLY JSON: {"questions":[{"number":1,"stem":"...","options":[{"key":"A","text":"..."}],"subject":"","topic":"","subtopic":"","questionType":"direct","difficulty":"medium","page":1,"incomplete":false,"hasFigure":false,"markedAnswer":""}]}

Syllabus:
${syllabus || "(none yet)"}`;

const ANSWER_RULES = `You read an official exam answer key. Copy it exactly; never guess or solve questions.
Return ONLY JSON {"answers":[{"number":1,"key":"A","note":""}]} with each question number and the option letter printed for it.
Use note for printed remarks such as "deleted", "all options correct", "bonus" (and then key ""). Skip anything that is not an answer.
If the document holds keys for several subjects/papers (separate headings such as "Subject Code: 003 ... Subject Name: ..."), set section on every answer to that heading as printed, "<subject code> <subject name>" (e.g. "003 TET CUM SCORING TEST WITH GEN.STUDIES"); the same question number can then appear once per section. With a single subject, section is "".
Return {"answers":[{"number":1,"key":"A","note":"","section":""}]}.`;

/** Providers to try for OCR: the PYQ choice first (or the active one on Auto), then the other enabled one. */
async function ocrProviders(): Promise<Array<"chatgpt" | "gemini">> {
  const settings = await AppConfig.findOne({ id: "app" }).lean();
  const chatgptOn = Boolean(settings?.chatgptEnabled ?? settings?.aiProvider === "chatgpt");
  const geminiOn = Boolean(settings?.geminiEnabled ?? settings?.aiProvider === "gemini");
  const choice = settings?.pyqProvider && settings.pyqProvider !== "auto" ? settings.pyqProvider : settings?.aiProvider;
  const order: Array<"chatgpt" | "gemini"> = choice === "gemini" ? ["gemini", "chatgpt"] : ["chatgpt", "gemini"];
  return order.filter((provider) => (provider === "chatgpt" ? chatgptOn : geminiOn));
}

/** One OCR call with one provider, sending the original file. */
async function ocrOnce(provider: "chatgpt" | "gemini", input: { buffer: Buffer; mimeType: string; system: string; user: string }) {
  const base64 = input.buffer.toString("base64");
  if (provider === "gemini") {
    const raw = await completeGemini({ system: input.system, user: input.user, image: { mimeType: input.mimeType, base64 } });
    if (!raw) throw new Error("Gemini is not configured");
    return raw;
  }
  const openai = await getOpenAiSettings();
  const file =
    input.mimeType === "application/pdf"
      ? { type: "input_file", filename: "document.pdf", file_data: `data:application/pdf;base64,${base64}` }
      : { type: "input_image", image_url: `data:${input.mimeType};base64,${base64}` };
  const result = await completeChatGptResponse({
    model: openai.model || "gpt-5-mini",
    instructions: input.system,
    input: [{ role: "user", content: [{ type: "input_text", text: input.user }, file] }],
  });
  if (!result.text) throw new Error("ChatGPT returned an empty answer");
  return result.text;
}

/**
 * Read the original file (scanned PDF or image, Tamil and English) with the chosen
 * provider; if it fails, try the other enabled provider. Returns parsed JSON.
 */
async function ocrJson(input: { buffer: Buffer; mimeType: string; system: string; user: string; feature: string }) {
  if (input.buffer.length > OCR_MAX_BYTES) {
    throw new HttpError(413, "This file is too large for OCR (max 18 MB). Split it into smaller PDFs.", "OCR_TOO_LARGE");
  }
  const providers = await ocrProviders();
  if (!providers.length) throw new HttpError(503, "OCR needs ChatGPT or Gemini. Enable one in AI providers.", "OCR_UNAVAILABLE");
  await assertAiBudgetAvailable("PYQ OCR");
  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const raw = await ocrOnce(provider, input);
      const tokens = Math.ceil((input.system.length + raw.length) / 4) + Math.ceil(input.buffer.length / 3000);
      await AiUsage.create({ id: nid(), userId: "system", provider, feature: input.feature, tokens, estimatedInr: estimateAiInr(tokens, provider) });
      return { json: parseJson(raw), provider };
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message.slice(0, 160) : error}`);
    }
  }
  throw new HttpError(502, `OCR failed (${errors.join(" | ")})`, "OCR_FAILED");
}

/** Number of pages (pdf-lib also counts scanned pages that have no text). */
async function pageCountOf(buffer: Buffer) {
  try {
    return (await PDFDocument.load(buffer, { ignoreEncryption: true })).getPageCount();
  } catch {
    return 0;
  }
}

/** A new PDF with only pages first..last (1-based), so the AI reads a few pages, not the whole paper. */
async function pdfSlice(source: PDFDocument, first: number, last: number) {
  const slice = await PDFDocument.create();
  const pages = await slice.copyPages(source, Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i));
  pages.forEach((page) => slice.addPage(page));
  return Buffer.from(await slice.save());
}

/** Group page texts into AI-sized chunks with page markers. */
function pageChunks(pages: string[]) {
  const chunks: string[] = [];
  let current = "";
  pages.forEach((text, index) => {
    const block = `=== PAGE ${index + 1} ===\n${text}\n`;
    if (current.length + block.length > CHUNK_CHARS && current) {
      chunks.push(current);
      current = "";
    }
    current += block;
  });
  if (current.trim()) chunks.push(current);
  return chunks;
}

/** Local verification only: parse "1. stem / (A) ..." with page markers, without AI. */
function fakeQuestions(text: string): ExtractedQuestion[] {
  const out: ExtractedQuestion[] = [];
  let page = 1;
  const blocks = text.split(/\n(?=\s*\d{1,3}\s*[.)]\s|=== PAGE \d+ ===)/);
  for (const block of blocks) {
    const marker = /^=== PAGE (\d+) ===/.exec(block.trim());
    if (marker) page = Number(marker[1]);
    const head = /^\s*(?:=== PAGE \d+ ===\s*)?(\d{1,3})\s*[.)]\s*([\s\S]*?)(?=\(\s*A\s*\))/i.exec(block);
    if (!head) continue;
    const options = [...block.matchAll(/\(\s*([A-D])\s*\)\s*([^\n(]+)/gi)].map((m) => ({ key: m[1].toUpperCase(), text: m[2].trim() }));
    if (options.length < 2) continue;
    out.push({ number: Number(head[1]), stem: head[2].replace(/\s+/g, " ").trim(), options, subject: "", topic: "", subtopic: "", questionType: "direct", difficulty: "medium", page, incomplete: false, hasFigure: false, markedAnswer: "" });
  }
  return out;
}

function fakeAnswers(text: string): ExtractedAnswer[] {
  // Local verification: "Subject Code: 004 <name>" lines start a new section.
  const heads = [...text.matchAll(/Subject Code\s*:?\s*(\d{2,4})([^\n]*)/gi)].map((m) => ({ at: m.index || 0, section: `${m[1]}${m[2]}`.replace(/\s+/g, " ").trim() }));
  const sectionAt = (at: number) => [...heads].reverse().find((head) => head.at <= at)?.section || "";
  const body = text.replace(/Subject Code\s*:?\s*\d{2,4}/gi, (m) => " ".repeat(m.length));
  return [...body.matchAll(/(\d{1,3})\s*[-.:)]\s*\(?\s*([A-D])\s*\)?/gi)].map((m) => ({ number: Number(m[1]), key: m[2].toUpperCase(), note: "", section: heads.length > 1 ? sectionAt(m.index || 0) : "" }));
}

/** Read the questions of a question paper (PDF text, or Gemini OCR for scans/images). */
export async function extractQuestions(input: { buffer: Buffer; mimeType: string; language: string; label: string; syllabus: string; onProgress?: (page: number, pages: number) => Promise<void> }) {
  const isPdf = input.mimeType === "application/pdf";
  const pages = isPdf ? await pdfPages(input.buffer) : [];
  const ocr = !isPdf || needsOcr(pages, input.language);
  if (!ocr) {
    const all: ExtractedQuestion[] = [];
    for (const chunk of pageChunks(pages)) {
      if (fakeAi()) {
        all.push(...fakeQuestions(chunk));
        continue;
      }
      const { json } = await completeAiJson({ system: QUESTION_RULES(input.label, input.syllabus), user: chunk, feature: "pyq_extract", label: "PYQ extraction", provider: await pyqProvider() });
      all.push(...questionSchema.parse(json).questions);
    }
    return { method: "text" as const, pages: pages.length, questions: all };
  }
  if (fakeAi()) {
    // Local verification of the OCR path: two fixed questions.
    return {
      method: "ocr" as const,
      pages: pages.length || 1,
      questions: [1, 2].map((number) => ({ number, stem: `OCR question ${number}`, options: ["A", "B", "C", "D"].map((key) => ({ key, text: `Option ${key}` })), subject: "", topic: "", subtopic: "", questionType: "direct", difficulty: "medium" as const, page: 1, incomplete: false, hasFigure: false, markedAnswer: "" })),
    };
  }
  // Long papers: send a few pages per call (a sliced PDF), so each call is small and its answer fits.
  // Each slice also carries the next page, so a question running over a page break is complete;
  // only questions STARTING in the slice's own pages are taken.
  const pageCount = (isPdf ? await pageCountOf(input.buffer) : 0) || pages.length || 1;
  const source = isPdf && pageCount > OCR_PAGES_PER_CALL ? await PDFDocument.load(input.buffer, { ignoreEncryption: true }) : null;
  const all: ExtractedQuestion[] = [];
  let usedProvider = "";
  for (let first = 1; first <= pageCount; first += OCR_PAGES_PER_CALL) {
    const last = Math.min(pageCount, first + OCR_PAGES_PER_CALL - 1);
    const withNext = Math.min(pageCount, last + 1);
    const own = last - first + 1;
    const buffer = source ? await pdfSlice(source, first, withNext) : input.buffer;
    const scope = source
      ? withNext > last
        ? `This PDF has pages ${first}–${withNext} of a longer paper. Extract every question that STARTS on its first ${own} page(s); skip any question that starts on its last page (that page is only there to finish questions). Report page as the page number inside this PDF.`
        : `This PDF has the last pages (${first}–${last}) of a longer paper. Extract every question on all its pages, including the last page. Report page as the page number inside this PDF.`
      : "Extract every question from this document.";
    const { json, provider } = await ocrJson({ buffer, mimeType: input.mimeType, system: QUESTION_RULES(input.label, input.syllabus), user: scope, feature: "pyq_ocr" });
    usedProvider = provider;
    // Page numbers come back relative to the slice: shift them to the original paper.
    all.push(...questionSchema.parse(json).questions.map((q) => (source && q.page ? { ...q, page: q.page + first - 1 } : q)));
    await input.onProgress?.(last, pageCount);
  }
  if (source) all.push(...(await fillGaps({ source, pageCount, found: all, mimeType: input.mimeType, system: QUESTION_RULES(input.label, input.syllabus) })));
  return { method: "ocr" as const, pages: pageCount, questions: all, provider: usedProvider };
}

/** Pages to re-read for each question number missing between the ones found (from the page of the one before to the one after). */
export function gapRanges(found: Array<{ number: number; page: number | null }>, pageCount: number, maxPages = 4) {
  const pageOf = new Map(found.map((q) => [q.number, q.page]));
  const numbers = [...pageOf.keys()].sort((a, b) => a - b);
  const last = numbers[numbers.length - 1] || 0;
  const ranges = new Map<string, { from: number; to: number; numbers: number[] }>();
  for (let n = 1; n <= last; n += 1) {
    if (pageOf.has(n)) continue;
    const before = [...numbers].reverse().find((x) => x < n);
    const after = numbers.find((x) => x > n);
    const from = Math.max(1, (before !== undefined && pageOf.get(before)) || 1);
    const to = Math.min(pageCount, (after !== undefined && pageOf.get(after)) || pageCount, from + maxPages - 1);
    const key = `${from}-${to}`;
    const range = ranges.get(key) || { from, to, numbers: [] };
    range.numbers.push(n);
    ranges.set(key, range);
  }
  return [...ranges.values()];
}

/** Second pass: ask only for the missing question numbers, on the few pages where they must be. */
async function fillGaps(input: { source: PDFDocument; pageCount: number; found: ExtractedQuestion[]; mimeType: string; system: string }) {
  const MAX_CALLS = 15;
  const extra: ExtractedQuestion[] = [];
  // Questions after the last one found, when it is not on the final page (the end of a paper is easy to miss).
  const ranges = gapRanges(input.found, input.pageCount);
  const lastFound = [...input.found].sort((a, b) => b.number - a.number)[0];
  const trailing = lastFound?.page && lastFound.page < input.pageCount ? { from: lastFound.page, to: Math.min(input.pageCount, lastFound.page + 3), after: lastFound.number } : null;
  if (trailing) {
    try {
      const { json } = await ocrJson({
        buffer: await pdfSlice(input.source, trailing.from, trailing.to),
        mimeType: input.mimeType,
        system: input.system,
        user: `This PDF has pages ${trailing.from}–${trailing.to} of a longer paper. Extract ONLY the questions numbered above ${trailing.after}, exactly as printed. Report page as the page number inside this PDF. If there are none, return {"questions":[]}.`,
        feature: "pyq_ocr",
      });
      const seen = new Set(input.found.map((q) => q.number));
      for (const q of questionSchema.parse(json).questions) {
        if (q.number <= trailing.after || seen.has(q.number)) continue;
        seen.add(q.number);
        extra.push({ ...q, page: q.page ? q.page + trailing.from - 1 : trailing.from });
      }
    } catch (error) {
      console.warn(`PYQ end-of-paper re-read: ${error instanceof Error ? error.message : error}`);
    }
  }
  for (const range of ranges.slice(0, MAX_CALLS)) {
    try {
      const { json } = await ocrJson({
        buffer: await pdfSlice(input.source, range.from, range.to),
        mimeType: input.mimeType,
        system: input.system,
        user: `This PDF has pages ${range.from}–${range.to} of a longer paper. Extract ONLY the questions numbered ${range.numbers.join(", ")} (complete, exactly as printed). Report page as the page number inside this PDF.`,
        feature: "pyq_ocr",
      });
      const wanted = new Set(range.numbers);
      for (const q of questionSchema.parse(json).questions) {
        if (!wanted.has(q.number)) continue;
        wanted.delete(q.number);
        extra.push({ ...q, page: q.page ? q.page + range.from - 1 : range.from });
      }
    } catch (error) {
      console.warn(`PYQ gap re-read pages ${range.from}-${range.to}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return extra;
}

/** Read an official answer key (PDF text, or Gemini OCR). */
export async function extractAnswers(input: { buffer: Buffer; mimeType: string; language: string }) {
  const isPdf = input.mimeType === "application/pdf";
  const pages = isPdf ? await pdfPages(input.buffer) : [];
  const text = pages.join("\n");
  const ocr = !isPdf || text.replace(/\s+/g, "").length < 40;
  if (!ocr) {
    if (fakeAi()) return { method: "text" as const, pages: pages.length, answers: fakeAnswers(text) };
    const answers: ExtractedAnswer[] = [];
    try {
      for (const chunk of pageChunks(pages)) {
        const { json } = await completeAiJson({ system: ANSWER_RULES, user: chunk, feature: "pyq_answer_key", label: "PYQ answer key", provider: await pyqProvider() });
        answers.push(...answerSchema.parse(json).answers);
      }
    } catch (error) {
      // A garbled text layer can make the text read fail or time out: the scan is read below instead.
      console.warn(`PYQ answer key text read failed, reading the scan: ${error instanceof Error ? error.message : error}`);
      answers.length = 0;
    }
    // Official key pages list many answers; very few means the text layer is unreliable: read the scan too, keep the fuller result.
    if (answers.length >= pages.length * 20) return { method: "text" as const, pages: pages.length, answers };
    try {
      const scanned = (await ocrAnswers(input.buffer, input.mimeType)).answers;
      if (scanned.length > answers.length) return { method: "ocr" as const, pages: pages.length, answers: scanned };
    } catch (error) {
      if (!answers.length) throw error;
    }
    return { method: "text" as const, pages: pages.length, answers };
  }
  if (fakeAi()) return { method: "ocr" as const, pages: 1, answers: [{ number: 1, key: "A", note: "", section: "" }, { number: 2, key: "B", note: "", section: "" }] };
  const scanned = await ocrAnswers(input.buffer, input.mimeType);
  return { method: "ocr" as const, pages: scanned.pages || pages.length || 1, answers: scanned.answers };
}

/**
 * Read a scanned answer key. Multi-page PDFs are read one page per AI call (one call
 * may stop after the first subject's table); a page without its own subject heading
 * continues the previous page's subject.
 */
async function ocrAnswers(buffer: Buffer, mimeType: string) {
  const read = async (part: Buffer, user: string) =>
    answerSchema.parse((await ocrJson({ buffer: part, mimeType, system: ANSWER_RULES, user, feature: "pyq_ocr_answers" })).json).answers;
  const pageCount = mimeType === "application/pdf" ? await pageCountOf(buffer) : 0;
  if (pageCount <= 1) return { pages: pageCount || 1, answers: await read(buffer, "Read this answer key.") };
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const answers: ExtractedAnswer[] = [];
  let section = "";
  for (let page = 1; page <= pageCount; page += 1) {
    const found = await read(await pdfSlice(source, page, page), `This is page ${page} of ${pageCount} of an answer key. Read every answer on it.`);
    const own = found.find((answer) => answer.section)?.section || "";
    if (own) section = own;
    answers.push(...found.map((answer) => ({ ...answer, section: answer.section || section })));
  }
  // One subject only: no sections needed.
  if (new Set(answers.map((answer) => answer.section)).size <= 1) return { pages: pageCount, answers: answers.map((answer) => ({ ...answer, section: "" })) };
  return { pages: pageCount, answers };
}
