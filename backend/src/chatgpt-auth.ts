import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { decryptSecret, encryptSecret } from "./crypto-secret.js";
import { AppConfig } from "./models.js";

/**
 * Sign in with ChatGPT for a locally run project: the admin authorizes ArivuVazhi in the browser,
 * and AI requests are then billed to their ChatGPT plan instead of an API key.
 * https://developers.openai.com/siwc/token-sharing-open-source
 */

const ISSUER = "https://auth.openai.com";
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const RESOURCE = "https://api.openai.com/v1";
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const SCOPES = ["openid", "profile", "email", "offline_access", "resource.invoke", PLAN_SCOPE].join(" ");
const APP_NAME = "ArivuVazhi";
const ATTEMPT_TTL_MS = 10 * 60_000;
const REFRESH_MARGIN_MS = 5 * 60_000;
const UNUSABLE_REFRESH = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "token_expired",
  "refresh_token_expired",
  "refresh_token_invalidated",
  "refresh_token_reused",
]);

interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  idToken: string;
  expiresAt: number;
  earliestRefreshAt: number | null;
  scopes: string[];
  subject: string;
  email: string | null;
}

interface PendingAttempt {
  verifier: string;
  nonce: string;
  redirectUri: string;
  savedClientId: string | null;
  createdAt: number;
}

const pending = new Map<string, PendingAttempt>();

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
  jwks_uri: string;
}

let discoveryCache: Discovery | null = null;
let jwksCache: { keys: Array<crypto.JsonWebKey & { kid?: string; alg?: string }> } | null = null;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenAI sign-in is unavailable (${res.status})`);
  return (await res.json()) as T;
}

async function discovery(): Promise<Discovery> {
  discoveryCache ??= await getJson<Discovery>(DISCOVERY_URL);
  return discoveryCache;
}

async function signingKey(kid: string | undefined) {
  const find = () => jwksCache?.keys.find((k) => !kid || k.kid === kid);
  if (!find()) jwksCache = await getJson((await discovery()).jwks_uri);
  const jwk = find();
  if (!jwk) throw new Error("OpenAI signing key not found");
  return { key: crypto.createPublicKey({ key: jwk, format: "jwk" }), alg: jwk.alg };
}

async function verifyIdToken(idToken: string, clientId: string, nonce: string | null) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded.payload === "string") throw new Error("OpenAI returned an invalid ID token");
  const { key, alg } = await signingKey(decoded.header.kid);
  const payload = jwt.verify(idToken, key, {
    algorithms: [(alg ?? decoded.header.alg) as jwt.Algorithm],
    issuer: ISSUER,
    audience: clientId,
  }) as jwt.JwtPayload & { email?: string; nonce?: string };
  if (nonce !== null && payload.nonce !== nonce) throw new Error("ID token nonce mismatch");
  if (!payload.sub) throw new Error("ID token has no subject");
  return { subject: payload.sub, email: payload.email ?? null };
}

const base64url = (buf: Buffer) => buf.toString("base64url");

function toTime(value: unknown): number | null {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string" && value) {
    const n = Number(value);
    return Number.isFinite(n) ? toTime(n) : Date.parse(value) || null;
  }
  return null;
}

async function getDoc() {
  return AppConfig.findOne({ id: "app" }).select("+chatgptEncryptedTokens");
}

async function ensureHostId(): Promise<string> {
  const doc = await getDoc();
  if (doc?.chatgptHostId) return doc.chatgptHostId;
  const hostId = `urn:uuid:${crypto.randomUUID()}`;
  await AppConfig.updateOne({ id: "app" }, { $set: { chatgptHostId: hostId } }, { upsert: true });
  return hostId;
}

export function callbackRedirectUri(): string {
  // OpenAI only accepts a 127.0.0.1 loopback callback on /auth/callback; the port may vary.
  return `http://127.0.0.1:${config.port}/auth/callback`;
}

/** Starts a browser sign-in and returns the OpenAI authorization URL to open. */
export async function startChatGptSignIn(): Promise<{ url: string }> {
  const [hostId, doc, endpoints] = await Promise.all([ensureHostId(), getDoc(), discovery()]);
  for (const [state, attempt] of pending) if (Date.now() - attempt.createdAt > ATTEMPT_TTL_MS) pending.delete(state);

  const state = base64url(crypto.randomBytes(24));
  const nonce = base64url(crypto.randomBytes(24));
  const verifier = base64url(crypto.randomBytes(48));
  const savedClientId = doc?.chatgptOauthClientId || null;
  const redirectUri = callbackRedirectUri();
  pending.set(state, { verifier, nonce, redirectUri, savedClientId, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: savedClientId ?? "dynamic_agent_client",
    ext_agent_host_id: hostId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: base64url(crypto.createHash("sha256").update(verifier).digest()),
  });
  if (!savedClientId) params.set("agent_name_hint", APP_NAME);
  if (savedClientId && doc?.chatgptAccount) params.set("login_hint", doc.chatgptAccount);
  if (savedClientId && doc?.chatgptScopes?.length && !doc.chatgptScopes.includes(PLAN_SCOPE)) params.set("prompt", "consent");
  return { url: `${endpoints.authorization_endpoint}?${params}` };
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch((await discovery()).token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

function storedFromTokenResponse(
  data: Record<string, unknown>,
  identity: { subject: string; email: string | null },
  previous?: StoredTokens,
): StoredTokens {
  const scope = typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : (previous?.scopes ?? []);
  return {
    accessToken: String(data.access_token),
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : (previous?.refreshToken ?? null),
    idToken: typeof data.id_token === "string" ? data.id_token : (previous?.idToken ?? ""),
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    earliestRefreshAt: toTime(data.earliest_refresh_at),
    scopes: scope,
    subject: identity.subject,
    email: identity.email,
  };
}

export type ChatGptCallbackResult =
  | { ok: true; email: string | null; planEnabled: boolean }
  | { ok: false; message: string };

/** Completes the browser sign-in at the loopback callback. */
export async function completeChatGptSignIn(query: Record<string, unknown>): Promise<ChatGptCallbackResult> {
  const state = typeof query.state === "string" ? query.state : "";
  const attempt = pending.get(state);
  if (!attempt) return { ok: false, message: "This sign-in link expired or was already used. Start again from AI / ChatGPT." };
  pending.delete(state);
  if (Date.now() - attempt.createdAt > ATTEMPT_TTL_MS) {
    return { ok: false, message: "The sign-in took too long. Start again from AI / ChatGPT." };
  }

  if (typeof query.error === "string") {
    const message =
      query.error === "access_denied"
        ? "You declined access in ChatGPT, so nothing was connected."
        : `ChatGPT sign-in failed: ${typeof query.error_description === "string" ? query.error_description : query.error}`;
    await AppConfig.updateOne(
      { id: "app" },
      { $set: { chatgptStatus: "error", chatgptLastError: message, chatgptLastCheckedAt: new Date() } },
    );
    return { ok: false, message };
  }

  const code = typeof query.code === "string" ? query.code : "";
  const callbackClientId = typeof query.client_id === "string" ? query.client_id : null;
  if (attempt.savedClientId && callbackClientId && callbackClientId !== attempt.savedClientId) {
    return { ok: false, message: "OpenAI returned a different app registration than expected. Nothing was changed." };
  }
  const clientId = attempt.savedClientId ?? callbackClientId;
  if (!code || !clientId || clientId === "dynamic_agent_client") {
    return { ok: false, message: "OpenAI did not complete the registration. Please try again." };
  }

  await AppConfig.updateOne({ id: "app" }, { $set: { chatgptOauthClientId: clientId } });

  const exchange = await tokenRequest({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    code_verifier: attempt.verifier,
    redirect_uri: attempt.redirectUri,
    resource: RESOURCE,
  });
  if (!exchange.ok || typeof exchange.data.access_token !== "string" || typeof exchange.data.id_token !== "string") {
    console.warn(`ChatGPT code exchange failed (${exchange.status}): ${String(exchange.data.error ?? "unknown")}`);
    return { ok: false, message: "OpenAI rejected the sign-in code. Please try again." };
  }

  const identity = await verifyIdToken(exchange.data.id_token, clientId, attempt.nonce);
  const tokens = storedFromTokenResponse(exchange.data, identity);
  const planEnabled = tokens.scopes.includes(PLAN_SCOPE);
  const now = new Date();
  await AppConfig.updateOne(
    { id: "app" },
    {
      $set: {
        chatgptEncryptedTokens: encryptSecret(JSON.stringify(tokens)),
        chatgptAccount: identity.email || "",
        chatgptScopes: tokens.scopes,
        chatgptStatus: planEnabled ? "connected" : "error",
        chatgptLastError: planEnabled
          ? ""
          : "Signed in, but ChatGPT plan usage was not allowed. Continue with ChatGPT again and allow ArivuVazhi to use your plan.",
        chatgptConnectedAt: now,
        chatgptLastCheckedAt: now,
        ...(planEnabled ? { aiProvider: "chatgpt", chatgptEnabled: true } : {}),
      },
    },
  );
  if (planEnabled) {
    try {
      await refreshChatGptPlanModels();
    } catch (error) {
      console.warn(`ChatGPT model list after sign-in failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  return { ok: true, email: identity.email, planEnabled };
}

async function readTokens(): Promise<{ tokens: StoredTokens; clientId: string } | null> {
  const doc = await getDoc();
  if (!doc?.chatgptEncryptedTokens || !doc.chatgptOauthClientId) return null;
  return { tokens: JSON.parse(decryptSecret(doc.chatgptEncryptedTokens)) as StoredTokens, clientId: doc.chatgptOauthClientId };
}

async function signedOut(message: string): Promise<never> {
  await AppConfig.updateOne(
    { id: "app" },
    {
      $set: {
        chatgptEncryptedTokens: "",
        chatgptStatus: "error",
        chatgptLastError: message,
        chatgptLastCheckedAt: new Date(),
        chatgptEnabled: false,
        aiProvider: "local",
      },
    },
  );
  throw new Error(message);
}

let refreshing: Promise<string> | null = null;

async function refresh(current: StoredTokens, clientId: string): Promise<string> {
  if (!current.refreshToken) return signedOut("Your ChatGPT sign-in expired. Continue with ChatGPT again under AI / ChatGPT.");
  const res = await tokenRequest({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: current.refreshToken,
    resource: RESOURCE,
  });
  if (!res.ok || typeof res.data.access_token !== "string") {
    const code = String(res.data.error ?? res.data.code ?? "");
    if (UNUSABLE_REFRESH.has(code) || code === "invalid_client") {
      return signedOut("Your ChatGPT sign-in is no longer valid. Continue with ChatGPT again under AI / ChatGPT.");
    }
    throw new Error(`Could not renew the ChatGPT sign-in (${res.status})`);
  }
  const identity =
    typeof res.data.id_token === "string"
      ? await verifyIdToken(res.data.id_token, clientId, null)
      : { subject: current.subject, email: current.email };
  if (identity.subject !== current.subject) {
    return signedOut("OpenAI returned a different ChatGPT account. Continue with ChatGPT again.");
  }
  const next = storedFromTokenResponse(res.data, identity, current);
  await AppConfig.updateOne(
    { id: "app" },
    { $set: { chatgptEncryptedTokens: encryptSecret(JSON.stringify(next)), chatgptScopes: next.scopes } },
  );
  return next.accessToken;
}

/** Returns a usable access token, renewing it shortly before expiry. */
export async function getChatGptAccessToken(): Promise<string> {
  const record = await readTokens();
  if (!record) throw new Error("ChatGPT is not connected. Use Continue with ChatGPT under AI / ChatGPT.");
  const { tokens, clientId } = record;
  if (!tokens.scopes.includes(PLAN_SCOPE)) {
    throw new Error("ArivuVazhi is not allowed to use your ChatGPT plan. Continue with ChatGPT again and allow plan usage.");
  }
  const now = Date.now();
  const expiringSoon = tokens.expiresAt - now < REFRESH_MARGIN_MS;
  const refreshAllowed = !tokens.earliestRefreshAt || tokens.earliestRefreshAt <= now || tokens.expiresAt <= now;
  if (!expiringSoon || !refreshAllowed) return tokens.accessToken;
  refreshing ??= refresh(tokens, clientId).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function getChatGptStatus() {
  const doc = await getDoc();
  const scopes = doc?.chatgptScopes || [];
  const hasTokens = Boolean(doc?.chatgptEncryptedTokens);
  const planEnabled = scopes.includes(PLAN_SCOPE);
  return {
    connected: hasTokens && doc?.chatgptStatus === "connected" && planEnabled,
    signedIn: hasTokens,
    planEnabled,
    account: doc?.chatgptAccount || "",
    status: doc?.chatgptStatus || "not_configured",
    lastError: doc?.chatgptLastError || "",
    scopes,
    models: doc?.chatgptModels || [],
    enabledModels:
      Array.isArray(doc?.chatgptEnabledModels) && doc.chatgptEnabledModels.length
        ? doc.chatgptEnabledModels.filter((name) => (doc.chatgptModels || []).includes(name))
        : doc?.chatgptModels || [],
    lastCheckedAt: doc?.chatgptLastCheckedAt || null,
  };
}

type UsageWindow = {
  label: string;
  usedPercent: number | null;
  resetAt: number | null;
  resetAfterSeconds: number | null;
  windowSeconds: number | null;
};

export type ChatGptPlanUsage = {
  available: boolean;
  source: "openai" | "none";
  planType: string | null;
  allowed: boolean | null;
  limitReached: boolean | null;
  windows: UsageWindow[];
  message: string;
  usageUrl: string;
};

function windowLabel(seconds: number | null | undefined) {
  if (!seconds) return "Usage window";
  if (seconds <= 5 * 60 * 60 + 60) return "5-hour limit";
  if (seconds <= 24 * 60 * 60 + 60) return "Daily limit";
  if (seconds <= 7 * 24 * 60 * 60 + 60) return "Weekly limit";
  return `${Math.round(seconds / 3600)}-hour limit`;
}

function mapWindow(raw: Record<string, unknown> | null | undefined, fallbackLabel: string): UsageWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const windowSeconds = typeof raw.limit_window_seconds === "number" ? raw.limit_window_seconds : null;
  return {
    label: windowLabel(windowSeconds) || fallbackLabel,
    usedPercent: typeof raw.used_percent === "number" ? raw.used_percent : null,
    resetAt: typeof raw.reset_at === "number" ? raw.reset_at : null,
    resetAfterSeconds: typeof raw.reset_after_seconds === "number" ? raw.reset_after_seconds : null,
    windowSeconds,
  };
}

function tanglishPlanMessage(kind: "need_connect" | "blocked" | "loaded" | "empty" | "error", detail?: string) {
  if (kind === "need_connect") return "First ChatGPT connect pannunga — appo dhaan plan limit load aagum.";
  if (kind === "blocked") {
    return "Ippa OpenAI indha login-ku plan % share pannala. Connection check model verify pannum; exact remaining chatgpt.com/settings/usage-la paathukonga.";
  }
  if (kind === "loaded") return "ChatGPT plan usage load aayiduchu.";
  if (kind === "empty") return "Plan connect aagiduchu, but usage window empty-ya vandhuchu.";
  return detail || "Plan usage load aagala.";
}

function accountIdFromIdToken(idToken: string): string | null {
  const payload = jwt.decode(idToken) as Record<string, unknown> | null;
  if (!payload) return null;
  const auth = payload["https://api.openai.com/auth"];
  if (auth && typeof auth === "object") {
    const obj = auth as Record<string, unknown>;
    for (const key of ["chatgpt_account_id", "account_id", "chatgpt_user_id"]) {
      if (typeof obj[key] === "string" && obj[key]) return obj[key] as string;
    }
  }
  if (typeof payload.chatgpt_account_id === "string") return payload.chatgpt_account_id;
  if (typeof payload.account_id === "string") return payload.account_id;
  return null;
}

/** Best-effort ChatGPT plan usage. Official SIWC tokens often cannot read this; we still try. */
export async function getChatGptPlanUsage(): Promise<ChatGptPlanUsage> {
  const usageUrl = "https://chatgpt.com/settings/usage";
  const unavailable = (message: string): ChatGptPlanUsage => ({
    available: false,
    source: "none",
    planType: null,
    allowed: null,
    limitReached: null,
    windows: [],
    message,
    usageUrl,
  });

  try {
    const record = await readTokens();
    if (!record) return unavailable(tanglishPlanMessage("need_connect"));
    const token = await getChatGptAccessToken();
    const accountId = accountIdFromIdToken(record.tokens.idToken);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (accountId) headers["ChatGPT-Account-Id"] = accountId;

    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) return unavailable(tanglishPlanMessage("blocked"));

    const rate = (payload.rate_limit || {}) as Record<string, unknown>;
    const windows = [
      mapWindow(rate.primary_window as Record<string, unknown> | undefined, "Primary limit"),
      mapWindow(rate.secondary_window as Record<string, unknown> | undefined, "Secondary limit"),
    ].filter((item): item is UsageWindow => Boolean(item));

    return {
      available: windows.some((window) => window.usedPercent !== null) || typeof payload.plan_type === "string",
      source: "openai",
      planType: typeof payload.plan_type === "string" ? payload.plan_type : null,
      allowed: typeof rate.allowed === "boolean" ? rate.allowed : null,
      limitReached: typeof rate.limit_reached === "boolean" ? rate.limit_reached : null,
      windows,
      message: windows.length ? tanglishPlanMessage("loaded") : tanglishPlanMessage("empty"),
      usageUrl,
    };
  } catch (error) {
    return unavailable(tanglishPlanMessage("error", error instanceof Error ? error.message : undefined));
  }
}

const NON_CHAT = /embed|whisper|tts|transcribe|dall-e|image|moderation|audio|realtime|guard|aqa|imagen|veo|search|computer-use/i;
const CHAT_MODEL = /^(gpt-|o[0-9]|chatgpt-)/i;
/** Prefer small/fast ChatGPT-plan models first; dated snapshots sort after base names. */
const PREFERRED_MODELS = [
  "gpt-5-mini",
  "gpt-4.1-mini",
  "gpt-4o-mini",
  "gpt-5",
  "gpt-4.1",
  "gpt-4o",
  "o4-mini",
  "o3-mini",
];

function openAiErrorMessage(payload: Record<string, unknown>, status: number) {
  const error = payload.error as { message?: string; code?: string; detail?: string } | string | undefined;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const parts = [error.message, error.detail, error.code].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  if (typeof payload.detail === "string" && payload.detail.trim()) return payload.detail;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  return `ChatGPT returned ${status}`;
}

function baseModelId(id: string) {
  return id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

function pickPreferredModel(models: string[], current: string) {
  if (current && models.includes(current)) return current;
  const bases = new Map(models.map((id) => [baseModelId(id), id]));
  for (const preferred of PREFERRED_MODELS) {
    if (models.includes(preferred)) return preferred;
    if (bases.has(preferred)) return bases.get(preferred)!;
  }
  const mini = models.find((id) => /mini|nano/i.test(id));
  return mini || models[0] || current || "gpt-5-mini";
}

/** Lists chat models available on the signed-in ChatGPT plan. */
export async function listChatGptPlanModels(): Promise<string[]> {
  const token = await getChatGptAccessToken();
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    models?: Array<{ slug?: string; id?: string; visibility?: string }>;
    data?: Array<{ id: string }>;
  };
  if (!response.ok) throw new Error(openAiErrorMessage(payload, response.status));
  const list = payload.models ?? payload.data ?? [];
  const models = [
    ...new Set(
      list
        .filter((item) => !("visibility" in item) || item.visibility === undefined || item.visibility === "list")
        .map((item) => ("slug" in item && item.slug ? item.slug : item.id) || "")
        .filter((id) => id && CHAT_MODEL.test(id) && !NON_CHAT.test(id)),
    ),
  ];
  // Drop dated snapshots when the base id is also listed (e.g. keep gpt-5-mini over gpt-5-mini-2025-08-07).
  return models
    .filter((id) => {
      const base = baseModelId(id);
      return id === base || !models.includes(base);
    })
    .sort((a, b) => a.localeCompare(b));
}

async function persistPlanModels(models: string[]) {
  const settings = await AppConfig.findOne({ id: "app" }).lean();
  const current = settings?.openaiModel || config.openaiModel || "";
  const previousEnabled = settings?.chatgptEnabledModels || [];
  const enabledModels = previousEnabled.length
    ? [...models.filter((name) => previousEnabled.includes(name)), ...models.filter((name) => !previousEnabled.includes(name))]
    : [...models];
  const preferred = pickPreferredModel(enabledModels.length ? enabledModels : models, current);
  await AppConfig.updateOne(
    { id: "app" },
    {
      $set: {
        chatgptModels: models,
        chatgptEnabledModels: enabledModels,
        openaiModel: preferred,
        chatgptLastCheckedAt: new Date(),
      },
    },
  );
  return preferred;
}

export async function refreshChatGptPlanModels() {
  const models = await listChatGptPlanModels();
  const preferred = await persistPlanModels(models);
  return { models, preferred };
}

type ChatGptResponseInput =
  | string
  | Array<{
      role: "user" | "assistant" | "developer";
      content:
        | string
        | Array<{ type: string; text?: string; image_url?: string }>;
    }>;

export type ChatGptCompletion = {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
};

/** ChatGPT plan Responses API requires stream:true for several models (e.g. gpt-6-luna). */
export async function completeChatGptResponse(input: {
  token?: string;
  model: string;
  instructions?: string;
  input: ChatGptResponseInput;
}): Promise<ChatGptCompletion> {
  const token = input.token || (await getChatGptAccessToken());
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: input.model,
      ...(input.instructions ? { instructions: input.instructions } : {}),
      input: input.input,
      store: false,
      stream: true,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(openAiErrorMessage(payload, response.status));
  }
  if (!response.body) throw new Error("ChatGPT returned an empty stream");

  let text = "";
  let finalModel = input.model;
  let usage: ChatGptCompletion["usage"] = null;
  let failed: string | null = null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleEvent = (raw: string) => {
    const dataLines = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");
    if (!dataLines.length) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = String(event.type || "");
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
      text += event.delta;
      return;
    }
    if (type === "response.failed" || type === "error") {
      const error = (event.error || event) as { message?: string; code?: string };
      failed = error.message || error.code || "ChatGPT stream failed";
      return;
    }
    if (type === "response.completed" || type === "response.incomplete") {
      const final = (event.response || {}) as {
        model?: string;
        output_text?: string;
        output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
        error?: { message?: string; code?: string };
      };
      if (final.model) finalModel = final.model;
      if (!text.trim()) {
        text =
          final.output_text ||
          (final.output || [])
            .filter((item) => item.type === "message")
            .flatMap((item) => item.content || [])
            .filter((part) => part.type === "output_text")
            .map((part) => part.text || "")
            .join("");
      }
      if (final.usage) {
        const inputTokens = final.usage.input_tokens || 0;
        const outputTokens = final.usage.output_tokens || 0;
        usage = {
          inputTokens,
          outputTokens,
          totalTokens: final.usage.total_tokens || inputTokens + outputTokens,
        };
      }
      if (final.error?.message) failed = final.error.message;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) handleEvent(chunk);
    if (done) break;
  }
  if (buffer.trim()) handleEvent(buffer);
  if (failed) throw new Error(failed);
  if (!text.trim()) throw new Error("ChatGPT returned an empty response");
  return { text: text.trim(), model: finalModel, usage };
}

async function probeChatGptModel(token: string, model: string) {
  try {
    const result = await completeChatGptResponse({
      token,
      model,
      instructions: "Reply with the single word OK.",
      input: [{ role: "user", content: "Connection test for ArivuVazhi." }],
    });
    return { ok: true as const, model: result.model || model, usage: result.usage, reply: result.text };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "ChatGPT probe failed" };
  }
}

export async function testChatGptConnection() {
  const token = await getChatGptAccessToken();
  const refreshed = await refreshChatGptPlanModels();
  const candidates = [
    refreshed.preferred,
    ...PREFERRED_MODELS.filter((id) => refreshed.models.includes(id)),
    ...refreshed.models,
  ].filter((id, index, all) => id && all.indexOf(id) === index);

  let lastError = "No ChatGPT chat models were available on this plan.";
  for (const model of candidates.slice(0, 8)) {
    const result = await probeChatGptModel(token, model);
    if (result.ok) {
      await AppConfig.updateOne(
        { id: "app" },
        {
          $set: {
            openaiModel: model,
            chatgptStatus: "connected",
            chatgptLastError: "",
            chatgptLastCheckedAt: new Date(),
            aiProvider: "chatgpt",
          },
        },
      );
      const account = (await getDoc())?.chatgptAccount || "";
      const planUsage = await getChatGptPlanUsage();
      const usageLine = result.usage
        ? ` · probe used ${result.usage.totalTokens} tokens (input ${result.usage.inputTokens} / output ${result.usage.outputTokens})`
        : "";
      const limitLine = planUsage.available && planUsage.windows[0]?.usedPercent != null
        ? ` · plan used ${Math.round(planUsage.windows[0].usedPercent)}%`
        : "";
      return {
        ok: true as const,
        message: `ChatGPT connected${account ? ` (${account})` : ""} · model ${model} works · ${refreshed.models.length} plan models${usageLine}${limitLine}`,
        model,
        account,
        models: refreshed.models,
        usage: result.usage,
        planUsage,
        usageUrl: "https://chatgpt.com/settings/usage",
      };
    }
    lastError = `${model}: ${result.message}`;
    console.warn(`ChatGPT probe failed for ${model}: ${result.message}`);
  }

  await AppConfig.updateOne(
    { id: "app" },
    { $set: { chatgptStatus: "error", chatgptLastError: lastError, chatgptLastCheckedAt: new Date() } },
  );
  return { ok: false as const, message: lastError };
}

/** Revokes the renewable session at OpenAI, then forgets the tokens. */
export async function signOutChatGpt(): Promise<{ revoked: boolean }> {
  const record = await readTokens();
  let revoked = false;
  if (record?.tokens.refreshToken) {
    try {
      const endpoint = (await discovery()).revocation_endpoint;
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            token: record.tokens.refreshToken,
            token_type_hint: "refresh_token",
            client_id: record.clientId,
          }),
        });
        revoked = res.ok;
      }
    } catch (error) {
      console.warn(`ChatGPT token revocation failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  await AppConfig.updateOne(
    { id: "app" },
    {
      $set: {
        chatgptEncryptedTokens: "",
        chatgptAccount: "",
        chatgptScopes: [],
        chatgptModels: [],
        chatgptStatus: "not_configured",
        chatgptLastError: "",
        chatgptConnectedAt: null,
        chatgptLastCheckedAt: new Date(),
        chatgptEnabled: false,
        aiProvider: "local",
      },
    },
  );
  return { revoked };
}
