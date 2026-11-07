import { KnowledgeSource, MemoryItem } from "./models.js";
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

export async function retrieve(query: string, examId?: string): Promise<RetrievedChunk[]> {
  const filter: Record<string, unknown> = { status: "approved", rightsStatus: "verified" };
  if (examId) filter.examId = examId;
  const sources = await KnowledgeSource.find(filter).lean();
  const queryTokens = new Set(tokenize(query));
  return sources
    .map((source) => {
      const tokens = tokenize(`${source.title} ${source.text}`);
      const score = tokens.reduce((sum, token) => sum + (queryTokens.has(token) ? 1 : 0), 0);
      return { id: source.id, title: source.title, text: source.text, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function localAnswer(message: string, chunks: RetrievedChunk[], memory: string[]): string {
  if (!chunks.length) {
    return "I do not have an approved source for that yet. I will not guess official dates, eligibility rules, or answer keys. Ask your admin to approve a knowledge source for this topic, or try a syllabus topic that is already published.";
  }
  const memoryLine = memory.length ? `\n\nI am keeping this in mind from your learning memory: ${memory.join("; ")}.` : "";
  const body = chunks
    .map((chunk) => `${chunk.title}: ${chunk.text}`)
    .join("\n\n");
  return `Here is a grounded explanation for “${message.trim()}”.\n\n${body}\n\nThese points come only from approved ArivuVazhi learning sources. This is study guidance, not an official exam notification.${memoryLine}`;
}

async function completeWithChatGpt(
  system: string,
  user: string,
  image?: { mimeType: string; base64: string },
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
    const result = await completeChatGptResponse({
      model: openai.model || "gpt-5-mini",
      instructions: system,
      input,
    });
    return result.text || null;
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
  const chunks = await retrieve(query, input.examId);
  const memoryDocs = await MemoryItem.find({ studentId: input.studentId, active: true }).limit(8).lean();
  const memory = memoryDocs.map((item) => item.text);
  const context = chunks.map((chunk) => `[${chunk.title}] ${chunk.text}`).join("\n\n") || "No approved source matched.";
  const replyStyle = detectStudentLanguage(input.message);
  const styleLine =
    replyStyle === "ta"
      ? "Reply fully in Tamil script (தமிழ்), matching the student's language."
      : replyStyle === "tanglish"
        ? "Reply in Tanglish (Tamil in English letters mixed with English), matching the student's casual style."
        : "Reply in clear English, matching the student's language.";
  const system = `${input.prompt}\n${styleLine}\nAlways mirror the language of the student's latest message. Do not force a different language.\nUse only the approved context. If the context is insufficient, say so. Never invent official dates, eligibility, syllabus changes, or hidden answer keys. Do not calculate official mock marks. Student memory is private to this learner.\nApproved context:\n${context}\nStudent memory:\n${memory.join("; ") || "none"}`;
  let providerUsed: AiProviderName = "local";
  let answer: string | null = null;
  if (input.provider === "chatgpt") {
    answer = await completeWithChatGpt(system, query, image);
    if (answer) providerUsed = "chatgpt";
  } else if (input.provider === "gemini") {
    try {
      answer = await completeGemini({ system, user: query, image });
      if (answer) providerUsed = "gemini";
    } catch (error) {
      console.warn(`Gemini tutor call failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  } else if (input.provider === "openai" || input.provider === "ollama") {
    answer = await completeWithProvider(system, query, input.provider, image);
    if (answer) providerUsed = input.provider;
  }
  if (!answer && image) {
    answer =
      "Image questions need ChatGPT plan sign-in, Gemini API key, or an OpenAI API key with vision. No image-capable provider is available right now.";
  }
  if (!answer) answer = localAnswer(query, chunks, memory);
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
