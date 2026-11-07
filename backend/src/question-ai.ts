import { z } from "zod";
import { completeChatGptResponse } from "./chatgpt-auth.js";
import { completeGemini } from "./gemini-settings.js";
import { config } from "./config.js";
import { HttpError, nid } from "./http.js";
import { AiUsage, AppConfig, Exam, Question, Subject, Topic, User } from "./models.js";
import { getOpenAiSettings } from "./openai-settings.js";

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
}): Promise<{ questions: GeneratedMcq[]; provider: string }> {
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

JSON shape:
{"questions":[{"stem":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctKey":"A","explanation":"...","difficulty":"${input.difficulty}"}]}`;

  const raw = await completeRaw(system, user, provider);
  const parsed = generatedBundleSchema.parse(extractJson(raw));
  const questions = parsed.questions.slice(0, count).map(normalizeOptions);
  if (!questions.length) {
    throw new HttpError(502, "AI returned no usable questions. Try again.", "AI_EMPTY");
  }
  return { questions, provider };
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

export async function ensurePracticeQuestions(input: {
  studentId: string;
  examId: string;
  topicId?: string;
  difficulty?: "easy" | "medium" | "hard";
  language?: "en" | "ta";
  count: number;
}) {
  const exam = await Exam.findOne({ id: input.examId, lifecycle: "published" }).lean();
  if (!exam) throw new HttpError(404, "Published exam not found", "NOT_FOUND");

  const student = await User.findOne({ id: input.studentId }).lean();
  const language: "en" | "ta" = input.language || (student?.language === "ta" ? "ta" : "en");
  const difficulty = input.difficulty || "medium";
  const count = Math.min(20, Math.max(1, input.count));

  const filter: Record<string, unknown> = {
    examId: input.examId,
    status: "published",
    language,
  };
  if (input.topicId) filter.topicId = input.topicId;
  if (input.difficulty) filter.difficulty = input.difficulty;

  const fallbackPool = async () => {
    let pool = await Question.find(filter).lean();
    if (!pool.length && input.difficulty) {
      const loose = { ...filter };
      delete loose.difficulty;
      pool = await Question.find(loose).lean();
    }
    if (!pool.length) {
      const anyLang = { ...filter };
      delete (anyLang as { language?: string }).language;
      pool = await Question.find(anyLang).lean();
    }
    if (!pool.length) {
      throw new HttpError(404, "No practice questions available and AI generate failed.", "NOT_FOUND");
    }
    return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
  };

  const anchor = await pickTopicAnchor({ examId: input.examId, topicId: input.topicId });
  const subjectName = language === "ta" ? anchor.subject.nameTa || anchor.subject.name : anchor.subject.nameEn || anchor.subject.name;
  const topicName = language === "ta" ? anchor.topic.nameTa || anchor.topic.name : anchor.topic.nameEn || anchor.topic.name;

  try {
    const { questions: generated, provider } = await generateMcqBundle({
      examName: exam.name,
      examCode: exam.code,
      authority: exam.authority,
      subjectName,
      topicName,
      language,
      difficulty,
      count,
    });

    const docs = generated.map((item) => ({
      id: nid(),
      examId: exam.id,
      subjectId: anchor.subject.id,
      topicId: anchor.topic.id,
      stem: item.stem,
      options: item.options,
      correctKey: item.correctKey,
      explanation: item.explanation,
      difficulty: item.difficulty || difficulty,
      language,
      source: "student_ai" as const,
      status: "published" as const,
      rightsStatus: "not_applicable" as const,
      marks: exam.pattern?.marksPerQuestion || 1.5,
    }));
    await Question.insertMany(docs);
    await AiUsage.create({
      id: nid(),
      userId: input.studentId,
      provider,
      feature: "practice_generate",
      tokens: Math.ceil(JSON.stringify(generated).length / 4),
      estimatedInr: 0,
    });
    return docs;
  } catch (error) {
    if (error instanceof HttpError && error.code === "SYLLABUS_EMPTY") throw error;
    console.warn(`Practice AI generate failed: ${error instanceof Error ? error.message : "unknown"}`);
    return fallbackPool();
  }
}

export async function ensureMockQuestions(input: {
  studentId: string;
  examId: string;
  existingIds: string[];
  targetCount: number;
}) {
  const existing = await Question.find({
    id: { $in: input.existingIds },
    examId: input.examId,
    status: "published",
  }).lean();
  if (existing.length >= Math.min(input.targetCount, input.existingIds.length || input.targetCount) && existing.length > 0) {
    const byId = new Map(existing.map((question) => [question.id, question]));
    const ordered = input.existingIds.map((id) => byId.get(id)).filter(Boolean);
    if (ordered.length) return ordered as typeof existing;
  }

  const target = Math.min(25, Math.max(5, input.targetCount || 10));
  const exam = await Exam.findOne({ id: input.examId, lifecycle: "published" }).lean();
  if (!exam) throw new HttpError(404, "Published exam not found", "NOT_FOUND");
  const student = await User.findOne({ id: input.studentId }).lean();
  const language: "en" | "ta" = student?.language === "ta" ? "ta" : "en";

  const subjects = await Subject.find({ examId: input.examId }).sort({ order: 1 }).lean();
  if (!subjects.length) {
    throw new HttpError(404, "No syllabus subjects yet. Admin must discover subjects before mock generation.", "SYLLABUS_EMPTY");
  }

  const perSubject = Math.max(1, Math.ceil(target / subjects.length));
  const created: Array<{
    id: string;
    examId: string;
    subjectId: string;
    topicId: string;
    stem: string;
    options: GeneratedMcq["options"];
    correctKey: string;
    explanation: string;
    difficulty: "easy" | "medium" | "hard";
    language: "en" | "ta";
    source: "student_ai";
    status: "published";
    rightsStatus: "not_applicable";
    marks: number;
  }> = [];
  let providerUsed = "local";

  for (const subject of subjects) {
    if (created.length >= target) break;
    const topics = await Topic.find({ examId: input.examId, subjectId: subject.id }).sort({ order: 1 }).lean();
    if (!topics.length) continue;
    const remaining = target - created.length;
    const batch = Math.min(perSubject, remaining);
    const topic = topics[created.length % topics.length];
    const subjectName = language === "ta" ? subject.nameTa || subject.name : subject.nameEn || subject.name;
    const topicName = language === "ta" ? topic.nameTa || topic.name : topic.nameEn || topic.name;
    const { questions: generated, provider } = await generateMcqBundle({
      examName: exam.name,
      examCode: exam.code,
      authority: exam.authority,
      subjectName,
      topicName,
      language,
      difficulty: "medium",
      count: batch,
    });
    providerUsed = provider;
    for (const item of generated) {
      if (created.length >= target) break;
      created.push({
        id: nid(),
        examId: exam.id,
        subjectId: subject.id,
        topicId: topic.id,
        stem: item.stem,
        options: item.options,
        correctKey: item.correctKey,
        explanation: item.explanation,
        difficulty: item.difficulty || "medium",
        language,
        source: "student_ai",
        status: "published",
        rightsStatus: "not_applicable",
        marks: exam.pattern?.marksPerQuestion || 1.5,
      });
    }
  }

  if (!created.length) {
    throw new HttpError(404, "Could not generate mock questions. Update syllabus topics first.", "SYLLABUS_EMPTY");
  }
  await Question.insertMany(created);
  await AiUsage.create({
    id: nid(),
    userId: input.studentId,
    provider: providerUsed,
    feature: "mock_generate",
    tokens: Math.ceil(JSON.stringify(created).length / 4),
    estimatedInr: 0,
  });
  return created;
}
