import { AppConfig } from "./models.js";
import { config } from "./config.js";

export type OpenAiSettings = {
  apiKey: string;
  model: string;
  provider: "local" | "chatgpt" | "openai" | "gemini" | "ollama";
  configured: boolean;
  keyHint: string;
};

function hint(key: string) {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export async function getOpenAiSettings(): Promise<OpenAiSettings> {
  const settings = await AppConfig.findOne({ id: "app" }).select("+openaiApiKey").lean();
  const apiKey = (settings?.openaiApiKey || config.openaiApiKey || "").trim();
  const model = settings?.openaiModel || config.openaiModel || "gpt-4o-mini";
  const provider = (settings?.aiProvider || "local") as OpenAiSettings["provider"];
  return {
    apiKey,
    model,
    provider,
    configured: Boolean(apiKey),
    keyHint: hint(apiKey),
  };
}

export async function testOpenAiConnection(apiKey?: string, model?: string) {
  const current = await getOpenAiSettings();
  const key = (apiKey || current.apiKey).trim();
  const useModel = model || current.model || "gpt-4o-mini";
  if (!key) {
    return { ok: false as const, message: "Add an OpenAI API key first." };
  }
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: useModel,
        temperature: 0,
        max_tokens: 24,
        messages: [
          { role: "system", content: "Reply with the single word OK." },
          { role: "user", content: "Connection test for ArivuVazhi." },
        ],
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      return { ok: false as const, message: payload.error?.message || `OpenAI returned ${response.status}` };
    }
    return { ok: true as const, message: `Connected to ChatGPT model ${useModel}.`, model: useModel };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Could not reach OpenAI" };
  }
}
