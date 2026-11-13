import { z } from "zod";
import { completeChatGptResponse } from "./chatgpt-auth.js";
import { completeGemini } from "./gemini-settings.js";
import { config } from "./config.js";
import { HttpError, nid } from "./http.js";
import { assertAiBudgetAvailable, estimateAiInr } from "./ai-budget.js";
import { AiUsage, AppConfig, Exam, PracticeSession, Question, Subject, Topic, User } from "./models.js";
import { stemKey } from "./governance.js";
import { getOpenAiSettings } from "./openai-settings.js";

const AI_TIMEOUT_MS = 55_000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new HttpError(504, `${label} timed out. Try again.`, "AI_TIMEOUT")), AI_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const generatedQuestionSchema = z.object({
  stem: z.string().min(8).max(800),
  options: z
    .array(z.object({ key: z.enum(["A", "B", "C", "D"]), text: z.string().min(1).max(280) }))
    .length(4),
  correctKey: z.enum(["A", "B", "C", "D"]),
  explanation: z.string().min(8).max(1200),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

const generatedBundleSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1).max(25),
});

export type GeneratedMcq = z.infer<typeof generatedQuestionSchema>;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI did not return JSON questions.");
  return JSON.parse(raw.slice(start, end + 1));
}

async function resolveProvider(): Promise<"chatgpt" | "gemini" | "openai" | "local"> {
  const settings = await AppConfig.findOne({ id: "app" }).lean();
  const chatgptOn = settings?.chatgptEnabled ?? settings?.aiProvider === "chatgpt";
  const geminiOn = settings?.geminiEnabled ?? settings?.aiProvider === "gemini";
  let provider = (settings?.aiProvider || "local") as "chatgpt" | "gemini" | "openai" | "local" | "ollama";
  if (provider === "chatgpt" && !chatgptOn) provider = geminiOn ? "gemini" : "local";
  if (provider === "gemini" && !geminiOn) provider = chatgptOn ? "chatgpt" : "local";
  if (provider === "ollama") return "local";
  return provider;
}

async function completeRaw(system: string, user: string, provider: "chatgpt" | "gemini" | "openai" | "local") {
  if (provider === "chatgpt") {
    const openai = await getOpenAiSettings();
    const result = await completeChatGptResponse({
      model: openai.model || "gpt-5-mini",
      instructions: system,
      input: [{ role: "user", content: user }],
    });
    return result.text || "";
  }
  if (provider === "gemini") {
    return (await completeGemini({ system, user })) || "";
  }
  if (provider === "openai") {
    const openai = await getOpenAiSettings();
    if (!openai.apiKey) throw new Error("OpenAI API key not configured.");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openai.model || config.openaiModel,
        temperature: 0.35,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(payload.error?.message || `OpenAI returned ${response.status}`);
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return payload.choices?.[0]?.message?.content || "";
  }
  throw new HttpError(503, "Enable ChatGPT or Gemini in AI providers to generate practice questions.", "AI_UNAVAILABLE");
}

function normalizeOptions(item: GeneratedMcq): GeneratedMcq {
  const keys = ["A", "B", "C", "D"] as const;
  const byKey = new Map(item.options.map((option) => [option.key, option.text.trim()]));
  const options = keys.map((key) => ({ key, text: byKey.get(key) || "" }));
  if (options.some((option) => !option.text)) {
    throw new Error("AI returned incomplete options.");
  }
  if (!keys.includes(item.correctKey)) {
    throw new Error("AI returned an invalid correct key.");
  }
  return {
    ...item,
    stem: item.stem.trim(),
    explanation: item.explanation.trim(),
    options,
  };
}

export async function generateMcqBundle(input: {
  examName: string;
  examCode: string;
  authority: string;
  subjectName: string;
  topicName: string;
  language: "en" | "ta";
  difficulty: "easy" | "medium" | "hard";
  count: number;
  /** Stems the student has already seen; the model is asked not to repeat them. */
  avoidStems?: string[];
}): Promise<{ questions: GeneratedMcq[]; provider: string }> {
  await assertAiBudgetAvailable("practice generation");
  if (process.env.AI_FAKE_QUESTIONS === "1" && !config.isProd) return fakeBundle(input);
  const provider = await resolveProvider();
  if (provider === "local") {
    throw new HttpError(503, "Enable ChatGPT or Gemini in AI providers to generate practice questions.", "AI_UNAVAILABLE");
  }
  const count = Math.min(25, Math.max(1, input.count));
  const languageLine =
    input.language === "ta"
      ? "Write every stem, option, and explanation in Tamil script (தமிழ்)."
      : "Write every stem, option, and explanation in clear English.";
  const system = `You are ArivuVazhi, a government-exam question writer for Tamil Nadu / Indian competitive exams.
Return ONLY valid JSON. No markdown outside JSON.
Create original MCQs — never copy copyrighted PYQ wording verbatim.
Each question must have exactly 4 options with keys A,B,C,D and one correctKey.
Explanations must briefly say why the correct option is right.
Stay inside the given exam syllabus topic. Prefer factual, checkable items.
${languageLine}`;
  const user = `Exam: ${input.examName} (${input.examCode}) · Authority: ${input.authority}
Subject: ${input.subjectName}
Topic: ${input.topicName}
Difficulty: ${input.difficulty}
Count: ${count}
${
  input.avoidStems?.length
    ? `\nThe student has already practised these. Do NOT repeat or lightly reword them; ask about different facts:\n${input.avoidStems
        .slice(0, 30)
        .map((stem) => `- ${stem.slice(0, 120)}`)
        .join("\n")}\n`
    : ""
}
JSON shape:
{"questions":[{"stem":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctKey":"A","explanation":"...","difficulty":"${input.difficulty}"}]}`;

  const raw = await withTimeout(completeRaw(system, user, provider), "Question generation");
  const parsed = generatedBundleSchema.parse(extractJson(raw));
  const questions = parsed.questions.slice(0, count).map(normalizeOptions);
  if (!questions.length) {
    throw new HttpError(502, "AI returned no usable questions. Try again.", "AI_EMPTY");
  }
  return { questions, provider };
}

/**
 * Local verification only (AI_FAKE_QUESTIONS=1, never in production): deterministic
 * questions without calling a provider. It deliberately echoes one already-seen stem
 * so the duplicate filter can be exercised.
 */
async function fakeBundle(input: { topicName: string; count: number; avoidStems?: string[] }) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const count = Math.min(25, Math.max(1, input.count));
  const questions: GeneratedMcq[] = Array.from({ length: count }, (_, index) => ({
    stem: index === 0 && input.avoidStems?.length ? input.avoidStems[0] : `Fake ${input.topicName} question ${nid()}`,
    options: (["A", "B", "C", "D"] as const).map((key) => ({ key, text: `Option ${key}` })),
    correctKey: "A",
    explanation: "Fake explanation for local verification.",
    difficulty: "medium",
  }));
  return { questions, provider: "fake" };
}

async function pickTopicAnchor(input: {
  examId: string;
  topicId?: string;
  subjectId?: string;
}) {
  if (input.topicId) {
    const topic = await Topic.findOne({ id: input.topicId, examId: input.examId }).lean();
    if (!topic) throw new HttpError(404, "Topic not found for this exam", "NOT_FOUND");
    const subject = await Subject.findOne({ id: topic.subjectId, examId: input.examId }).lean();
    if (!subject) throw new HttpError(404, "Subject missing for topic", "NOT_FOUND");
    return { topic, subject };
  }
  if (input.subjectId) {
    const subject = await Subject.findOne({ id: input.subjectId, examId: input.examId }).lean();
    if (!subject) throw new HttpError(404, "Subject not found for this exam", "NOT_FOUND");
    const topics = await Topic.find({ examId: input.examId, subjectId: subject.id }).sort({ order: 1 }).lean();
    if (!topics.length) {
      throw new HttpError(404, "No topics for this subject. Admin must refresh syllabus topics first.", "SYLLABUS_EMPTY");
    }
    return { topic: topics[Math.floor(Math.random() * topics.length)], subject };
  }
  const subjects = await Subject.find({ examId: input.examId }).sort({ order: 1 }).lean();
  if (!subjects.length) {
    throw new HttpError(404, "No syllabus subjects yet. Admin must discover subjects for this exam first.", "SYLLABUS_EMPTY");
  }
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  const topics = await Topic.find({ examId: input.examId, subjectId: subject.id }).sort({ order: 1 }).lean();
  if (!topics.length) {
    throw new HttpError(404, "No topics yet. Admin must update topics for syllabus subjects first.", "SYLLABUS_EMPTY");
  }
  return { topic: topics[Math.floor(Math.random() * topics.length)], subject };
}

export const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

type BankQuestion = {
  id: string;
  examId: string;
  subjectId: string;
  topicId: string;
  stem: string;
  options: Array<{ key: string; text: string }>;
  correctKey: string;
  explanation: string;
  difficulty: string;
  language: string;
  source: string;
  ownerStudentId?: string;
};

/**
 * What a student may be served: the approved bank plus AI questions generated for
 * that student (still under review, never shown to anyone else).
 */
export function visibleToStudent(studentId: string) {
  return { $or: [{ status: "published" }, { status: "under_review", ownerStudentId: studentId }] };
}

/** Every question this student has already been served in practice for the exam. */
async function seenPracticeIds(studentId: string, examId: string) {
  const sessions = await PracticeSession.find({ studentId, examId }).sort({ createdAt: -1 }).select("questionIds").lean();
  return sessions.map((session) => session.questionIds);
}

export async function stemsFor(ids: string[], limit: number) {
  if (!ids.length) return [];
  const rows = await Question.find({ id: { $in: ids.slice(0, limit) } }).select("stem").lean();
  return rows.map((row) => row.stem);
}

/**
 * Generate questions owned by one student. Drops anything whose normalised stem
 * already exists for the exam (or repeats inside the batch).
 */
export async function generateForStudent(input: {
  studentId: string;
  exam: { id: string; name: string; code: string; authority: string; pattern?: { marksPerQuestion?: number | null } | null };
  subject: { id: string; name: string; nameEn?: string | null; nameTa?: string | null };
  topic: { id: string; name: string; nameEn?: string | null; nameTa?: string | null };
  language: "en" | "ta";
  difficulty: "easy" | "medium" | "hard";
  count: number;
  avoidStems: string[];
  feature: string;
}) {
  const label = (item: { name: string; nameEn?: string | null; nameTa?: string | null }) =>
    input.language === "ta" ? item.nameTa || item.name : item.nameEn || item.name;
  const { questions: generated, provider } = await generateMcqBundle({
      examName: input.exam.name,
      examCode: input.exam.code,
      authority: input.exam.authority,
      subjectName: label(input.subject),
      topicName: label(input.topic),
      language: input.language,
      difficulty: input.difficulty,
      count: input.count,
      avoidStems: input.avoidStems,
  });
  const keyed = generated.map((item) => ({ item, key: stemKey(item.stem) }));
  const clashes = await Question.find({ examId: input.exam.id, stemKey: { $in: keyed.map((row) => row.key) } })
    .select("stemKey")
    .lean();
  const taken = new Set([...clashes.map((row) => row.stemKey), ...input.avoidStems.map(stemKey)]);
  const docs: BankQuestion[] = [];
  for (const { item, key } of keyed) {
    if (!key || taken.has(key)) continue;
    taken.add(key);
    docs.push({
      id: nid(),
      examId: input.exam.id,
      subjectId: input.subject.id,
      topicId: input.topic.id,
      stem: item.stem,
      options: item.options,
      correctKey: item.correctKey,
      explanation: item.explanation,
      difficulty: item.difficulty || input.difficulty,
      language: input.language,
      source: "student_ai",
      ownerStudentId: input.studentId,
    });
  }
  if (docs.length) {
    await Question.insertMany(
      docs.map((doc) => ({
        ...doc,
        stemKey: stemKey(doc.stem),
        status: "under_review",
        rightsStatus: "not_applicable",
        marks: input.exam.pattern?.marksPerQuestion || 1.5,
      })),
    );
  }
  const tokens = Math.ceil(JSON.stringify(generated).length / 4);
  await AiUsage.create({
    id: nid(),
    userId: input.studentId,
    provider,
    feature: input.feature,
    tokens,
    estimatedInr: estimateAiInr(tokens, provider),
  });
  return { docs, provider };
}

const prefetching = new Set<string>();

/** Prepare the student's next practice set in the background so the next start is instant. */
function prefetchPractice(input: {
  studentId: string;
  examId: string;
  topicId?: string;
  difficulty?: "easy" | "medium" | "hard";
  language: "en" | "ta";
  count: number;
}) {
  const key = `${input.studentId}:${input.examId}:${input.topicId || "*"}:${input.language}`;
  if (prefetching.has(key)) return;
  prefetching.add(key);
  void (async () => {
    try {
      const seen = (await seenPracticeIds(input.studentId, input.examId)).flat();
      const ready = await Question.countDocuments({
        examId: input.examId,
        ownerStudentId: input.studentId,
        status: "under_review",
        language: input.language,
        id: { $nin: seen },
        ...(input.topicId ? { topicId: input.topicId } : {}),
      });
      // Keep two sets ahead so the next starts never wait on the AI.
      if (ready >= input.count * 2) return;
      const exam = await Exam.findOne({ id: input.examId, lifecycle: "published" }).lean();
      if (!exam) return;
      const anchor = await pickTopicAnchor({ examId: input.examId, topicId: input.topicId });
      await generateForStudent({
        studentId: input.studentId,
        exam,
        subject: anchor.subject,
        topic: anchor.topic,
        language: input.language,
        difficulty: input.difficulty || "medium",
        // A few extra so duplicates dropped by the stem filter don't leave a short set.
        count: Math.min(25, input.count * 2 - ready + 2),
        avoidStems: await stemsFor(seen, 30),
        feature: "practice_prefetch",
      });
    } catch (error) {
      console.warn(`Practice prefetch failed: ${error instanceof Error ? error.message : "unknown"}`);
    } finally {
      prefetching.delete(key);
    }
  })();
}

async function sample(filter: Record<string, unknown>, size: number): Promise<BankQuestion[]> {
  if (size <= 0) return [];
  return Question.aggregate<BankQuestion>([{ $match: filter }, { $sample: { size } }]);
}

/**
 * Practice set for one student, never repeating a question they were already served:
 *  1. unseen questions prepared for them earlier (prefetch) or from the approved bank — instant;
 *  2. otherwise AI generates the shortfall live;
 *  3. only if AI is unavailable and nothing unseen is left, it falls back to repeats.
 * After serving, the next set is prefetched in the background.
 */
export async function ensurePracticeQuestions(input: {
  studentId: string;
  examId: string;
  topicId?: string;
  difficulty?: "easy" | "medium" | "hard";
  language?: "en" | "ta";
  count: number;
}): Promise<{ questions: BankQuestion[]; generatedLive: number; repeated: number }> {
  const [exam, student, seenLists] = await Promise.all([
    Exam.findOne({ id: input.examId, lifecycle: "published" }).lean(),
    input.language ? Promise.resolve(null) : User.findOne({ id: input.studentId }).select("language").lean(),
    seenPracticeIds(input.studentId, input.examId),
  ]);
  if (!exam) throw new HttpError(404, "Published exam not found", "NOT_FOUND");
  const language: "en" | "ta" = input.language || (student?.language === "ta" ? "ta" : "en");
  const count = Math.min(20, Math.max(1, input.count));
  const seen = new Set(seenLists.flat());

  const scope: Record<string, unknown> = { examId: input.examId, ...visibleToStudent(input.studentId) };
  if (input.topicId) scope.topicId = input.topicId;
  const exact: Record<string, unknown> = { ...scope, language };
  if (input.difficulty) exact.difficulty = input.difficulty;

  const picked: BankQuestion[] = [];
  const take = (batch: BankQuestion[]) => {
    for (const question of batch) {
      if (picked.length >= count || seen.has(question.id)) continue;
      seen.add(question.id);
      picked.push(question);
    }
  };
  // Prepared-for-me first (prefetched AI questions), then the approved bank.
  take(await sample({ ...exact, ownerStudentId: input.studentId, status: "under_review", id: { $nin: [...seen] } }, count));
  take(await sample({ ...exact, id: { $nin: [...seen] } }, count - picked.length));

  let generatedLive = 0;
  if (picked.length < count) {
    try {
      const anchor = await pickTopicAnchor({ examId: input.examId, topicId: input.topicId });
      const { docs } = await generateForStudent({
        studentId: input.studentId,
        exam,
        subject: anchor.subject,
        topic: anchor.topic,
        language,
        difficulty: input.difficulty || "medium",
        count: count - picked.length,
        avoidStems: await stemsFor(seenLists.flat(), 30),
        feature: "practice_generate",
      });
      generatedLive = docs.length;
      take(docs);
    } catch (error) {
      if (error instanceof HttpError && error.code === "SYLLABUS_EMPTY") throw error;
      console.warn(`Live practice generation failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  // AI unavailable: relax difficulty/language but still only unseen questions.
  if (picked.length < count) take(await sample({ ...scope, id: { $nin: [...seen] } }, count - picked.length));

  // Last resort: repeat the questions seen longest ago rather than return nothing.
  let repeated = 0;
  if (picked.length < count) {
    const oldestFirst = [...seenLists].reverse().flat();
    const pickedIds = new Set(picked.map((question) => question.id));
    const candidates = oldestFirst.filter((id, index) => !pickedIds.has(id) && oldestFirst.indexOf(id) === index);
    const rows = await Question.find({ id: { $in: candidates }, ...exactScopeWithoutIds(scope) }).lean<BankQuestion[]>();
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of candidates) {
      const row = byId.get(id);
      if (!row || picked.length >= count) continue;
      picked.push(row);
      repeated += 1;
    }
  }

  if (!picked.length) {
    throw new HttpError(404, "No questions could be prepared for this selection. Try another topic or try again shortly.", "NO_QUESTIONS");
  }
  prefetchPractice({ studentId: input.studentId, examId: input.examId, topicId: input.topicId, difficulty: input.difficulty, language, count });
  return { questions: shuffle(picked), generatedLive, repeated };
}

function exactScopeWithoutIds(scope: Record<string, unknown>) {
  const copy = { ...scope };
  delete copy.id;
  return copy;
}
