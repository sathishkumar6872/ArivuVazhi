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
