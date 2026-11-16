import { PyqAnalysis, PyqDocument, Question, Subject, Topic } from "../models.js";

/** A PYQ question as used for pattern analysis. */
export type AnalysisQuestion = {
  id: string;
  year: number;
  paperId: string;
  subjectId: string;
  topicId: string;
  subtopic: string;
  questionType: string;
  difficulty: string;
  stemKey: string;
  stem: string;
  /** Option texts; with the stem they identify a question (stems like "Match the following" alone do not). */
  options?: string[];
};

/** Same question = same stem and same options (order and spacing ignored). */
export function questionKey(q: Pick<AnalysisQuestion, "id" | "stemKey" | "options">) {
  if (!q.stemKey) return q.id;
  const options = (q.options || []).map((text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")).filter(Boolean).sort();
  return `${q.stemKey}|${options.join("|")}`;
}

type Named = { id: string; name: string };

/** Smallest evidence before any trend or change is reported. */
export const MIN_YEARS = 2;
const MIN_QUESTIONS_PER_YEAR = 30;
/** A subject's share must move at least this many percentage points to count as a change. */
const CHANGE_POINTS = 5;

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const countBy = <T,>(rows: T[], key: (row: T) => string) => {
  const out: Record<string, number> = {};
  for (const row of rows) out[key(row)] = (out[key(row)] || 0) + 1;
  return out;
};

/**
 * Pattern analysis of an exam's PYQs. Pure: facts only, computed from the questions given.
 * A question printed in two papers of the same year (e.g. the common General Studies part
 * of the Tamil and English papers) is counted once for that year.
 */
export function analyzePattern(input: { questions: AnalysisQuestion[]; subjects: Named[]; topics: Array<Named & { subjectId: string }> }) {
  const subjectName = new Map(input.subjects.map((row) => [row.id, row.name]));
  const topicRow = new Map(input.topics.map((row) => [row.id, row]));

  // One entry per question per year.
  const perYear = new Map<number, Map<string, AnalysisQuestion>>();
  for (const q of input.questions) {
    const year = perYear.get(q.year) || new Map<string, AnalysisQuestion>();
    perYear.set(q.year, year);
    const key = questionKey(q);
    if (!year.has(key)) year.set(key, q);
  }
  const years = [...perYear.keys()].sort((a, b) => a - b);
  const rows = years.flatMap((year) => [...perYear.get(year)!.values()]);
  const yearSize = Object.fromEntries(years.map((year) => [year, perYear.get(year)!.size]));
  const papers = new Set(input.questions.map((q) => q.paperId)).size;
  const sufficient = years.length >= MIN_YEARS;

  const notes: string[] = [];
  if (!rows.length) notes.push("No processed PYQ questions yet.");
  else if (!sufficient) notes.push(`Only ${years.length} year of papers — trends and changes need at least ${MIN_YEARS} years.`);
  const unmapped = rows.filter((q) => !subjectName.has(q.subjectId)).length;
  if (unmapped) notes.push(`${unmapped} question(s) have no subject yet — map them in the session for a complete analysis.`);

  // Subject distribution, overall and per year.
  const subjects = Object.entries(countBy(rows, (q) => (subjectName.has(q.subjectId) ? q.subjectId : "unmapped")))
    .map(([id, total]) => ({
      id,
      name: subjectName.get(id) || "Not mapped",
      total,
      share: pct(total, rows.length),
      byYear: Object.fromEntries(years.map((year) => [year, [...perYear.get(year)!.values()].filter((q) => (subjectName.has(q.subjectId) ? q.subjectId : "unmapped") === id).length])),
    }))
    .sort((a, b) => b.total - a.total);

  // Topics: how often and in how many years.
  const topicStats = new Map<string, { total: number; years: Set<number> }>();
  for (const q of rows) {
    if (!topicRow.has(q.topicId)) continue;
    const stat = topicStats.get(q.topicId) || { total: 0, years: new Set<number>() };
    stat.total += 1;
    stat.years.add(q.year);
    topicStats.set(q.topicId, stat);
  }
  const topics = [...topicStats.entries()]
    .map(([id, stat]) => ({ id, name: topicRow.get(id)!.name, subject: subjectName.get(topicRow.get(id)!.subjectId) || "", total: stat.total, years: [...stat.years].sort((a, b) => a - b) }))
    .sort((a, b) => b.years.length - a.years.length || b.total - a.total);
  // Frequent: asked in most years (only meaningful with several years).
  const frequentTopics = sufficient ? topics.filter((topic) => topic.years.length >= Math.max(MIN_YEARS, Math.ceil(years.length * 0.6))).slice(0, 15) : [];

  const subtopics = Object.entries(countBy(rows.filter((q) => q.subtopic), (q) => q.subtopic.trim().toLowerCase()))
    .filter(([, total]) => total > 1)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  // Repeated questions: the same question in different years.
  const byStem = new Map<string, { stem: string; years: Set<number> }>();
  for (const q of rows) {
    if (!q.stemKey) continue;
    const key = questionKey(q);
    const entry = byStem.get(key) || { stem: q.stem, years: new Set<number>() };
    entry.years.add(q.year);
    byStem.set(key, entry);
  }
  const repeated = [...byStem.values()]
    .filter((entry) => entry.years.size > 1)
    .map((entry) => ({ stem: entry.stem.slice(0, 200), years: [...entry.years].sort((a, b) => a - b) }))
    .sort((a, b) => b.years.length - a.years.length)
    .slice(0, 30);

  const types = countBy(rows, (q) => q.questionType || "other");
  const difficulty = countBy(rows, (q) => q.difficulty || "medium");

  // Year-over-year changes: only between the two latest years with enough questions, and only clear moves.
  const changes: string[] = [];
  const comparable = years.filter((year) => yearSize[year] >= MIN_QUESTIONS_PER_YEAR);
  if (sufficient && comparable.length >= 2) {
    const [before, after] = comparable.slice(-2);
    for (const subject of subjects) {
      if (subject.id === "unmapped") continue;
      const was = pct(subject.byYear[before] || 0, yearSize[before]);
      const now = pct(subject.byYear[after] || 0, yearSize[after]);
      if (Math.abs(now - was) >= CHANGE_POINTS) changes.push(`${subject.name}: ${was}% in ${before} → ${now}% in ${after} (${now > was ? "+" : ""}${Math.round((now - was) * 10) / 10} points)`);
    }
    const typesBefore = countBy([...perYear.get(before)!.values()], (q) => q.questionType || "other");
    const typesAfter = countBy([...perYear.get(after)!.values()], (q) => q.questionType || "other");
    for (const type of new Set([...Object.keys(typesBefore), ...Object.keys(typesAfter)])) {
      const was = pct(typesBefore[type] || 0, yearSize[before]);
      const now = pct(typesAfter[type] || 0, yearSize[after]);
      if (Math.abs(now - was) >= CHANGE_POINTS) changes.push(`${type.replace(/_/g, " ")} questions: ${was}% in ${before} → ${now}% in ${after}`);
    }
  } else if (sufficient) {
    notes.push(`Changes are shown only between years with at least ${MIN_QUESTIONS_PER_YEAR} questions each.`);
  }

  return { years, yearSize, papers, questions: rows.length, sufficient, notes, subjects, topics: topics.slice(0, 25), frequentTopics, subtopics, repeated, types, difficulty, changes };
}

/** Recompute and store an exam's analysis from its processed PYQ papers (not failed or rejected ones). */
export async function runAnalysis(examId: string) {
  const papers = await PyqDocument.find({ examId, docType: "question_paper", status: { $in: ["processed", "approved"] } }).select("id").lean();
  const [questions, subjects, topics] = await Promise.all([
    Question.find({ examId, source: "pyq", pyqDocumentId: { $in: papers.map((doc) => doc.id) }, status: { $ne: "rejected" } })
      .select("id pyqYear pyqPaperId subjectId topicId subtopic questionType difficulty stemKey stem options")
      .lean(),
    Subject.find({ examId }).select("id name").lean(),
    Topic.find({ examId }).select("id name subjectId").lean(),
  ]);
  const result = analyzePattern({
    questions: questions.map((q) => ({
      id: q.id,
      year: q.pyqYear || 0,
      paperId: q.pyqPaperId || "",
      subjectId: q.subjectId,
      topicId: q.topicId,
      subtopic: q.subtopic || "",
      questionType: q.questionType || "",
      difficulty: q.difficulty || "",
      stemKey: q.stemKey || "",
      stem: q.stem,
      options: (q.options || []).map((option) => option.text || ""),
    })),
    subjects,
    topics,
  });
  const status = !result.questions ? "empty" : result.sufficient ? "ready" : "insufficient";
  return PyqAnalysis.findOneAndUpdate({ examId }, { $set: { examId, status, result, computedAt: new Date() } }, { upsert: true, new: true }).lean();
}

const pending = new Map<string, NodeJS.Timeout>();

/** Recompute shortly after changes (several papers finishing together cause one run). */
export function scheduleAnalysis(examId: string, delayMs = 5000) {
  clearTimeout(pending.get(examId));
  pending.set(
    examId,
    setTimeout(() => {
      pending.delete(examId);
      runAnalysis(examId).catch((error) => console.warn(`PYQ analysis ${examId}: ${error instanceof Error ? error.message : error}`));
    }, delayMs),
  );
}
