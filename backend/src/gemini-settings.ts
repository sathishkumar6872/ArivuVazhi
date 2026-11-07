import { AppConfig } from "./models.js";
import { config } from "./config.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const AUTO_MODEL = "auto";
/** Preference order when Auto is on — light → stronger. High-demand models get skipped via retry. */
const AUTO_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-2.5-flash-lite",
];
const FALLBACK_MODELS = [...AUTO_CHAIN];
const RETIRED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "models/gemini-2.5-flash",
  "models/gemini-2.5-pro",
  "models/gemini-2.0-flash",
]);

function shortModelName(name: string) {
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

function isOverloadedError(message: string) {
  return /high demand|try again later|resource.?exhausted|unavailable|429|503|overloaded|capacity/i.test(message);
}

/** Content-based pick: short/simple → lite; longer / image → stronger flash. */
export function pickAutoModel(available: string[], input: { user: string; system: string; hasImage?: boolean }) {
  const pool = AUTO_CHAIN.filter((name) => available.includes(name));
  const candidates = pool.length ? pool : available.filter((name) => !RETIRED_MODELS.has(name));
  if (!candidates.length) return available[0] || AUTO_CHAIN[0];
  const size = input.user.length + input.system.length;
  if (input.hasImage || size > 6000) {
    return candidates.find((name) => name.includes("3.8") || name.includes("flash-latest")) || candidates[candidates.length - 1];
  }
  if (size > 2500) {
    return candidates.find((name) => name.includes("flash") && !name.includes("lite")) || candidates[Math.min(1, candidates.length - 1)];
  }
  return candidates[0];
}

function preferLiveModel(model: string, available: string[]) {
  const short = shortModelName(model);
  if (short === AUTO_MODEL) return AUTO_MODEL;
  if (!RETIRED_MODELS.has(model) && !RETIRED_MODELS.has(short) && available.includes(short)) {
    return short;
  }
  return pickAutoModel(available, { user: "", system: "" });
}

export type GeminiSettings = {
  apiKey: string;
  model: string;
  auto: boolean;
  lastUsedModel: string;
  configured: boolean;
  keyHint: string;
  models: string[];
  enabledModels: string[];
};

export function mergeEnabledModels(all: string[], previous: string[] | undefined | null) {
  if (!previous?.length) return [...all];
  const prev = new Set(previous);
  const kept = all.filter((name) => prev.has(name));
  const added = all.filter((name) => !prev.has(name));
  return [...kept, ...added];
}

function hint(key: string) {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export async function getGeminiSettings(): Promise<GeminiSettings> {
  const settings = await AppConfig.findOne({ id: "app" }).select("+geminiApiKey").lean();
  const apiKey = (settings?.geminiApiKey || config.geminiApiKey || "").trim();
  const models = Array.isArray(settings?.geminiModels) && settings.geminiModels.length
    ? settings.geminiModels
    : FALLBACK_MODELS;
  const enabledModels =
    Array.isArray(settings?.geminiEnabledModels) && settings.geminiEnabledModels.length
      ? settings.geminiEnabledModels.filter((name) => models.includes(name))
      : [...models];
  const pickFrom = enabledModels.length ? enabledModels : models;
  const raw = settings?.geminiModel || config.geminiModel || AUTO_MODEL;
  const model = preferLiveModel(raw, pickFrom);
  return {
    apiKey,
    model,
    auto: model === AUTO_MODEL || raw === AUTO_MODEL || !raw,
    lastUsedModel: settings?.geminiLastUsedModel || "",
    configured: Boolean(apiKey),
    keyHint: hint(apiKey),
    models,
    enabledModels,
  };
}

export async function listGeminiModels(apiKey?: string): Promise<string[]> {
  const current = await getGeminiSettings();
  const key = (apiKey || current.apiKey).trim();
  if (!key) return FALLBACK_MODELS;
  const response = await fetch(`${GEMINI_BASE}/models?pageSize=100`, {
    headers: { "x-goog-api-key": key },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(payload.error?.message || `Gemini models list returned ${response.status}`);
  }
  const payload = (await response.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  };
  const models = (payload.models || [])
    .filter((item) => (item.supportedGenerationMethods || []).includes("generateContent"))
    .map((item) => shortModelName(item.name || ""))
    .filter((name) => name.startsWith("gemini") && !name.includes("embed") && !name.includes("tts") && !name.includes("image"))
    .sort((a, b) => a.localeCompare(b));
  return models.length ? models : FALLBACK_MODELS;
}

async function generateOnce(input: {
  key: string;
  model: string;
  system: string;
  user: string;
  image?: { mimeType: string; base64: string };
}): Promise<string> {
  const parts: Array<Record<string, unknown>> = [{ text: input.user }];
  if (input.image) {
    parts.push({
      inlineData: {
        mimeType: input.image.mimeType,
        data: input.image.base64,
      },
    });
  }
  const response = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(input.model)}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": input.key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(payload.error?.message || `Gemini returned ${response.status}`);
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  if (!text.trim()) throw new Error("Gemini responded empty.");
  return text.trim();
}

function buildRetryChain(start: string, available: string[]) {
  const ordered = [
    start,
    ...AUTO_CHAIN.filter((name) => name !== start),
    ...available.filter((name) => name !== start && !AUTO_CHAIN.includes(name) && !RETIRED_MODELS.has(name)),
  ].filter((name, index, all) => available.includes(name) && all.indexOf(name) === index);
  return ordered.length ? ordered : [start];
}

export async function completeGemini(input: {
  system: string;
  user: string;
  model?: string;
  apiKey?: string;
  image?: { mimeType: string; base64: string };
}): Promise<string | null> {
  const current = await getGeminiSettings();
  const key = (input.apiKey || current.apiKey).trim();
  if (!key) return null;
  const pool = current.enabledModels.length ? current.enabledModels : current.models;
  const requested = shortModelName(input.model || current.model || AUTO_MODEL);
  const start =
    requested === AUTO_MODEL || RETIRED_MODELS.has(requested)
      ? pickAutoModel(pool, { user: input.user, system: input.system, hasImage: Boolean(input.image) })
      : requested;
  const chain = buildRetryChain(start, pool.length ? pool : FALLBACK_MODELS);
  let lastError = "";
  for (const model of chain) {
    try {
      const text = await generateOnce({
        key,
        model,
        system: input.system,
        user: input.user,
        image: input.image,
      });
      await AppConfig.updateOne(
        { id: "app" },
        { $set: { geminiLastUsedModel: model, geminiLastError: "", geminiLastCheckedAt: new Date() } },
        { upsert: true },
      );
      return text;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Gemini call failed";
      if (!isOverloadedError(lastError)) break;
    }
  }
  await AppConfig.updateOne(
    { id: "app" },
    { $set: { geminiLastError: lastError, geminiLastCheckedAt: new Date() } },
    { upsert: true },
  );
  throw new Error(lastError || "Gemini call failed");
}

export async function testGeminiConnection(apiKey?: string, model?: string) {
  const current = await getGeminiSettings();
  const key = (apiKey || current.apiKey).trim();
  if (!key) {
    return { ok: false as const, message: "Add a Gemini API key first." };
  }
  try {
    const models = await listGeminiModels(key);
    const doc = await AppConfig.findOne({ id: "app" }).lean();
    const enabledModels = mergeEnabledModels(models, doc?.geminiEnabledModels);
    const preferredRaw = model || current.model || AUTO_MODEL;
    const useAuto = preferredRaw === AUTO_MODEL || !preferredRaw;
    const text = await completeGemini({
      apiKey: key,
      model: useAuto ? AUTO_MODEL : preferLiveModel(preferredRaw, enabledModels.length ? enabledModels : models),
      system: "Reply with the single word OK.",
      user: "Connection test for ArivuVazhi.",
    });
    if (!text) {
      return { ok: false as const, message: "Gemini responded empty. Key/model check pannunga." };
    }
    const refreshed = await getGeminiSettings();
    await AppConfig.updateOne(
      { id: "app" },
      {
        $set: {
          geminiModels: models,
          geminiEnabledModels: enabledModels,
          geminiModel: AUTO_MODEL,
          geminiLastCheckedAt: new Date(),
          geminiLastError: "",
        },
      },
      { upsert: true },
    );
    return {
      ok: true as const,
      message: `Gemini connect aayiduchu. Auto model mode. Last used: ${refreshed.lastUsedModel || "auto-picked"}.`,
      model: AUTO_MODEL,
      lastUsedModel: refreshed.lastUsedModel,
      models,
      enabledModels,
      auto: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach Gemini";
    await AppConfig.updateOne(
      { id: "app" },
      { $set: { geminiLastError: message, geminiLastCheckedAt: new Date() } },
      { upsert: true },
    );
    return { ok: false as const, message };
  }
}
