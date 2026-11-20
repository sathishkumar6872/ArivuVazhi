import { assertAiBudgetAvailable, estimateAiInr } from "./ai-budget.js";
import { completeChatGptResponse, getChatGptStatus } from "./chatgpt-auth.js";
import { completeGemini, getGeminiSettings } from "./gemini-settings.js";
import { nextIstRun } from "./governance.js";
import { dayKey, nid } from "./http.js";
import { AiUsage, CurrentAffair, JobRun } from "./models.js";
import { getOpenAiSettings } from "./openai-settings.js";

/**
 * Daily current affairs for exam students, with no manual step:
 *
 *   03:00 IST  collect  ChatGPT + web search lists yesterday's exam-relevant news with sources
 *   check 1    sources  at least 2 reachable article links on different sites, 1 from a trusted outlet
 *   check 2    second   independent fact check: Gemini + Google Search, or (no Gemini key) a
 *                       different ChatGPT plan model with its own web search
 *   check 3    ChatGPT  fresh re-check with a new web search, without seeing earlier answers
 *   publish    write    short points + one quiz question per item, in English and Tamil, from the
 *                       verified facts only
 *
 * An item is published only when all three checks pass; anything doubtful is dropped.
 * Students can still report an item; two reports hide it.
 */

const JOB = "current_affairs";
const MAX_ITEMS = 8;
const CANDIDATES = 10;
const CHECK_CONCURRENCY = 3;
const LINK_TIMEOUT_MS = 8000;

const CATEGORIES = [
  "tamilnadu",
  "national",
  "international",
  "economy",
  "science",
  "environment",
  "sports",
  "awards",
  "appointments",
] as const;

/** Outlets accepted as a trusted source (at least one link must come from these). */
const TRUSTED = [
  /(^|\.)gov\.in$/,
  /(^|\.)nic\.in$/,
  /(^|\.)pib\.gov\.in$/,
  /(^|\.)thehindu\.com$/,
  /(^|\.)indianexpress\.com$/,
  /(^|\.)ddnews\.gov\.in$/,
  /(^|\.)newsonair\.gov\.in$/,
  /(^|\.)hindustantimes\.com$/,
  /(^|\.)livemint\.com$/,
  /(^|\.)economictimes\.indiatimes\.com$/,
  /(^|\.)timesofindia\.indiatimes\.com$/,
  /(^|\.)ndtv\.com$/,
  /(^|\.)reuters\.com$/,
  /(^|\.)bbc\.(com|co\.uk)$/,
  /(^|\.)apnews\.com$/,
  /(^|\.)un\.org$/,
  /(^|\.)who\.int$/,
  /(^|\.)isro\.gov\.in$/,
  /(^|\.)rbi\.org\.in$/,
  /(^|\.)dtnext\.in$/,
  /(^|\.)dinamani\.com$/,
  /(^|\.)dailythanthi\.com$/,
];

/** Hosts that look like coaching, job or GK-quiz sites rather than news outlets. */
const AGGREGATOR = /(job|naukri|sarkari|currentaffair|current-affair|gktoday|adda247|testbook|jagranjosh|byjus|unacademy|examveda|gkquiz|affairscloud|studyiq|vision|drishti|insightsonindia|wikipedia)/;

type Candidate = {
  title: string;
  category: string;
  points: string[];
  facts: string[];
  sources: Array<{ title: string; url: string }>;
};

type Check = { step: string; passed: boolean; note: string };

// ---------------------------------------------------------------- helpers

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI did not return JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

const str = (value: unknown, max = 600) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const strList = (value: unknown, max = 8, len = 300) =>
  Array.isArray(value) ? value.map((item) => str(item, len)).filter(Boolean).slice(0, max) : [];

function shiftDay(day: string, delta: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

async function logUsage(provider: string, text: string) {
  const tokens = Math.ceil(text.length / 4);
  try {
    await AiUsage.create({ id: nid(), userId: "system", provider, feature: JOB, tokens, estimatedInr: estimateAiInr(tokens, provider) });
  } catch {
    // Usage logging must never break the run.
  }
}

async function chatgpt(system: string, user: string, webSearch: boolean, model?: string): Promise<string> {
  const settings = await getOpenAiSettings();
  const result = await completeChatGptResponse({
    model: model || settings.model || "gpt-5-mini",
    instructions: system,
    input: [{ role: "user", content: user }],
    tools: webSearch ? [{ type: "web_search" }] : undefined,
  });
  await logUsage("chatgpt", system + user + result.text);
  return result.text;
}

async function gemini(system: string, user: string): Promise<string> {
  const text = await completeGemini({ system, user, search: true });
  if (!text) throw new Error("Gemini is not configured (add a Gemini API key in AI settings).");
  await logUsage("gemini", system + user + text);
  return text;
}

/** Run tasks with at most `limit` in flight. */
async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

// ---------------------------------------------------------------- steps

async function collect(newsDay: string, recentTitles: string[]): Promise<Candidate[]> {
  const system =
    "You are a careful current-affairs editor for Tamil Nadu government exam aspirants (TNPSC Group 1, 2, 4; also useful for UPSC). " +
    "Report only facts you found in the search results. Never guess names, numbers or dates. Return ONLY valid JSON.";
  const user = `Use web search. List the ${CANDIDATES} most exam-relevant news events that happened on ${newsDay} (India Standard Time).
Cover Tamil Nadu, India (polity, government schemes, economy, science and technology, defence, environment), international affairs, awards, sports and important appointments.
Skip opinion pieces, crime, celebrity, film and gossip.
${recentTitles.length ? `Already covered on earlier days, do not repeat:\n${recentTitles.map((t) => `- ${t}`).join("\n")}\n` : ""}
For each event give:
- title: one clear line
- category: one of ${CATEGORIES.join(", ")}
- points: 3 short exam-focused points
- facts: 3 to 6 short, checkable facts (names, numbers, dates, places), one per string
- sources: 2 or 3 links to the actual news articles, each on a different website (prefer PIB, government sites, The Hindu, Indian Express, DD News, AIR, Reuters, BBC)
JSON shape: {"items":[{"title":"","category":"","points":[""],"facts":[""],"sources":[{"title":"","url":"https://..."}]}]}`;
  const raw = await chatgpt(system, user, true);
  const parsed = extractJson(raw) as { items?: unknown[] };
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return items
    .map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      const category = str(row.category, 30).toLowerCase();
      return {
        title: str(row.title, 200),
        category: (CATEGORIES as readonly string[]).includes(category) ? category : "national",
        points: strList(row.points, 4),
        facts: strList(row.facts, 6),
        sources: (Array.isArray(row.sources) ? row.sources : [])
          .map((source) => {
            const s = (source || {}) as Record<string, unknown>;
            return { title: str(s.title, 200), url: str(s.url, 500) };
          })
          .filter((source) => /^https?:\/\//i.test(source.url))
          .slice(0, 4),
      };
    })
    .filter((item) => item.title && item.facts.length >= 2);
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** True when the link answers. Bot-blocking codes (401/403/405/429) still prove the page exists; 404/410 do not. */
async function linkAlive(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArivuVazhiFactCheck/1.0)", Accept: "text/html" },
    });
    void res.body?.cancel().catch(() => undefined);
    return res.status < 400 || [401, 403, 405, 429].includes(res.status);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Check 1: at least two live links on different sites, one of them a trusted outlet. */
async function checkSources(item: Candidate): Promise<Check> {
  const alive = (await Promise.all(item.sources.map(async (source) => ((await linkAlive(source.url)) ? source : null)))).filter(
    (source): source is { title: string; url: string } => source !== null,
  );
  // Coaching / job / quiz aggregators copy news and are not counted as sources.
  const usable = alive.filter((source) => !AGGREGATOR.test(hostOf(source.url)));
  const hosts = new Set(usable.map((source) => hostOf(source.url)).filter(Boolean));
  const trusted = [...hosts].some((host) => TRUSTED.some((pattern) => pattern.test(host)));
  item.sources = usable;
  if (hosts.size < 2) return { step: "sources", passed: false, note: `${hosts.size} working link(s) on different sites; need 2` };
  if (!trusted) return { step: "sources", passed: false, note: "no trusted outlet among the links" };
  return { step: "sources", passed: true, note: `${hosts.size} live links (${[...hosts].join(", ")})` };
}

const VERIFY_SYSTEM =
  "You are a strict fact checker. Search the web and verify each fact independently. " +
  "If any fact is wrong, or you cannot confirm it from reliable sources, the verdict is not \"correct\". Return ONLY valid JSON.";

function verifyPrompt(item: Candidate, newsDay: string) {
  return `Check this news item for an exam current-affairs feed. It is said to have happened on ${newsDay} (IST).
Title: ${item.title}
Facts:
${item.facts.map((fact, i) => `${i + 1}. ${fact}`).join("\n")}

Verify: every fact is accurate, and the event really happened on or within one day of ${newsDay}.
JSON shape: {"verdict":"correct"|"incorrect"|"unsure","wrongFacts":[numbers],"note":"one short line"}`;
}

function readVerdict(raw: string, step: string): Check {
  try {
    const parsed = extractJson(raw) as { verdict?: unknown; note?: unknown; wrongFacts?: unknown };
    const verdict = str(parsed.verdict, 20).toLowerCase();
    const wrong = Array.isArray(parsed.wrongFacts) && parsed.wrongFacts.length ? ` · wrong facts: ${parsed.wrongFacts.join(", ")}` : "";
    return { step, passed: verdict === "correct" && !wrong, note: `${verdict || "no verdict"}${wrong}${parsed.note ? ` · ${str(parsed.note, 200)}` : ""}` };
  } catch {
    return { step, passed: false, note: "could not read the checker's answer" };
  }
}

/** Preferred order for the second ChatGPT model when Gemini is not configured. */
const SECOND_MODELS = ["gpt-5", "gpt-5.1", "gpt-4.1", "gpt-4o", "o4-mini", "gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"];

/** A ChatGPT plan model other than the main one, so check 2 is not the same model twice. */
async function secondChatGptModel(): Promise<string | undefined> {
  const [status, settings] = await Promise.all([getChatGptStatus(), getOpenAiSettings()]);
  const main = settings.model;
  const models = status.enabledModels.length ? status.enabledModels : status.models;
  return SECOND_MODELS.find((name) => name !== main && models.includes(name)) || models.find((name) => name !== main);
}

/**
 * Check 2: an independent fact check. Gemini with Google Search when a Gemini key is set;
 * otherwise a different ChatGPT plan model with its own web search.
 */
async function checkIndependently(item: Candidate, newsDay: string): Promise<Check> {
  const useGemini = (await getGeminiSettings()).configured;
  const step = useGemini ? "gemini" : "second-model";
  try {
    const raw = useGemini
      ? await gemini(VERIFY_SYSTEM, verifyPrompt(item, newsDay))
      : await chatgpt(VERIFY_SYSTEM, verifyPrompt(item, newsDay), true, await secondChatGptModel());
    return readVerdict(raw, step);
  } catch (error) {
    return { step, passed: false, note: error instanceof Error ? error.message.slice(0, 200) : "Independent check failed" };
  }
}

/** Check 3: a fresh ChatGPT web search that does not see the earlier answers. */
async function recheckWithChatGpt(item: Candidate, newsDay: string): Promise<Check> {
  try {
    return readVerdict(await chatgpt(VERIFY_SYSTEM, verifyPrompt(item, newsDay), true), "recheck");
  } catch (error) {
    return { step: "recheck", passed: false, note: error instanceof Error ? error.message.slice(0, 200) : "Re-check failed" };
  }
}

type Written = {
  title: string;
  points: string[];
  quiz: { stem: string; options: Array<{ key: string; text: string }>; correctKey: string; explanation: string };
};

function readWritten(value: unknown): Written | null {
  const row = (value || {}) as Record<string, unknown>;
  const quiz = (row.quiz || {}) as Record<string, unknown>;
  const options = (Array.isArray(quiz.options) ? quiz.options : [])
    .map((option, index) => {
      const o = (option || {}) as Record<string, unknown>;
      return { key: str(o.key, 2).toUpperCase() || "ABCD"[index], text: str(o.text, 200) };
    })
    .filter((option) => option.text);
  const correctKey = str(quiz.correctKey, 2).toUpperCase();
  const written = {
    title: str(row.title, 200),
    points: strList(row.points, 4),
    quiz: { stem: str(quiz.stem, 400), options, correctKey, explanation: str(quiz.explanation, 600) },
  };
  const keysOk = options.length === 4 && options.every((option, i) => option.key === "ABCD"[i]) && "ABCD".includes(correctKey) && correctKey;
  return written.title && written.points.length && written.quiz.stem && keysOk ? written : null;
}

/** Final copy in English and Tamil, written strictly from the verified facts. */
async function write(item: Candidate): Promise<{ en: Written; ta: Written } | null> {
  const system =
    "You write exam current-affairs notes for Tamil Nadu government exam students. Use ONLY the verified facts given. " +
    "Do not add any new fact, number, name or date. Return ONLY valid JSON.";
  const user = `Verified facts:
${item.facts.map((fact) => `- ${fact}`).join("\n")}
Title idea: ${item.title}

Write the same content twice: "en" in clear simple English and "ta" in Tamil script (தமிழ்).
Each has: title (one line), points (3 short exam-focused points), quiz (one MCQ testing one of the facts: stem, options A-D, correctKey, one-line explanation).
JSON shape: {"en":{"title":"","points":[""],"quiz":{"stem":"","options":[{"key":"A","text":""},{"key":"B","text":""},{"key":"C","text":""},{"key":"D","text":""}],"correctKey":"A","explanation":""}},"ta":{...same...}}`;
  const parsed = extractJson(await chatgpt(system, user, false)) as { en?: unknown; ta?: unknown };
  const en = readWritten(parsed.en);
  const ta = readWritten(parsed.ta);
  return en && ta ? { en, ta } : null;
}

// ---------------------------------------------------------------- run

let running: Promise<unknown> | null = null;

export type CurrentAffairsStart = { started: boolean; reason?: string; runId?: string };

/** Start today's run for yesterday's news. Skips when that day is already published. */
export async function startCurrentAffairsJob(trigger: "schedule" | "boot" | "manual"): Promise<CurrentAffairsStart> {
  if (running) return { started: false, reason: "already_running" };
  const newsDay = shiftDay(dayKey(), -1);
  if (await CurrentAffair.exists({ newsDay, status: "published" })) return { started: false, reason: "already_published" };
  const run = await JobRun.create({ id: nid(), job: JOB, dayKey: newsDay, trigger });
  running = execute(run, newsDay)
    .catch((error) => console.warn(`Current affairs job failed: ${error instanceof Error ? error.message : error}`))
    .finally(() => {
      running = null;
    });
  return { started: true, runId: run.id };
}

async function execute(run: InstanceType<typeof JobRun>, newsDay: string) {
  try {
    await assertAiBudgetAvailable("Current affairs");
    // Previous attempts for this day that never published are replaced.
    await CurrentAffair.deleteMany({ newsDay, status: { $ne: "published" } });
    const recent = await CurrentAffair.find({ newsDay: { $gte: shiftDay(newsDay, -3), $lt: newsDay }, status: "published" })
      .select("en.title")
      .lean();
    const candidates = await collect(newsDay, recent.map((row) => row.en?.title || "").filter(Boolean));
    if (!candidates.length) throw new Error("No news items were collected.");

    const outcomes = await pool(candidates, CHECK_CONCURRENCY, async (item) => {
      const checks: Check[] = [];
      checks.push(await checkSources(item));
      if (checks[0].passed) checks.push(await checkIndependently(item, newsDay));
      if (checks.every((check) => check.passed)) checks.push(await recheckWithChatGpt(item, newsDay));
      return { item, checks, passed: checks.length === 3 && checks.every((check) => check.passed) };
    });

    let order = 0;
    for (const { item, checks, passed } of outcomes) {
      const base = { id: nid(), newsDay, category: item.category, facts: item.facts, sources: item.sources, checks };
      if (!passed || order >= MAX_ITEMS) {
        run.failed += 1;
        const failedCheck = checks.find((check) => !check.passed);
        await CurrentAffair.create({
          ...base,
          en: { title: item.title, points: item.points },
          status: "rejected",
          rejectReason: failedCheck ? `${failedCheck.step}: ${failedCheck.note}` : "over the daily limit",
        });
        continue;
      }
      let written: Awaited<ReturnType<typeof write>> = null;
      try {
        written = await write(item);
      } catch (error) {
        console.warn(`Current affairs write failed: ${error instanceof Error ? error.message : error}`);
      }
      if (!written) {
        run.failed += 1;
        await CurrentAffair.create({ ...base, en: { title: item.title, points: item.points }, status: "rejected", rejectReason: "write: final notes were incomplete" });
        continue;
      }
      await CurrentAffair.create({ ...base, ...written, status: "published", order: order++ });
      run.ready += 1;
    }
    run.status = "done";
  } catch (error) {
    run.status = "failed";
    run.error = error instanceof Error ? error.message.slice(0, 300) : "unknown";
  }
  run.finishedAt = new Date();
  await run.save();
  console.log(JSON.stringify({ job: JOB, newsDay, status: run.status, published: run.ready, dropped: run.failed, error: run.error || undefined }));
}

/**
 * Dry run for testing: collect yesterday's news and run the checks on the first `limit`
 * items, without saving anything (only AI usage is recorded, for the budget).
 */
export async function previewCurrentAffairs(limit = 3, skipGemini = false) {
  const newsDay = shiftDay(dayKey(), -1);
  const candidates = (await collect(newsDay, [])).slice(0, limit);
  const results = [];
  for (const item of candidates) {
    const checks: Check[] = [await checkSources(item)];
    if (checks[0].passed && !skipGemini) checks.push(await checkIndependently(item, newsDay));
    if (checks.every((check) => check.passed)) checks.push(await recheckWithChatGpt(item, newsDay));
    results.push({ title: item.title, category: item.category, facts: item.facts, sources: item.sources.map((s) => s.url), checks });
  }
  return { newsDay, collected: candidates.length, results };
}

/** Latest run and today's counts, for the admin Today page. */
export async function currentAffairsStatus() {
  const newsDay = shiftDay(dayKey(), -1);
  const [last, counts] = await Promise.all([
    JobRun.findOne({ job: JOB }).sort({ createdAt: -1 }).select("dayKey status error ready failed finishedAt createdAt").lean(),
    CurrentAffair.aggregate<{ _id: string; n: number }>([{ $match: { newsDay } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const byStatus = Object.fromEntries(counts.map((row) => [row._id, row.n]));
  return {
    newsDay,
    published: byStatus.published || 0,
    dropped: byStatus.rejected || 0,
    hidden: byStatus.hidden || 0,
    running: Boolean(running),
    lastRun: last ? { newsDay: last.dayKey, status: last.status, error: last.error || "", finishedAt: last.finishedAt } : null,
  };
}

/**
 * In-process 03:00 IST schedule plus a catch-up on boot. A free-tier host that sleeps
 * must also be woken by an external cron calling POST /api/v1/internal/jobs/current-affairs.
 */
export function startCurrentAffairsScheduler() {
  if (process.env.CURRENT_AFFAIRS_JOB === "off") {
    console.log("Current affairs job disabled (CURRENT_AFFAIRS_JOB=off).");
    return;
  }
  const scheduleNext = () => {
    const next = nextIstRun(new Date(), 3);
    const timer = setTimeout(() => {
      void startCurrentAffairsJob("schedule").catch((error) => console.warn(`Current affairs job failed: ${error?.message || error}`));
      scheduleNext();
    }, next.getTime() - Date.now());
    timer.unref?.();
  };
  scheduleNext();
  const catchUp = setTimeout(() => {
    // After 03:00 IST, publish yesterday's news if it is still missing.
    if (Date.now() >= new Date(`${dayKey()}T03:00:00+05:30`).getTime()) {
      void startCurrentAffairsJob("boot").catch((error) => console.warn(`Current affairs catch-up failed: ${error?.message || error}`));
    }
  }, 60_000);
  catchUp.unref?.();
}
