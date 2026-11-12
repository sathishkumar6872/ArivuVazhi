import { Exam, KnowledgeSource, MemoryItem, Subject, Topic } from "./models.js";
import { completeChatGptResponse } from "./chatgpt-auth.js";
import { completeGemini } from "./gemini-settings.js";
import { getOpenAiSettings } from "./openai-settings.js";
import { config } from "./config.js";
// The package root runs its sample harness under ESM; import the parser entry directly.
// @ts-expect-error pdf-parse does not publish a declaration for this internal entry.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export type AiProviderName = "local" | "chatgpt" | "openai" | "gemini" | "ollama";

export interface RetrievedChunk {
  id: string;
  title: string;
  text: string;
  score: number;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u0B80-\u0BFF]+/)
    .filter((token) => token.length > 2);
}

function scoreSources(sources: Array<{ id: string; title: string; text: string }>, query: string): RetrievedChunk[] {
  const queryTokens = new Set(tokenize(query));
  if (!queryTokens.size) return [];
  // Need a real topical overlap — single common word matches dump unrelated old notes.
  const minScore = Math.min(3, Math.max(2, Math.ceil(queryTokens.size * 0.35)));
  return sources
    .map((source) => {
      const haystack = `${source.title} ${source.title} ${source.text}`;
      const tokens = tokenize(haystack);
      const score = tokens.reduce((sum, token) => sum + (queryTokens.has(token) ? 1 : 0), 0);
      return { id: source.id, title: source.title, text: source.text, score };
    })
    .filter((chunk) => chunk.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function wantsFreshFacts(message: string) {
  return /current|latest|today|now|online|check|update|recent|202[4-9]|chief\s*minister|\bcm\b|governor|vacancy|notification|cut[- ]?off|year data|intha varusham|இப்போ|தற்போதைய|latest|live|news|who is|enna aachu/i.test(
    message,
  );
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

/** Clean tracking junk from model markdown links before the client renders them. */
function polishTutorAnswer(answer: string) {
  return answer.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_full, label: string, href: string) => {
    try {
      const url = new URL(href);
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => url.searchParams.delete(key));
      return `[${label}](${url.toString()})`;
    } catch {
      return `[${label}](${href})`;
    }
  });
}

export async function retrieve(query: string, examId?: string): Promise<RetrievedChunk[]> {
  const base = { status: "approved", rightsStatus: "verified" } as const;
  let sources = examId ? await KnowledgeSource.find({ ...base, examId }).lean() : [];
  let ranked = scoreSources(sources, query);
  // Fall back across all approved notes when the exam-scoped bank misses.
  if (!ranked.length) {
    sources = await KnowledgeSource.find(base).lean();
    ranked = scoreSources(sources, query);
  }
  return ranked;
}

async function syllabusOutline(examId?: string, query = ""): Promise<string> {
  const wantsSyllabus = /syllabus|subject|subjects|topics?|padik|படி|பாட|பாடத்திட்ட|குரூப்|group\s*[124]|vao|tnpsc/i.test(query);
  if (!examId && !wantsSyllabus) return "";

  const hint = query.toLowerCase();
  const hintedCode =
    /group\s*4|group.?iv|குரூப்\s*4/i.test(hint) ? "TNPSC-G4" :
    /group\s*2|group.?ii|குரூப்\s*2/i.test(hint) ? "TNPSC-G2" :
    /group\s*1|group.?i|குரூப்\s*1/i.test(hint) ? "TNPSC-G1" :
    "";
  // Prefer the exam the student named in chat over their primary exam id.
  let exam = hintedCode ? await Exam.findOne({ code: hintedCode }).lean() : null;
  if (!exam && examId) exam = await Exam.findOne({ id: examId }).lean();
  if (!exam && wantsSyllabus) {
    exam = await Exam.findOne({ lifecycle: "published", authority: /TNPSC/i }).lean();
  }
  if (!exam) return "";

  const subjects = await Subject.find({ examId: exam.id, status: { $in: ["published", "approved"] } })
    .sort({ order: 1 })
    .lean();
  if (!subjects.length) {
    return `Catalogue exam: ${exam.name} (${exam.code}). Subjects not discovered yet in ArivuVazhi.`;
  }
  const topics = await Topic.find({
    examId: exam.id,
    subjectId: { $in: subjects.map((subject) => subject.id) },
    status: { $in: ["published", "approved"] },
  })
    .sort({ order: 1 })
    .lean();
  const bySubject = new Map(subjects.map((subject) => [subject.id, [] as string[]]));
  for (const topic of topics) {
    bySubject.get(topic.subjectId)?.push(topic.nameTa || topic.nameEn || topic.name);
  }
  const lines = subjects.map((subject) => {
    const names = (bySubject.get(subject.id) || []).slice(0, 12);
    const label = subject.nameTa || subject.nameEn || subject.name;
    return names.length ? `- ${label}: ${names.join("; ")}` : `- ${label}`;
  });
  return `ArivuVazhi syllabus outline for ${exam.name} (${exam.code}):\n${lines.join("\n")}\n(Study guidance from catalogue. Mention tnpsc.gov.in only if the learner asks about official notification wording.)`;
}

function localAnswer(message: string, chunks: RetrievedChunk[], memory: string[], syllabus = ""): string {
  const memoryLine = memory.length ? `\n\nI am keeping this in mind from your learning memory: ${memory.join("; ")}.` : "";
  if (syllabus && /syllabus|subject|subjects|topics?|padik|பாட/i.test(message)) {
    return `${syllabus}${memoryLine}`;
  }
  if (!chunks.length) {
    return (
      "I can still help as a study tutor, but I do not have a matching approved note for that exact ask yet. " +
      "Tell me the exam (for example TNPSC Group 4) and a topic — Polity, General Tamil, Aptitude — and I will teach one idea with a short example. " +
      "I will not invent official notification dates, vacancies, or eligibility rules." +
      memoryLine
    );
  }
  const body = chunks.map((chunk) => `${chunk.title}: ${chunk.text}`).join("\n\n");
  return `Here is a grounded explanation for “${message.trim()}”.\n\n${body}\n\nThese points come from approved ArivuVazhi learning sources. This is study guidance, not an official exam notification.${memoryLine}`;
}

async function completeWithChatGpt(
  system: string,
  user: string,
  image?: { mimeType: string; base64: string },
  options?: { webSearch?: boolean },
): Promise<string | null> {
  try {
    const openai = await getOpenAiSettings();
    const input = image
      ? [
          {
            role: "user" as const,
            content: [
              { type: "input_text", text: user },
              { type: "input_image", image_url: `data:${image.mimeType};base64,${image.base64}` },
            ],
          },
        ]
      : [{ role: "user" as const, content: user }];
    const tools = options?.webSearch ? [{ type: "web_search" }] : undefined;
    try {
      const result = await completeChatGptResponse({
        model: openai.model || "gpt-5-mini",
        instructions: system,
        input,
        tools,
      });
      return result.text || null;
    } catch (error) {
      // Plan/model may reject web_search — retry plain completion once.
      if (tools?.length) {
        console.warn(`ChatGPT web_search failed, retrying without it: ${error instanceof Error ? error.message : "unknown"}`);
        const result = await completeChatGptResponse({
          model: openai.model || "gpt-5-mini",
          instructions: system,
          input,
        });
        return result.text || null;
      }
      throw error;
    }
  } catch (error) {
    console.warn(`ChatGPT tutor call failed: ${error instanceof Error ? error.message : "unknown"}`);
    return null;
  }
}

async function completeWithProvider(
  system: string,
  user: string,
  provider: "openai" | "ollama",
  image?: { mimeType: string; base64: string },
): Promise<string | null> {
  try {
    if (provider === "openai") {
      const openai = await getOpenAiSettings();
      if (!openai.apiKey) return null;
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openai.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: openai.model,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: image
                ? [
                    { type: "text", text: user },
                    { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
                  ]
                : user,
            },
          ],
        }),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return payload.choices?.[0]?.message?.content || null;
    }
    const response = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { message?: { content?: string } };
    return payload.message?.content || null;
  } catch {
    return null;
  }
}

/** Infer reply style from what the student typed — no manual TA/EN tab needed. */
export function detectStudentLanguage(message: string): "ta" | "en" | "tanglish" {
  const tamil = (message.match(/[\u0B80-\u0BFF]/g) || []).length;
  const latin = (message.match(/[A-Za-z]/g) || []).length;
  if (tamil > 0 && latin > 4) return "tanglish";
  if (tamil > 0 && tamil >= latin) return "ta";
  if (
    /\b(enna|epdi|epadi|illai|illa|iruku|irukku|pannu|pannunga|sollu|venum|theriyala|romba|konjam|unga|ungal|appa|amma|sir|please explain)\b/i.test(
      message,
    )
  ) {
    return "tanglish";
  }
  return "en";
}

export async function tutorReply(input: {
  studentId: string;
  message: string;
  examId?: string;
  provider: AiProviderName;
  prompt: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  attachment?: { name: string; mimeType: string; base64: string };
}) {
  let documentText = "";
  let image: { mimeType: string; base64: string } | undefined;
  if (input.attachment?.mimeType === "application/pdf") {
    const parsed = await pdfParse(Buffer.from(input.attachment.base64, "base64"));
    documentText = parsed.text.slice(0, 12000);
  } else if (input.attachment?.mimeType.startsWith("text/")) {
    documentText = Buffer.from(input.attachment.base64, "base64").toString("utf8").slice(0, 12000);
  } else if (input.attachment?.mimeType.startsWith("image/")) {
    image = { mimeType: input.attachment.mimeType, base64: input.attachment.base64 };
  }
  const query = documentText ? `${input.message}\n\nDocument text:\n${documentText}` : input.message;
  const historyText = (input.history || [])
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "Student" : "Tutor"}: ${turn.content}`)
    .join("\n");
  // Retrieve from the latest ask only — full chat history was pulling unrelated old notes into answers.
  const freshAsk = wantsFreshFacts(query);
  const [chunks, syllabus] = await Promise.all([
    freshAsk ? Promise.resolve([] as RetrievedChunk[]) : retrieve(query, input.examId),
    syllabusOutline(input.examId, `${historyText}\n${query}`),
  ]);
  const memoryDocs = await MemoryItem.find({ studentId: input.studentId, active: true }).limit(8).lean();
  const memory = memoryDocs.map((item) => item.text);
  const context =
    [chunks.map((chunk) => `[${chunk.title}] ${chunk.text}`).join("\n\n"), syllabus]
      .filter(Boolean)
      .join("\n\n") || "No approved source matched for this turn.";
  const replyStyle = detectStudentLanguage(input.message);
  const styleLine =
    replyStyle === "ta"
      ? "Reply fully in Tamil script (தமிழ்), matching the student's language."
      : replyStyle === "tanglish"
        ? "Reply in Tanglish (Tamil in English letters mixed with English), matching the student's casual style."
        : "Reply in clear English, matching the student's language.";
  const system = `${input.prompt}
${styleLine}
Always mirror the language of the student's latest message. Do not force a different language.
Today's date is ${todayLabel()} (Asia/Kolkata). Treat this as the current calendar day.
You are a helpful competitive-exam tutor. Teach subjects, topics, concepts, Tamil literature, aptitude, and study plans clearly — one idea at a time with a short example.
Approved notes are static study notes, not a live news feed. Never present those notes as “the year of your data”.
For current affairs / “who is now” / latest updates: use live web search when available; otherwise answer with the best current knowledge and say the learner should verify on the official site. Do not claim your knowledge ends in 2023/2024 if web search ran.
Hard limits only: never invent official notification dates, vacancies, cut-offs, or eligibility changes as confirmed facts without a source; never invent a hidden official answer key; do not calculate official mock marks.
Prefer answering over refusing. Use conversation history so you do not re-ask facts the student already gave (e.g. Group 4).
Do not say "I cannot answer because no approved source" for normal study questions — explain the concept instead.
Links: keep answers short. Do NOT paste long gallery/news URLs. For “who is CM / current affairs”, give the name + date in 1–2 lines; add at most one short markdown link like [tn.gov.in](https://www.tn.gov.in) only if the student asks for a source or verification. Never include utm_source tracking params. For normal concept teaching, no links.
Approved / syllabus context:
${context}
Student memory:
${memory.join("; ") || "none"}`;
  const userPayload = historyText
    ? `Conversation so far:\n${historyText}\n\nLatest student message:\n${query}`
    : query;
  let providerUsed: AiProviderName = "local";
  let answer: string | null = null;
  if (input.provider === "chatgpt") {
    answer = await completeWithChatGpt(system, userPayload, image, { webSearch: freshAsk });
    if (answer) providerUsed = "chatgpt";
  } else if (input.provider === "gemini") {
    try {
      answer = await completeGemini({ system, user: userPayload, image });
      if (answer) providerUsed = "gemini";
    } catch (error) {
      console.warn(`Gemini tutor call failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  } else if (input.provider === "openai" || input.provider === "ollama") {
    answer = await completeWithProvider(system, userPayload, input.provider, image);
    if (answer) providerUsed = input.provider;
  }
  if (!answer && image) {
    answer =
      "Image questions need ChatGPT plan sign-in, Gemini API key, or an OpenAI API key with vision. No image-capable provider is available right now.";
  }
  if (!answer) answer = localAnswer(query, chunks, memory, syllabus);
  answer = polishTutorAnswer(answer);
  return {
    answer,
    providerUsed,
    sources: chunks.map((chunk) => ({ id: chunk.id, title: chunk.title })),
    tokens: Math.ceil((input.message.length + answer.length) / 4),
  };
}

export async function transcribeAudio(input: { name: string; mimeType: string; base64: string }) {
  const openai = await getOpenAiSettings();
  if (!openai.apiKey) return null;
  try {
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob([Buffer.from(input.base64, "base64")], { type: input.mimeType }), input.name);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openai.apiKey}` },
      body: form,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { text?: string };
    return payload.text?.trim() || null;
  } catch {
    return null;
  }
}
