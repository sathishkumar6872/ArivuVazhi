import { HttpError, dayKey, nid } from "./http.js";
import { planMockSections } from "./governance.js";
import { DailyMockSet, Exam, MockTest, Question, Subject, Topic, User } from "./models.js";
import { excludedQuestionIds, generateForStudent, recordSeen, shuffle, visibleToStudent } from "./question-ai.js";

/** Optional ceiling on questions per daily mock; 0 (default) = the full exam pattern. */
const CAP = Number(process.env.DAILY_MOCK_MAX_QUESTIONS || 0);
/** Questions requested per AI call. */
const BATCH = 10;
/** AI calls in flight at once while building one student's mock. */
const CONCURRENCY = Math.max(1, Number(process.env.DAILY_MOCK_CONCURRENCY || 4));
/** A set that has made no progress for this long is assumed abandoned (crash/restart) and is retried. */
export const DAILY_SET_STALE_MS = 10 * 60 * 1000;
/** Duplicate filtering can leave a few short; below this share of the pattern the set is not usable. */
const READY_RATIO = 0.95;
const MAX_ROUNDS = 4;
const FATAL = new Set(["AI_BUDGET", "AI_UNAVAILABLE"]);

type ExamLike = {
  id: string;
  name: string;
  pattern?: { durationMinutes?: number | null; totalQuestions?: number | null; marksPerQuestion?: number | null; negativeMarks?: number | null } | null;
};

/** Time since the set last made progress, in ms (Infinity if unknown). */
export function generatingAgeMs(set: { startedAt?: Date | null; updatedAt?: Date | null }) {
  const last = set.updatedAt || set.startedAt;
  return last ? Date.now() - new Date(last).getTime() : Number.POSITIVE_INFINITY;
}

function mockFields(exam: ExamLike) {
  const pattern = exam.pattern || {};
  const total = Math.max(1, pattern.totalQuestions || 20);
  const questions = CAP > 0 ? Math.min(total, CAP) : total;
  const fullDuration = Math.max(5, pattern.durationMinutes || 180);
  // A capped paper keeps the real exam's time per question.
  const durationMinutes = questions === total ? fullDuration : Math.max(5, Math.round((fullDuration * questions) / total));
  const marksPerQuestion = pattern.marksPerQuestion ?? 1;
  const negativeMarks = pattern.negativeMarks ?? 0;
  return {
    title: `${exam.name} · Daily Mock`,
    durationMinutes,
    marksPerQuestion,
    negativeMarks,
    status: "published" as const,
    instructions: [
      `${questions} questions · ${durationMinutes} minutes, following the ${exam.name} exam pattern.`,
      `${marksPerQuestion} mark(s) per correct answer${negativeMarks ? `, minus ${negativeMarks} for a wrong answer` : ", no negative marking"}.`,
      "A fresh personal question set is prepared for you every day at 2:00 AM. Questions do not repeat.",
      "One attempt per day. The server keeps the timer and calculates the score.",
    ],
  };
}

/** The single daily mock of an exam, created on first use and kept in step with the exam pattern. */
export async function ensureDailyMock(exam: ExamLike) {
  const fields = mockFields(exam);
  const existing = await MockTest.findOne({ examId: exam.id, kind: "daily" }).lean();
  if (
    existing &&
    existing.status === fields.status &&
    existing.title === fields.title &&
    existing.durationMinutes === fields.durationMinutes &&
    existing.marksPerQuestion === fields.marksPerQuestion &&
    existing.negativeMarks === fields.negativeMarks &&
    JSON.stringify(existing.instructions) === JSON.stringify(fields.instructions)
  ) {
    return existing;
  }
  try {
    return (await MockTest.findOneAndUpdate(
      { examId: exam.id, kind: "daily" },
      { $set: fields, $setOnInsert: { id: nid(), questionIds: [] } },
      { upsert: true, new: true },
    ).lean())!;
  } catch (error) {
    // Two requests created it at the same moment; the unique index kept one.
    if ((error as { code?: number }).code === 11000) return (await MockTest.findOne({ examId: exam.id, kind: "daily" }).lean())!;
    throw error;
  }
}

/** The student's exams, primary first, that are published. */
async function studentExams(studentId: string) {
  const user = await User.findOne({ id: studentId }).select("primaryExamId examIds").lean();
  if (!user) return [];
  const ids = [...new Set([user.primaryExamId, ...(user.examIds || [])].filter(Boolean))] as string[];
  const exams = await Exam.find({ id: { $in: ids }, lifecycle: "published" }).lean();
  return ids.map((id) => exams.find((exam) => exam.id === id)).filter(Boolean) as typeof exams;
}

/** Daily mocks for the student's own exams only (primary exam first). */
export async function studentDailyMocks(studentId: string) {
  const exams = await studentExams(studentId);
  return Promise.all(exams.map((exam) => ensureDailyMock(exam)));
}

/**
 * Prepare today's mock for each of the student's exams right away, in parallel.
 * Used when a student finishes onboarding or adds an exam, so a new student does
 * not wait for the next 02:00 run. Runs in the background; errors are logged.
 */
export async function prepareStudentMocks(studentId: string) {
  const exams = await studentExams(studentId);
  const today = dayKey();
  await Promise.all(
    exams.map(async (exam) => {
      try {
        const mock = await ensureDailyMock(exam);
        await generateDailyMockSet({ studentId, mockId: mock.id, dayKey: today });
      } catch (error) {
        console.warn(`Daily mock for student ${studentId} / exam ${exam.id} failed: ${error instanceof Error ? error.message : error}`);
      }
    }),
  );
}

/** Run tasks with at most `limit` in flight. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(lanes);
}

/** Recent stems per subject from this student's own generated questions, for the "don't repeat" prompt. */
async function recentStemsBySubject(studentId: string, examId: string) {
  const rows = await Question.find({ ownerStudentId: studentId, examId }).sort({ createdAt: -1 }).limit(800).select("subjectId stem").lean();
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.subjectId) || [];
    if (list.length < 40) list.push(row.stem);
    map.set(row.subjectId, list);
  }
  return map;
}

type SectionState = { name: string; subjectId: string; target: number; questionIds: string[] };

/**
 * Generate (or reuse) today's mock question set for one student, mirroring the exam
 * pattern: total questions, section split by subject, in the student's exam language.
 * Questions never repeat (normalised-stem check against everything already in the
 * exam, plus recent stems sent to the model). Batches run in parallel.
 *
 * Safe under concurrency: the set is claimed atomically, so two workers never build
 * the same (student, mock, day) together. A failed or abandoned set is reclaimed and
 * continues from the sections already filled. Returns the set; status "generating"
 * means another worker currently owns it.
 */
export async function generateDailyMockSet(input: { studentId: string; mockId: string; dayKey: string; onProgress?: () => Promise<void> | void }) {
  const key = { studentId: input.studentId, mockId: input.mockId, dayKey: input.dayKey };
  const existing = await DailyMockSet.findOne(key);
  if (existing?.status === "ready") return existing;
  if (existing?.status === "generating" && generatingAgeMs(existing) < DAILY_SET_STALE_MS) return existing;
  const mock = await MockTest.findOne({ id: input.mockId, status: "published" }).lean();
  if (!mock) throw new HttpError(404, "Mock test not found", "NOT_FOUND");

  let set;
  if (existing) {
    // Retry a failed or abandoned set; the status/startedAt match makes the claim atomic.
    set = await DailyMockSet.findOneAndUpdate(
      { id: existing.id, status: existing.status, startedAt: existing.startedAt ?? null },
      { $set: { status: "generating", error: "", startedAt: new Date() } },
      { new: true },
    );
    if (!set) return (await DailyMockSet.findOne(key))!;
  } else {
    try {
      set = await DailyMockSet.create({ id: nid(), ...key, examId: mock.examId, status: "generating", startedAt: new Date() });
    } catch (error) {
      // Another worker created it first: it owns this set.
      if ((error as { code?: number }).code === 11000) return (await DailyMockSet.findOne(key))!;
      throw error;
    }
  }

  const setId = set.id;
  let sections: SectionState[] = [];
  let target = 0;
  let saving: Promise<unknown> = Promise.resolve();
  const progress = () => sections.reduce((sum, section) => sum + section.questionIds.length, 0);
  // Serialised so parallel batches never overwrite each other's progress.
  const persist = () => {
    saving = saving.then(() => DailyMockSet.updateOne({ id: setId }, { $set: { sections, target, progress: progress() } }));
    return saving;
  };

  try {
    const [exam, student, subjects] = await Promise.all([
      Exam.findOne({ id: mock.examId, lifecycle: "published" }).lean(),
      User.findOne({ id: input.studentId }).select("language").lean(),
      Subject.find({ examId: mock.examId, status: "published" }).sort({ order: 1 }).lean(),
    ]);
    if (!exam) throw new HttpError(404, "Published exam not found", "NOT_FOUND");
    const topics = await Topic.find({ examId: exam.id, status: "published", subjectId: { $in: subjects.map((subject) => subject.id) } }).lean();
    const topicsBySubject = new Map<string, typeof topics>();
    for (const topic of topics) topicsBySubject.set(topic.subjectId, [...(topicsBySubject.get(topic.subjectId) || []), topic]);
    const usable = subjects.filter((subject) => topicsBySubject.get(subject.id)?.length);
    if (!usable.length) throw new HttpError(404, "No published syllabus topics for this exam yet.", "SYLLABUS_EMPTY");
    const subjectById = new Map(usable.map((subject) => [subject.id, subject]));

    const saved = (set.sections || []).map((row) => ({
      name: row.name || "",
      subjectId: row.subjectId || "",
      target: row.target || 0,
      questionIds: [...(row.questionIds || [])],
    }));
    sections = saved.length && saved.every((row) => subjectById.has(row.subjectId))
      ? saved
      : planMockSections(exam.pattern || {}, usable.map((subject) => ({ id: subject.id, names: [subject.nameEn, subject.name, subject.nameTa] })), CAP).map((row) => ({ ...row, questionIds: [] }));
    target = sections.reduce((sum, section) => sum + section.target, 0);
    await persist();

    const language: "en" | "ta" = student?.language === "ta" ? "ta" : "en";
    const recent = await recentStemsBySubject(input.studentId, exam.id);

    // 1. Shared pool first: questions of this exam, subject and language the student has never been shown.
    // Exclude what the student has seen and the practice set they may be doing right now.
    const seen = await excludedQuestionIds(input.studentId, exam.id);
    const taken = new Set(sections.flatMap((section) => section.questionIds));
    for (const section of sections) {
      const need = section.target - section.questionIds.length;
      if (need <= 0) continue;
      const rows = await Question.aggregate<{ id: string }>([
        // Original PYQs stay in the PYQ section; mocks use AI questions only.
        { $match: { examId: exam.id, subjectId: section.subjectId, language, source: { $ne: "pyq" }, ...visibleToStudent(input.studentId), id: { $nin: [...seen, ...taken] } } },
        { $sample: { size: need } },
        { $project: { _id: 0, id: 1 } },
      ]);
      for (const row of rows) {
        section.questionIds.push(row.id);
        taken.add(row.id);
      }
    }
    await persist();
    // Reserve them at once, so practice running in parallel cannot serve the same questions.
    await recordSeen(input.studentId, exam.id, [...taken], "mock");
    // 2. Only what the pool could not cover is generated (and joins the pool for everyone).
    let provider = "";
    let fatal: unknown = null;

    for (let round = 0; round < MAX_ROUNDS && !fatal; round += 1) {
      const tasks: Array<{ section: SectionState; topic: (typeof topics)[number]; count: number }> = [];
      for (const section of sections) {
        const pool = shuffle(topicsBySubject.get(section.subjectId) || []);
        let need = section.target - section.questionIds.length;
        for (let i = 0; need > 0; i += 1) {
          const count = Math.min(BATCH, need);
          // Top-up rounds ask for a few extra: duplicates are dropped, extras stay in the student's practice pool.
          tasks.push({ section, topic: pool[i % pool.length], count: round ? Math.min(BATCH, count + 3) : count });
          need -= count;
        }
      }
      if (!tasks.length) break;
      let added = 0;
      await runPool(tasks, CONCURRENCY, async (task) => {
        if (fatal) return;
        try {
          const stems = recent.get(task.section.subjectId) || [];
          const result = await generateForStudent({
            studentId: input.studentId,
            exam,
            subject: subjectById.get(task.section.subjectId)!,
            topic: task.topic,
            language,
            difficulty: "medium",
            count: task.count,
            avoidStems: stems.slice(0, 30),
            feature: "daily_mock_generate",
            source: "daily_mock",
          });
          provider = result.provider;
          const room = Math.max(0, task.section.target - task.section.questionIds.length);
          const take = result.docs.slice(0, room);
          task.section.questionIds.push(...take.map((doc) => doc.id));
          await recordSeen(input.studentId, exam.id, take.map((doc) => doc.id), "mock");
          recent.set(task.section.subjectId, [...take.map((doc) => doc.stem), ...stems].slice(0, 40));
          added += take.length;
          await persist();
          await input.onProgress?.();
        } catch (error) {
          // Budget/provider problems stop everything; a single bad batch is refilled next round.
          if (FATAL.has((error as { code?: string }).code || "")) fatal = error;
        }
      });
      if (!added) break;
    }
    if (fatal) throw fatal;

    const questionIds = sections.flatMap((section) => section.questionIds);
    if (questionIds.length < Math.ceil(target * READY_RATIO)) {
      throw new HttpError(502, `Only ${questionIds.length} of ${target} mock questions could be generated. It will be retried.`, "AI_SHORT");
    }
    await saving;
    await DailyMockSet.updateOne(
      { id: setId },
      { $set: { questionIds, status: "ready", provider: provider || "pool", error: "", sections, target, progress: questionIds.length } },
    );
    // Shown in a mock = seen: never offered to this student again, in practice or later mocks.
    await recordSeen(input.studentId, exam.id, questionIds, "mock");
    return (await DailyMockSet.findOne({ id: setId }))!;
  } catch (error) {
    await saving.catch(() => undefined);
    await DailyMockSet.updateOne(
      { id: setId },
      { $set: { status: "failed", error: error instanceof Error ? error.message.slice(0, 300) : "unknown", sections, target, progress: progress() } },
    );
    throw error;
  }
}
