/** Pure rules for content governance, kept free of I/O so they are unit-testable. */

export const EXAM_LIFECYCLES = ["draft", "under_review", "published", "revised", "archived", "cancelled"] as const;
export type ExamLifecycle = (typeof EXAM_LIFECYCLES)[number];

/** Draft → Under Review → Published → Revised → Archived/Cancelled (blueprint §5). */
const EXAM_TRANSITIONS: Record<ExamLifecycle, ExamLifecycle[]> = {
  draft: ["under_review", "cancelled"],
  under_review: ["draft", "published", "cancelled"],
  published: ["revised", "archived"],
  revised: ["under_review", "published", "archived"],
  archived: ["revised"],
  cancelled: ["draft"],
};

export function canTransitionExam(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = EXAM_TRANSITIONS[from as ExamLifecycle];
  return Boolean(allowed?.includes(to as ExamLifecycle));
}

export function allowedExamTransitions(from: string): ExamLifecycle[] {
  return EXAM_TRANSITIONS[from as ExamLifecycle] || [];
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalised question stem: case, punctuation and spacing don't make a "new" question. */
export function stemKey(stem: string): string {
  return stem
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 240);
}

/** Next 02:00 Asia/Kolkata (UTC+05:30, no DST) strictly after `now`. */
export function nextIstRun(now: Date, hour = 2): Date {
  const istNow = new Date(now.getTime() + 330 * 60 * 1000);
  const target = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), hour, 0, 0) - 330 * 60 * 1000);
  return target.getTime() > now.getTime() ? target : new Date(target.getTime() + 24 * 60 * 60 * 1000);
}

export function nameKey(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Plan a non-destructive syllabus refresh. Existing rows whose English (or Tamil)
 * name matches are kept with their IDs, so linked questions and student progress
 * survive. New rows are proposed for validation; rows the source no longer lists
 * are withdrawn (hidden), never deleted.
 */
export function planSyllabusMerge<T extends { id: string; name?: string | null; nameEn?: string | null; nameTa?: string | null }>(
  existing: T[],
  fetched: Array<{ en: string; ta: string }>,
) {
  const byEn = new Map(existing.map((row) => [nameKey(row.nameEn || row.name), row]));
  const byTa = new Map(existing.filter((row) => row.nameTa).map((row) => [nameKey(row.nameTa), row]));
  const used = new Set<string>();
  const keep: Array<{ row: T; order: number; en: string; ta: string }> = [];
  const create: Array<{ order: number; en: string; ta: string }> = [];
  fetched.forEach((item, index) => {
    const match = byEn.get(nameKey(item.en)) || byTa.get(nameKey(item.ta));
    if (match && !used.has(match.id)) {
      used.add(match.id);
      keep.push({ row: match, order: index + 1, en: item.en, ta: item.ta });
    } else {
      create.push({ order: index + 1, en: item.en, ta: item.ta });
    }
  });
  const withdraw = existing.filter((row) => !used.has(row.id));
  return { keep, create, withdraw };
}

/** Split `total` into integer parts proportional to `weights` (largest remainder). */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + Math.max(0, weight), 0);
  if (!sum || total <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (Math.max(0, weight) / sum) * total);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((acc, part) => acc + part, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (left <= 0) break;
    parts[index] += 1;
    left -= 1;
  }
  return parts;
}

export type MockSectionPlan = { name: string; subjectId: string; target: number };

/**
 * Turn an exam pattern into per-subject question targets for a full mock, in the
 * pattern's section order. Sections are matched to syllabus subjects by name (English
 * or Tamil, either containing the other); an unmatched section's questions are spread
 * over all subjects. Without sections the total is split evenly across subjects.
 * `cap` (> 0) scales the whole paper down proportionally.
 */
export function planMockSections(
  pattern: { totalQuestions?: number | null; sections?: Array<{ name?: string | null; questionCount?: number | null }> | null },
  subjects: Array<{ id: string; names: Array<string | null | undefined> }>,
  cap = 0,
): MockSectionPlan[] {
  if (!subjects.length) return [];
  const sections = (pattern.sections || []).filter((section) => (section.questionCount || 0) > 0);
  const total = Math.max(1, pattern.totalQuestions || sections.reduce((acc, section) => acc + (section.questionCount || 0), 0) || 20);
  const target = cap > 0 ? Math.min(total, cap) : total;
  const match = (sectionName: string) => {
    const key = nameKey(sectionName);
    if (key.length < 3) return undefined;
    return subjects.find((subject) =>
      subject.names.some((name) => {
        const candidate = nameKey(name);
        return candidate.length >= 3 && (candidate === key || candidate.includes(key) || key.includes(candidate));
      }),
    );
  };

  // Build the paper at full size first, then scale to the cap.
  const raw: MockSectionPlan[] = [];
  const spreadOver = (name: string | null, count: number, pool: typeof subjects) => {
    const parts = apportion(count, pool.map(() => 1));
    pool.forEach((subject, at) => raw.push({ name: name || subject.names.find(Boolean) || "Section", subjectId: subject.id, target: parts[at] }));
  };
  if (sections.length) {
    const listed = sections.reduce((acc, section) => acc + (section.questionCount || 0), 0);
    // Sections that add up to more than the total are scaled down to it.
    const counts = listed > total ? apportion(total, sections.map((section) => section.questionCount || 0)) : sections.map((section) => section.questionCount || 0);
    const covered = new Set<string>();
    sections.forEach((section, index) => {
      const name = section.name || "Section";
      const subject = match(name);
      if (subject) {
        covered.add(subject.id);
        raw.push({ name, subjectId: subject.id, target: counts[index] });
      } else spreadOver(name, counts[index], subjects);
    });
    // Questions the sections do not account for go to the subjects no section named.
    const rest = total - counts.reduce((acc, count) => acc + count, 0);
    if (rest > 0) {
      const uncovered = subjects.filter((subject) => !covered.has(subject.id));
      spreadOver(null, rest, uncovered.length ? uncovered : subjects);
    }
  } else {
    spreadOver(null, total, subjects);
  }
  if (target < total) {
    const scaled = apportion(target, raw.map((row) => row.target));
    raw.forEach((row, index) => (row.target = scaled[index]));
  }

  const merged: MockSectionPlan[] = [];
  for (const row of raw) {
    if (row.target <= 0) continue;
    const same = merged.find((item) => item.name === row.name && item.subjectId === row.subjectId);
    if (same) same.target += row.target;
    else merged.push({ ...row });
  }
  return merged;
}
