import { z } from "zod";
import { completeChatGptResponse } from "./chatgpt-auth.js";
import { completeGemini } from "./gemini-settings.js";
import { AppConfig } from "./models.js";
import { getOpenAiSettings } from "./openai-settings.js";
import { config } from "./config.js";

const bilingualLabel = z.object({
  en: z.string().min(2).max(160),
  ta: z.string().min(2).max(160),
});

const subjectsOnlySchema = z.object({
  subjects: z.array(bilingualLabel).min(1).max(20),
  notes: z.string().max(500).optional().default(""),
});

const topicsOnlySchema = z.object({
  topics: z.array(bilingualLabel).min(1).max(40),
  notes: z.string().max(500).optional().default(""),
});

export type BilingualLabel = z.infer<typeof bilingualLabel>;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI did not return JSON syllabus.");
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
        temperature: 0.1,
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
  throw new Error("Enable ChatGPT or Gemini in AI providers, then refresh syllabus.");
}

async function requireProvider() {
  const provider = await resolveProvider();
  if (provider === "local") {
    throw new Error("Enable ChatGPT or Gemini (active AI), then try again.");
  }
  return provider;
}

function dedupeLabels(items: BilingualLabel[]) {
  const seen = new Set<string>();
  const out: BilingualLabel[] = [];
  for (const item of items) {
    const en = item.en.trim();
    const ta = item.ta.trim();
    if (!en || !ta) continue;
    const key = en.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ en, ta });
  }
  return out;
}

/** Step 1: discover bilingual subject list for an exam (no topics yet). */
export async function fetchExamSubjectsWithAi(input: {
  exam: { name: string; code: string; authority: string; description?: string };
  year: number;
}) {
  const provider = await requireProvider();
  const system = `You are a Tamil Nadu government exam syllabus researcher for ArivuVazhi.
Return ONLY JSON:
{"subjects":[{"en":"English subject name","ta":"தமிழ் பெயர்"}],"notes":"short note"}
Rules:
- List ONLY top-level subjects / papers / sections for the exam (typically 4–12).
- Every subject MUST have both English (en) and Tamil (ta) names.
- Do not include topics yet.
- Do not invent eligibility, dates, or vacancies.
- Prefer the common official syllabus structure for this exam code/year.`;
  const user = `Exam: ${input.exam.name}
Code: ${input.exam.code}
Authority: ${input.exam.authority}
Year: ${input.year}
Description: ${input.exam.description || "n/a"}

List the bilingual subject list only.`;
  const raw = await completeRaw(system, user, provider);
  if (!raw.trim()) throw new Error("AI returned empty subject list.");
  const parsed = subjectsOnlySchema.parse(extractJson(raw));
  const subjects = dedupeLabels(parsed.subjects);
  if (!subjects.length) throw new Error("AI subject list was empty.");
  return {
    subjects,
    notes: parsed.notes || `Subjects via ${provider} for ${input.year}.`,
    provider,
  };
}

/** Step 2: generate bilingual topics for ONE subject. */
export async function fetchSubjectTopicsWithAi(input: {
  exam: { name: string; code: string; authority: string };
  year: number;
  subject: { nameEn: string; nameTa: string };
}) {
  const provider = await requireProvider();
  const system = `You are a Tamil Nadu government exam syllabus researcher for ArivuVazhi.
Return ONLY JSON:
{"topics":[{"en":"English topic","ta":"தமிழ் தலைப்பு"}],"notes":"short note"}
Rules:
- Topics MUST belong only to the given subject for this exam.
- Every topic MUST have both English (en) and Tamil (ta).
- Typically 6–25 important topics; omit invented niche items.
- Do not invent eligibility, dates, vacancies, or cut-offs.`;
  const user = `Exam: ${input.exam.name} (${input.exam.code}) · ${input.exam.authority}
Year: ${input.year}
Subject EN: ${input.subject.nameEn}
Subject TA: ${input.subject.nameTa}

Generate bilingual topics for THIS subject only.`;
  const raw = await completeRaw(system, user, provider);
  if (!raw.trim()) throw new Error("AI returned empty topic list.");
  const parsed = topicsOnlySchema.parse(extractJson(raw));
  const topics = dedupeLabels(parsed.topics);
  if (!topics.length) throw new Error("AI topic list was empty.");
  return {
    topics,
    notes: parsed.notes || `Topics via ${provider} for ${input.subject.nameEn}.`,
    provider,
  };
}
