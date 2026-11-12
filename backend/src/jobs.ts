import { dayKey, nid } from "./http.js";
import { nextIstRun, stemKey } from "./governance.js";
import { DailyMockSet, JobRun, MockTest, Question, User } from "./models.js";
import { generateDailyMockSet } from "./question-ai.js";

const JOB = "daily_mock_sets";
/** Only students active in this many days get a set, to bound AI spend. */
const ACTIVE_DAYS = Number(process.env.DAILY_MOCK_ACTIVE_DAYS || 14);

let running: Promise<unknown> | null = null;

/**
 * Generate today's personal mock question sets for every recently active student
 * and each published mock of the exams they selected. Safe to call repeatedly:
 * students whose set is already ready are skipped.
 */
export function runDailyMockJob(trigger: "schedule" | "boot" | "manual") {
  if (!running) running = execute(trigger).finally(() => (running = null));
  return running;
}

async function execute(trigger: "schedule" | "boot" | "manual") {
  const today = dayKey();
  const run = await JobRun.create({ id: nid(), job: JOB, dayKey: today, trigger });
  try {
    const activeSince = dayKey(new Date(Date.now() - ACTIVE_DAYS * 24 * 60 * 60 * 1000));
    const students = await User.find({
      role: "student",
      status: "active",
      onboardingComplete: true,
      lastActiveDate: { $gte: activeSince },
    })
      .select("id examIds primaryExamId")
      .lean();
    const examIds = [...new Set(students.flatMap((student) => [student.primaryExamId, ...(student.examIds || [])]).filter(Boolean))];
    const mocks = await MockTest.find({ examId: { $in: examIds }, status: "published" }).select("id examId").lean();
    const done = await DailyMockSet.find({ dayKey: today, status: "ready" }).select("studentId mockId").lean();
    const ready = new Set(done.map((set) => `${set.studentId}:${set.mockId}`));

    for (const student of students) {
      const mine = new Set([student.primaryExamId, ...(student.examIds || [])]);
      for (const mock of mocks.filter((item) => mine.has(item.examId))) {
        if (ready.has(`${student.id}:${mock.id}`)) {
          run.skipped += 1;
          continue;
        }
        try {
          await generateDailyMockSet({ studentId: student.id, mockId: mock.id, dayKey: today });
          run.ready += 1;
        } catch (error) {
          run.failed += 1;
          const code = (error as { code?: string }).code;
          // Budget exhausted or no provider: every remaining call would fail the same way.
          if (code === "AI_BUDGET" || code === "AI_UNAVAILABLE") {
            run.error = error instanceof Error ? error.message : String(code);
            run.status = "failed";
            run.finishedAt = new Date();
            await run.save();
            return run;
          }
        }
        await run.save();
      }
    }
    run.status = "done";
  } catch (error) {
    run.status = "failed";
    run.error = error instanceof Error ? error.message.slice(0, 300) : "unknown";
  }
  run.finishedAt = new Date();
  await run.save();
  console.log(JSON.stringify({ job: JOB, trigger, status: run.status, ready: run.ready, failed: run.failed, skipped: run.skipped }));
  return run;
}

/**
 * In-process scheduler for 02:00 IST. On boot it also catches up if today's run
 * was missed (e.g. a free-tier host was asleep at 02:00). Hosts that sleep should
 * additionally call POST /api/v1/internal/jobs/daily-mocks from an external cron.
 */
export function startDailyMockScheduler() {
  if (process.env.DAILY_MOCK_JOB === "off") {
    console.log("Daily mock job disabled (DAILY_MOCK_JOB=off).");
    return;
  }
  const scheduleNext = () => {
    const next = nextIstRun(new Date());
    const timer = setTimeout(() => {
      void runDailyMockJob("schedule").catch((error) => console.warn(`Daily mock job failed: ${error?.message || error}`));
      scheduleNext();
    }, next.getTime() - Date.now());
    timer.unref?.();
  };
  scheduleNext();

  const catchUp = setTimeout(async () => {
    try {
      const today = dayKey();
      const finished = await JobRun.exists({ job: JOB, dayKey: today, status: "done" });
      // Only after 02:00 IST: before that, today's scheduled run is still ahead.
      if (!finished && Date.now() >= todayTwoAm().getTime()) await runDailyMockJob("boot");
    } catch (error) {
      console.warn(`Daily mock catch-up failed: ${error instanceof Error ? error.message : error}`);
    }
  }, 30_000);
  catchUp.unref?.();
}

function todayTwoAm() {
  return new Date(`${dayKey()}T02:00:00+05:30`);
}

/** One-off fill of `stemKey` on questions created before duplicate detection existed. */
export async function backfillStemKeys() {
  const rows = await Question.find({ stemKey: { $in: ["", null] } }).select("id stem").limit(5000).lean();
  if (!rows.length) return 0;
  await Question.bulkWrite(
    rows.map((row) => ({ updateOne: { filter: { id: row.id }, update: { $set: { stemKey: stemKey(row.stem) } } } })),
  );
  return rows.length;
}

export async function dailyMockJobStatus() {
  const [last, today] = await Promise.all([
    JobRun.findOne({ job: JOB }).sort({ createdAt: -1 }).lean(),
    DailyMockSet.aggregate<{ _id: string; n: number }>([
      { $match: { dayKey: dayKey() } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
  ]);
  return {
    schedule: "02:00 Asia/Kolkata daily",
    enabled: process.env.DAILY_MOCK_JOB !== "off",
    nextRunAt: nextIstRun(new Date()),
    running: Boolean(running),
    lastRun: last,
    today: Object.fromEntries(today.map((row) => [row._id, row.n])),
  };
}
