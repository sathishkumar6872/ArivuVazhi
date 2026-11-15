import { z } from "zod";
import { config } from "../config.js";
import { HttpError, nid } from "../http.js";
import { Exam, PyqCollection, PyqDocument, PyqJob, PyqSource } from "../models.js";
import { completeAiJson } from "../question-ai.js";
import { addDocument, addLinkOnly, subjectCodeOf } from "./documents.js";
import { pyqProvider } from "./extract.js";

const USER_AGENT = "ArivuVazhiBot/1.0 (exam preparation; collects public question papers)";
const MAX_PAGES_PER_SOURCE = Number(process.env.PYQ_MAX_PAGES || 10);
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_PDF_BYTES = 60 * 1024 * 1024;
/** Politeness: at least this long between requests to the same host. */
const HOST_GAP_MS = Number(process.env.PYQ_CRAWL_GAP_MS || 1500);
const TIMEOUT_MS = 20_000;
const fakeAi = () => process.env.AI_FAKE_QUESTIONS === "1" && !config.isProd;

/** context = the table row (or nearby text) around the link: official sites often show the exam name in another column and only a date as link text. */
type Link = { url: string; text: string; pageUrl: string; context: string; inRow?: boolean };

/** Per-host spacing between requests. */
const lastHit = new Map<string, number>();
async function politeFetch(url: string, init: RequestInit = {}) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) || 0) + HOST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastHit.set(host, Date.now());
  return fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": USER_AGENT, ...(init.headers || {}) } });
}

/** robots.txt rules for us (our agent, else "*"). Unreachable robots.txt = allowed. */
async function robotsFor(origin: string) {
  try {
    const res = await politeFetch(`${origin}/robots.txt`);
    if (!res.ok) return () => true;
    const lines = (await res.text()).split(/\r?\n/).map((line) => line.replace(/#.*/, "").trim());
    const groups: Array<{ agents: string[]; disallow: string[]; allow: string[] }> = [];
    let current: (typeof groups)[number] | null = null;
    for (const line of lines) {
      const [rawKey, ...rest] = line.split(":");
      const key = rawKey?.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") {
        if (!current || current.disallow.length || current.allow.length) groups.push((current = { agents: [], disallow: [], allow: [] }));
        current.agents.push(value.toLowerCase());
      } else if (current && key === "disallow" && value) current.disallow.push(value);
      else if (current && key === "allow" && value) current.allow.push(value);
    }
    const mine = groups.find((group) => group.agents.some((agent) => agent !== "*" && "arivuvazhibot".includes(agent))) || groups.find((group) => group.agents.includes("*"));
    if (!mine) return () => true;
    return (url: string) => {
      const path = new URL(url).pathname;
      const allowed = mine.allow.filter((rule) => path.startsWith(rule)).sort((a, b) => b.length - a.length)[0] || "";
      const blocked = mine.disallow.filter((rule) => path.startsWith(rule)).sort((a, b) => b.length - a.length)[0] || "";
      return !blocked || allowed.length >= blocked.length;
    };
  } catch {
    return () => true;
  }
}

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;/g, " ").replace(/\s+/g, " ").trim();

/** Text of the table row holding the link, else the text just around it. */
function contextOf(html: string, at: number) {
  const rowStart = html.lastIndexOf("<tr", at);
  const rowEnd = html.indexOf("</tr>", at);
  const insideRow = rowStart >= 0 && rowEnd > at && rowEnd - rowStart < 6000 && html.lastIndexOf("</tr>", at) < rowStart;
  const text = (insideRow ? plain(html.slice(rowStart, rowEnd)) : plain(html.slice(Math.max(0, at - 300), at + 300))).slice(0, 400);
  return { text, insideRow };
}

/** Links on a page: href + visible text + row context, made absolute. */
export function linksOf(html: string, pageUrl: string): Link[] {
  const out: Link[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1].trim(), pageUrl).toString();
      const text = plain(match[2]).slice(0, 200);
      const around = contextOf(html, match.index || 0);
      if (url.startsWith("http")) out.push({ url, text, pageUrl, context: around.text, inRow: around.insideRow });
    } catch {
      /* bad href */
    }
  }
  return out;
}

const isPdfLink = (url: string) => /\.pdf(\?|$)/i.test(url);

/** Crawl one source (same host, a few pages deep) and collect PDF links. Never logs in or passes CAPTCHAs. */
export async function crawl(
  start: string,
  /** Is this table row about our exam within the year range? */
  wantRow: (text: string) => boolean,
  log: (line: string) => void,
  onPage?: (pages: number, url: string) => Promise<void>,
) {
  const origin = new URL(start).origin;
  const allowed = await robotsFor(origin);
  // Each queued page remembers the table row that linked to it (exam name, dates), which
  // sub-pages such as "tentative key → subject PDFs" do not repeat.
  const queue: Array<{ url: string; parent: string }> = [{ url: start, parent: "" }];
  /** Rows about this exam (in the year range) are visited first, in table order. */
  const priority: Array<{ url: string; parent: string }> = [];
  const seen = new Set<string>();
  const pdfs = new Map<string, Link>();
  let pages = 0;
  while ((priority.length || queue.length) && pages < MAX_PAGES_PER_SOURCE) {
    const { url, parent } = (priority.length ? priority : queue).shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!allowed(url)) {
      log(`robots.txt disallows ${url}`);
      continue;
    }
    let html = "";
    try {
      const res = await politeFetch(url);
      if (!res.ok) {
        log(`${url} → HTTP ${res.status}`);
        continue;
      }
      const type = res.headers.get("content-type") || "";
      if (!type.includes("html")) continue;
      const body = Buffer.from(await res.arrayBuffer());
      html = body.subarray(0, MAX_HTML_BYTES).toString("utf8");
    } catch (error) {
      log(`${url} → ${error instanceof Error ? error.message : "fetch failed"}`);
      continue;
    }
    pages += 1;
    await onPage?.(pages, url);
    for (const found of linksOf(html, url)) {
      const link = parent ? { ...found, context: `${found.context} | from: ${parent}`.slice(0, 600), inRow: true } : found;
      if (isPdfLink(link.url)) {
        if (!pdfs.has(link.url)) pdfs.set(link.url, link);
      } else if (!parent && new URL(link.url).origin === origin && !seen.has(link.url)) {
        // Sub-pages (reached from a row) are leaves: their own links (challenge forms, menus) are not followed.
        // Follow only links that look like question-paper / answer-key listings (by their own text/URL, not the whole row)…
        const hay = `${link.text} ${link.url}`.toLowerCase();
        if (!/question|answer|key|paper|previous/.test(hay) || /press|notification|result|syllabus|challenge/.test(hay)) continue;
        if (found.inRow) {
          // …and, inside a listing table, only rows about this exam in the year range (TNPSC lists 100+ exams per page).
          if (wantRow(link.context)) priority.push({ url: link.url, parent: found.context });
          continue;
        }
        queue.push({ url: link.url, parent: "" });
      }
    }
  }
  return { links: [...pdfs.values()], pages, allowed };
}

/** Lenient: AI sometimes returns "" / null / odd casing; anything unknown becomes a safe default instead of failing the source. */
const oneOf = <T extends string>(values: readonly T[], fallback: T) =>
  z.any().transform((value): T => {
    const text = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    return (values as readonly string[]).includes(text) ? (text as T) : fallback;
  });
const classifySchema = z.object({
  links: z.array(
    z.object({
      index: z.coerce.number().int(),
      relevant: z.any().transform((value) => value === true || value === "true"),
      year: z.any().transform((value) => {
        const year = Number(value);
        return Number.isInteger(year) && year > 1980 && year < 2100 ? year : null;
      }),
      docType: oneOf(["question_paper", "answer_key", "other"] as const, "other"),
      keyVersion: oneOf(["tentative", "final", "revised", ""] as const, ""),
      stage: z.any().transform((value) => String(value ?? "").slice(0, 120)),
      paperName: z.any().transform((value) => String(value ?? "").slice(0, 120)),
      language: oneOf(["en", "ta", "bilingual", ""] as const, ""),
    }),
  ),
});
type Classified = z.infer<typeof classifySchema>["links"][number];

/** Exam name variants for cheap matching ("Group IV" ~ "Group-IV" ~ "Group 4"). */
function examTokens(name: string) {
  const roman: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8" };
  const words = name.toLowerCase().split(/\s+/).filter((word) => !["tnpsc", "upsc", "ssc", "exam", "examination"].includes(word));
  const phrase = words.join(" ");
  const variants = new Set([phrase, phrase.replace(/ /g, "-"), phrase.replace(/ /g, "")]);
  const last = words[words.length - 1];
  if (roman[last]) {
    const digits = [...words.slice(0, -1), roman[last]].join(" ");
    [digits, digits.replace(/ /g, "-"), digits.replace(/ /g, "")].forEach((v) => variants.add(v));
  }
  return [...variants].filter((v) => v.length >= 4);
}

const escapeForRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Before paying for AI, keep only links whose text/URL/row mentions a year in range
 * and names the exam (its name or an official alias such as "CCSE-IV"), as a whole
 * word — so "Group I" never matches "Group IV". When nothing names the exam, send at
 * most `fallbackCap` in-range links so a differently worded site still gets a look.
 */
/** True when a text names the exam (its name or an alias) as a whole word: "Group I" never matches "Group IV". */
export function examMatcher(examName: string, aliases: string[] = []) {
  const tokens = [...new Set([...examTokens(examName), ...aliases.flatMap((alias) => examTokens(alias))])];
  const patterns = tokens.map((token) => new RegExp(`(^|[^a-z0-9])${escapeForRegex(token)}([^a-z0-9]|$)`));
  return (text: string) => {
    const hay = text.toLowerCase().replace(/\s+/g, " ");
    return patterns.some((pattern) => pattern.test(hay));
  };
}

/** A listing row worth opening: it names the exam and mentions a year in the range. */
export function rowWanted(isThisExam: (text: string) => boolean, startYear: number, endYear: number) {
  return (text: string) => isThisExam(text) && [...text.matchAll(/(?:19|20)\d{2}/g)].some((m) => Number(m[0]) >= startYear && Number(m[0]) <= endYear);
}

export function prefilterLinks(links: Link[], exam: { name: string }, startYear: number, endYear: number, aliases: string[] = [], cap = 300, fallbackCap = 60) {
  const tokens = [...new Set([...examTokens(exam.name), ...aliases.flatMap((alias) => examTokens(alias))])];
  const patterns = tokens.map((token) => new RegExp(`(^|[^a-z0-9])${escapeForRegex(token)}([^a-z0-9]|$)`));
  const scored = links
    .map((link) => {
      const hay = `${link.text} ${decodeURIComponent(link.url)} ${link.context}`.toLowerCase().replace(/\s+/g, " ");
      const years = [...hay.matchAll(/(?:19|20)\d{2}/g)].map((m) => Number(m[0]));
      const inRange = years.some((year) => year >= startYear && year <= endYear);
      const named = patterns.some((pattern) => pattern.test(hay));
      return { link, inRange, named };
    })
    .filter((row) => row.inRange);
  const named = scored.filter((row) => row.named);
  // Fallback: only links inside table rows (listings), never menus or footers.
  const kept = named.length ? named.slice(0, cap) : scored.filter((row) => row.link.inRow).slice(0, fallbackCap);
  return { kept: kept.map((row) => row.link), named: named.length };
}

const aliasSchema = z.object({ aliases: z.array(z.string()).max(12) });

/** Other names the exam board uses for this exam (e.g. "Combined Civil Services Examination-IV", "CCSE-IV"). */
async function examAliases(exam: { name: string; code: string; authority: string }, log: (line: string) => void) {
  if (fakeAi()) return [];
  try {
    const { json } = await completeAiJson({
      system: `List the names an exam board uses for this exam on its own website (full official name, short forms, codes), as they appear in question-paper and answer-key listings.
Return ONLY JSON {"aliases":["..."]}. If unsure, return {"aliases":[]}.`,
      user: `Exam: ${exam.name} (${exam.code}) · Authority: ${exam.authority}`,
      feature: "pyq_aliases",
      label: "PYQ exam names",
      provider: await pyqProvider(),
    });
    const aliases = aliasSchema.parse(json).aliases.map((alias) => alias.trim()).filter((alias) => alias.length >= 4);
    log(`Exam also listed as: ${aliases.join("; ") || "(none)"}`);
    return aliases;
  } catch (error) {
    log(`Could not get exam name variants: ${error instanceof Error ? error.message.slice(0, 120) : error}`);
    return [];
  }
}

/** Local verification only: classify from link text/URL with simple rules. */
function fakeClassify(links: Link[], examName: string): Classified[] {
  const name = examName.toLowerCase();
  return links.map((link, index) => {
    const hay = `${link.text} ${link.url} ${/[a-z]{3}/i.test(link.text) ? "" : link.context}`.toLowerCase();
    const year = Number(/(20\d{2}|19\d{2})/.exec(hay)?.[1] || 0) || null;
    const docType = /answer|key/.test(hay) ? "answer_key" : /question|paper/.test(hay) ? "question_paper" : "other";
    return {
      index,
      relevant: hay.includes(name) && docType !== "other",
      year,
      docType,
      keyVersion: docType === "answer_key" ? (/tentative/.test(hay) ? "tentative" : /revised/.test(hay) ? "revised" : "final") : "",
      stage: "",
      paperName: /general studies/.test(hay) ? "General Studies" : "",
      language: /tamil/.test(hay) ? "ta" : /english/.test(hay) ? "en" : "",
    };
  });
}

/** AI decides which links are this exam's question papers / answer keys, and their details. Never invents links. */
async function classify(
  links: Link[],
  exam: { name: string; code: string; authority: string },
  onBatch?: (done: number, total: number) => Promise<void>,
  onBatchError?: (line: string) => void,
) {
  if (!links.length) return [];
  if (fakeAi()) return fakeClassify(links, exam.name);
  const out: Classified[] = [];
  for (let at = 0; at < links.length; at += 60) {
    const batch = links.slice(at, at + 60);
    // One bad AI answer must not fail the whole source: skip that batch and go on.
    try {
    const { json } = await completeAiJson({
      system: `You classify links found on official exam websites. For each link decide if it is a question paper or answer key of the exam "${exam.name}" (${exam.code}, ${exam.authority}).
Use only the link text, URL and context (the table row around the link, plus "from:" = the row of the page that linked here); do not guess beyond them. A subject PDF listed under a tentative-answer-key page usually contains the whole question paper with answers marked: docType question_paper. Official sites often show the exam name in the context and only a date as link text. year = the year the exam was held (from the context or file name), not the publishing date. relevant=false for other exams, notifications, syllabi, results.
year: the exam year if stated, else null. keyVersion for answer keys: tentative, final or revised ("" if unknown). language: en, ta, bilingual or "".
Return ONLY JSON {"links":[{"index":0,"relevant":true,"year":2023,"docType":"question_paper","keyVersion":"","stage":"","paperName":"","language":""}]}`,
      user: JSON.stringify(batch.map((link, index) => ({ index: at + index, text: link.text, url: link.url, context: link.context }))),
      feature: "pyq_discovery",
      label: "PYQ discovery",
      provider: await pyqProvider(),
    });
    out.push(...classifySchema.parse(json).links);
    } catch (error) {
      onBatchError?.(`AI could not check links ${at + 1}–${at + batch.length}: ${error instanceof Error ? error.message.slice(0, 160) : error}`);
      if ((error as { code?: string }).code === "AI_BUDGET" || (error as { code?: string }).code === "AI_UNAVAILABLE") throw error;
    }
    await onBatch?.(Math.min(at + 60, links.length), links.length);
  }
  return out;
}

/** Download a PDF if the site allows it; returns null with a reason otherwise. */
async function download(url: string, allowed: (url: string) => boolean) {
  if (!allowed(url)) return { buffer: null, reason: "robots.txt does not allow downloading this file" };
  try {
    const res = await politeFetch(url);
    if (res.status === 401 || res.status === 403) return { buffer: null, reason: `Site requires sign-in or blocks downloads (HTTP ${res.status})` };
    if (!res.ok) return { buffer: null, reason: `Download failed (HTTP ${res.status})` };
    const length = Number(res.headers.get("content-length") || 0);
    if (length > MAX_PDF_BYTES) return { buffer: null, reason: "File is larger than 60 MB" };
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_PDF_BYTES) return { buffer: null, reason: "File is larger than 60 MB" };
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") return { buffer: null, reason: "Link did not return a PDF (it may need a browser or CAPTCHA)" };
    return { buffer, reason: "" };
  } catch (error) {
    return { buffer: null, reason: error instanceof Error ? error.message : "Download failed" };
  }
}

/**
 * One discovery run for an exam within the admin's year range: read the enabled
 * sources, classify PDF links, download what is allowed (into Drive via addDocument),
 * keep the rest as links for manual download, and report what is still missing.
 */
export async function runDiscovery(examId: string, trigger: "manual" | "schedule", actorId: string) {
  const exam = await Exam.findOne({ id: examId }).lean();
  if (!exam) throw new HttpError(404, "Exam not found", "NOT_FOUND");
  // No settings yet: collect the last five years (this year and the four before), both document types, Tamil and English.
  const year = new Date().getFullYear();
  const settings =
    (await PyqCollection.findOne({ examId }).lean()) ||
    (await PyqCollection.findOneAndUpdate(
      { examId },
      { $setOnInsert: { examId, startYear: year - 4, endYear: year, languages: ["ta", "en", "bilingual"], stages: [], method: "both", docTypes: ["question_paper", "answer_key"], schedule: "off" } },
      { upsert: true, new: true },
    ).lean())!;
  if (settings.method === "manual") throw new HttpError(400, "Collection method is Manual for this exam.", "MANUAL_ONLY");
  await failStaleJobs();
  if (await PyqJob.exists({ examId, status: "running" })) {
    throw new HttpError(409, "A discovery job is already running for this exam.", "JOB_RUNNING");
  }
  const job = await PyqJob.create({ id: nid(), examId, startYear: settings.startYear, endYear: settings.endYear, trigger });
  await PyqCollection.updateOne({ examId }, { $set: { lastRunAt: new Date() } });
  void execute(job.id, exam, settings, actorId).catch((error) => console.warn(`PYQ discovery ${job.id} failed: ${error instanceof Error ? error.message : error}`));
  return job.toObject();
}

async function execute(
  jobId: string,
  exam: { id: string; name: string; code: string; authority: string },
  settings: { startYear: number; endYear: number; languages: string[]; docTypes: string[]; stages: string[] },
  actorId: string,
) {
  const job = (await PyqJob.findOne({ id: jobId }))!;
  const lines: string[] = [];
  const log = (line: string) => lines.push(line.slice(0, 300));
  /** Live progress for the admin: step 1–4 here; step 5 (reading questions) is computed from the job's documents. */
  const progress = async (step: number, label: string, done: number, total: number, current = "") => {
    job.set("progress", { step, label, done, total, current: current.slice(0, 200) });
    job.log = lines.slice(-200);
    await job.save();
  };
  try {
    const sourceFilter = { enabled: true, $or: [{ examIds: exam.id }, { examIds: { $size: 0 } }] };
    let sources = await PyqSource.find(sourceFilter).lean();
    if (!sources.length) {
      // No sources yet: AI names the official site; we verify its question-paper pages ourselves.
      await progress(1, "Finding the official website", 0, 0, `${exam.authority} · ${exam.name}`);
      log("No sources yet - finding the official website automatically.");
      const added = await findOfficialSources(exam, log);
      log(added.length ? `Added ${added.length} official source(s): ${added.join(", ")}` : "No official source found automatically.");
      sources = await PyqSource.find(sourceFilter).lean();
      if (!sources.length) throw new Error("No official source found automatically. Add the exam board question-paper page under Sources.");
    }
    const seenUrls = new Set<string>();
    const aliases = await examAliases(exam, log);
    for (const [sourceIndex, source] of sources.entries()) {
      job.sourcesChecked.push(source.name);
      let found = 0;
      const where = sources.length > 1 ? ` (source ${sourceIndex + 1} of ${sources.length})` : "";
      try {
        await progress(2, `Reading ${source.name}${where}`, 0, 0, source.url);
        const { links: allLinks, pages, allowed } = await crawl(source.url, rowWanted(examMatcher(exam.name, aliases), settings.startYear, settings.endYear), log, (count, url) =>
          progress(2, `Reading ${source.name}${where}`, count, MAX_PAGES_PER_SOURCE, url),
        );
        // The same PDF is often listed on several pages/sources: check each link once per run.
        const fresh = allLinks.filter((link) => !seenUrls.has(link.url));
        fresh.forEach((link) => seenUrls.add(link.url));
        const { kept: links, named } = prefilterLinks(fresh, exam, settings.startYear, settings.endYear, aliases);
        log(`${source.name}: ${pages} pages read, ${allLinks.length} PDF links, ${fresh.length} new, ${links.length} in ${settings.startYear}–${settings.endYear} (${named} name the exam) sent to AI`);
        await progress(3, `AI is checking ${links.length} likely links${where}`, 0, links.length, `${allLinks.length} PDFs on the site · ${exam.name} · ${settings.startYear}–${settings.endYear}`);
        const verdicts = await classify(
          links,
          exam,
          (done, total) => progress(3, `AI is checking ${total} likely links${where}`, done, total, `${exam.name} · ${settings.startYear}–${settings.endYear}`),
          log,
        );
        const wanted = verdicts.filter((verdict) => {
          const link = links[verdict.index];
          if (!link || !verdict.relevant || verdict.docType === "other" || !verdict.year) return false;
          if (verdict.year < settings.startYear || verdict.year > settings.endYear) return false;
          if (!settings.docTypes.includes(verdict.docType)) return false;
          if (verdict.language && verdict.language !== "bilingual" && settings.languages.length && !settings.languages.includes(verdict.language)) return false;
          if (settings.stages.length && verdict.stage && !settings.stages.includes(verdict.stage)) return false;
          return true;
        });
        await progress(3, `AI matched ${wanted.length} of ${links.length} links to ${exam.name}${where}`, links.length, links.length);
        for (const [position, verdict] of wanted.entries()) {
          const link = links[verdict.index];
          if (!verdict.year || verdict.docType === "other") continue;
          await progress(4, `Downloading${where}`, position, wanted.length, `${verdict.year} · ${verdict.docType === "answer_key" ? "answer key" : "question paper"} · ${link.text || link.url}`);
          job.discovered += 1;
          found += 1;
          // Never download the same link twice ("link only" entries are tried again).
          const known = await PyqDocument.findOne({ $or: [{ "source.url": link.url }, { alsoFoundAt: link.url }] }).select("id status").lean();
          if (known && known.status !== "link_only") {
            job.skipped += 1;
            continue;
          }
          // The printed subject code (from the link's own row, not the parent row) matches keys to papers.
          const subjectCode = subjectCodeOf(`${link.text} ${link.context.split(" | from:")[0]}`);
          const info = { examId: exam.id, year: verdict.year, stage: verdict.stage, paperName: verdict.paperName, language: verdict.language, docType: verdict.docType, keyVersion: verdict.keyVersion, subjectCode };
          const got = await download(link.url, allowed);
          if (!got.buffer) {
            await addLinkOnly({ ...info, url: link.url, pageUrl: link.pageUrl, sourceName: source.name, sourceId: source.id, reason: got.reason });
            log(`Link only (${got.reason}): ${link.url}`);
            job.skipped += 1;
            continue;
          }
          job.downloaded += 1;
          if (known) await PyqDocument.deleteOne({ id: known.id, status: "link_only" });
          try {
            const added = await addDocument({
              ...info,
              buffer: got.buffer,
              fileName: decodeURIComponent(new URL(link.url).pathname.split("/").pop() || "document.pdf"),
              mimeType: "application/pdf",
              source: { kind: "discovered", name: source.name, url: link.url, sourceId: source.id, pageUrl: link.pageUrl },
              actorId,
            });
            job.documentIds.push(added.id);
            job.uploaded += 1;
          } catch (error) {
            if ((error as { code?: string }).code === "DUPLICATE_DOCUMENT") {
              // Same file already known: remember this link so it is not downloaded again.
              const documentId = (error as { documentId?: string }).documentId;
              if (documentId) await PyqDocument.updateOne({ id: documentId }, { $addToSet: { alsoFoundAt: link.url } });
              job.skipped += 1;
            }
            else {
              job.failed += 1;
              log(`Import failed for ${link.url}: ${error instanceof Error ? error.message : error}`);
            }
          }
        }
        await PyqSource.updateOne({ id: source.id }, { $set: { lastCheckedAt: new Date(), lastError: "", reliability: pages ? "ok" : "degraded", ...(found ? { lastSuccessAt: new Date() } : {}) } });
      } catch (error) {
        job.failed += 1;
        const message = error instanceof Error ? error.message : "Source failed";
        log(`${source.name}: ${message}`);
        await PyqSource.updateOne({ id: source.id }, { $set: { lastCheckedAt: new Date(), lastError: message.slice(0, 300), reliability: "failing" } });
      }
      job.log = lines.slice(-200);
      await job.save();
    }
    job.set("missing", await missingDocuments(exam.id, settings));
    job.set("progress", { step: 5, label: "Downloads finished", done: 1, total: 1, current: "" });
    job.status = "done";
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message.slice(0, 300) : "Discovery failed";
  }
  job.finishedAt = new Date();
  job.log = lines.slice(-200);
  await job.save();
  return job;
}

const OFFICIAL_HOST = /(\.gov\.in|\.nic\.in|\.gov)$/i;
const sitesSchema = z.object({ sites: z.array(z.object({ url: z.string(), name: z.string().optional().default("") })).max(5) });

/** AI names the official website(s) of the exam board. Only a suggestion: every URL is checked below. */
async function candidateSites(exam: { name: string; code: string; authority: string }) {
  if (fakeAi()) {
    const site = process.env.PYQ_FAKE_OFFICIAL_SITE;
    return site ? [{ url: site, name: `${exam.authority} (test)` }] : [];
  }
  const { json } = await completeAiJson({
    system: `You know the official websites of Indian exam boards. Return ONLY JSON {"sites":[{"url":"https://...","name":"..."}]} with the official homepage(s) of the body that conducts this exam.
Only real official government websites. If you are not sure, return {"sites":[]}. Never invent a URL.`,
    user: `Exam: ${exam.name} (${exam.code}) · Authority: ${exam.authority}`,
    feature: "pyq_find_sources",
    label: "PYQ source finding",
    provider: await pyqProvider(),
  });
  return sitesSchema.parse(json).sites;
}

/**
 * Find official question-paper / answer-key pages without admin input: take the AI's
 * suggested official site, require an official government domain, open its homepage,
 * follow links that look like question papers / answer keys, and keep only pages that
 * really list PDFs. Returns the names of the sources added.
 */
export async function findOfficialSources(exam: { id: string; name: string; code: string; authority: string }, log: (line: string) => void) {
  const added: string[] = [];
  for (const site of await candidateSites(exam)) {
    let home: URL;
    try {
      home = new URL(site.url);
    } catch {
      log(`Skipped "${site.url}": not a valid URL`);
      continue;
    }
    if (!fakeAi() && (home.protocol !== "https:" || !OFFICIAL_HOST.test(home.hostname))) {
      log(`Skipped ${home.hostname}: not an official government domain`);
      continue;
    }
    const allowed = await robotsFor(home.origin);
    let html = "";
    try {
      const res = await politeFetch(home.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = Buffer.from(await res.arrayBuffer()).subarray(0, MAX_HTML_BYTES).toString("utf8");
    } catch (error) {
      log(`Could not open ${home.toString()}: ${error instanceof Error ? error.message : error}`);
      continue;
    }
    const candidates = new Map<string, string>();
    for (const link of linksOf(html, home.toString())) {
      if (isPdfLink(link.url) || new URL(link.url).origin !== home.origin) continue;
      // Listing pages have short menu-like link text; long headlines are press releases/notices.
      const looksLikeListing = link.text.length <= 80 && !/press|notification|news|circular/i.test(`${link.text} ${link.url}`);
      if (looksLikeListing && /question|answer\s*key|previous|pyq|old paper/i.test(`${link.text} ${link.url}`) && !candidates.has(link.url)) candidates.set(link.url, link.text);
    }
    for (const [url, text] of [...candidates].slice(0, 12)) {
      if (!allowed(url)) continue;
      try {
        const res = await politeFetch(url);
        if (!res.ok || !(res.headers.get("content-type") || "").includes("html")) continue;
        const page = Buffer.from(await res.arrayBuffer()).subarray(0, MAX_HTML_BYTES).toString("utf8");
        const pdfCount = linksOf(page, url).filter((link) => isPdfLink(link.url)).length;
        if (pdfCount < 3) continue;
        const name = `${site.name || exam.authority} · ${text || "Question papers"}`.slice(0, 120);
        const existing = await PyqSource.findOne({ url }).lean();
        if (existing) await PyqSource.updateOne({ id: existing.id }, { $addToSet: { examIds: exam.id } });
        else await PyqSource.create({ id: nid(), name, url, type: "official", examIds: [exam.id], enabled: true, autoAdded: true });
        added.push(name);
        log(`Found ${pdfCount} PDFs on ${url}`);
      } catch (error) {
        log(`Could not read ${url}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  return added;
}

/** A running job that has not reported progress for this long is assumed dead. */
const STALE_JOB_MS = 10 * 60 * 1000;

/**
 * Jobs left "running" by a server restart or crash: mark them failed so the admin
 * sees what happened and can run discovery again. `all` = at boot (nothing is running yet).
 */
export async function failStaleJobs(all = false) {
  const filter = all ? { status: "running" } : { status: "running", updatedAt: { $lt: new Date(Date.now() - STALE_JOB_MS) } };
  const result = await PyqJob.updateMany(filter, { $set: { status: "failed", error: "Stopped: the server restarted or the job stalled. Run discovery again.", finishedAt: new Date() } });
  if (all) {
    await PyqDocument.updateMany({ status: { $in: ["processing", "uploaded"] } }, { $set: { status: "failed", "processing.error": "Stopped: the server restarted. Use Retry processing.", "processing.finishedAt": new Date() } });
  }
  return result.modifiedCount || 0;
}

/** Years in range with no question paper / answer key yet (any source). */
export async function missingDocuments(examId: string, settings: { startYear: number; endYear: number; docTypes: string[] }) {
  const docs = await PyqDocument.find({ examId, year: { $gte: settings.startYear, $lte: settings.endYear }, status: { $ne: "rejected" } }).select("year docType status").lean();
  const have = new Set(docs.filter((doc) => doc.status !== "link_only").map((doc) => `${doc.year}:${doc.docType}`));
  const missing: Array<{ year: number; docType: string }> = [];
  for (let year = settings.startYear; year <= settings.endYear; year += 1) {
    for (const docType of settings.docTypes) if (!have.has(`${year}:${docType}`)) missing.push({ year, docType });
  }
  return missing;
}

/** Weekly automatic discovery for exams that asked for it (called from the 02:00 job). */
export async function runScheduledDiscovery() {
  const due = await PyqCollection.find({ schedule: "weekly", method: { $ne: "manual" }, $or: [{ lastRunAt: null }, { lastRunAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }] }).lean();
  let started = 0;
  for (const settings of due) {
    try {
      await runDiscovery(settings.examId, "schedule", "system");
      started += 1;
    } catch (error) {
      console.warn(`Scheduled PYQ discovery for ${settings.examId} skipped: ${error instanceof Error ? error.message : error}`);
    }
  }
  return started;
}
