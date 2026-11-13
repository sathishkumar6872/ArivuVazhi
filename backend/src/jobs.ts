import { hostname } from "node:os";
import { dayKey, nid } from "./http.js";
import { nextIstRun, stemKey } from "./governance.js";
import { DailyMockSet, Exam, JobLock, JobRun, Question, User } from "./models.js";
import { ensureDailyMock, generateDailyMockSet } from "./daily-mock.js";

const JOB = "daily_mock_sets";
/** Only students active in this many days get a set, to bound AI spend. */
const ACTIVE_DAYS = Number(process.env.DAILY_MOCK_ACTIVE_DAYS || 14);
/** Lease length; the holder renews it after every batch, so a crashed holder frees it within this time. */
const LEASE_MS = 5 * 60 * 1000;
/** Unique per process, so instances (and restarts) never mistake each other's lease for their own. */
const OWNER = `${hostname()}:${process.pid}:${nid()}`;

type Trigger = "schedule" | "boot" | "manual";
export type JobStart =
  | { started: true; runId: string; done: Promise<unknown> }
  | { started: false; reason: "already_running"; runId: string | null };

/** In-process guard; the DB lease below covers other instances and restarts. */
let current: { runId: string; done: Promise<unknown> } | null = null;

function leaseUntil() {
  return new Date(Date.now() + LEASE_MS);
}

/** Take the job lease if it is free or expired. Atomic across processes. */
async function acquireLock(runId: string) {
  try {
    const lock = await JobLock.findOneAndUpdate(
      { id: JOB, lockedUntil: { $lt: new Date() } },
      { $set: { owner: OWNER, runId, lockedUntil: leaseUntil() } },
      { upsert: true, new: true },
    );
    return lock?.owner === OWNER;
  } catch (error) {
    // The lock document exists and is held: the upsert collided with it.
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

/** Extend the lease; false means another process took it over (we stalled past the lease). */
async function renewLock() {
  const result = await JobLock.updateOne({ id: JOB, owner: OWNER }, { $set: { lockedUntil: leaseUntil() } });
  return result.matchedCount === 1;
}

async function releaseLock() {
  try {
    await JobLock.updateOne({ id: JOB, owner: OWNER }, { $set: { lockedUntil: new Date(0) } });
  } catch (error) {
    // The lease expires on its own; a failed release only delays the next run.
    console.warn(`Daily mock lock release failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Start generating today's personal mock question sets for every recently active
 * student and each published mock of the exams they selected. Returns as soon as
 * the run is registered; `done` settles when it finishes. Only one run executes at
 * a time across all instances; ready sets are skipped, so reruns are cheap.
 */
export async function startDailyMockJob(trigger: Trigger): Promise<JobStart> {
  if (current) return { started: false, reason: "already_running", runId: current.runId };
  const runId = nid();
  if (!(await acquireLock(runId))) {
    const lock = await JobLock.findOne({ id: JOB }).select("runId").lean();
    return { started: false, reason: "already_running", runId: lock?.runId || null };
  }
  try {
    // We hold the lease, so any run still marked "running" belongs to a process that died.
    await JobRun.updateMany(
      { job: JOB, status: "running" },
      { $set: { status: "failed", error: "Interrupted: the server stopped before the run finished.", finishedAt: new Date() } },
    );
    const run = await JobRun.create({ id: runId, job: JOB, dayKey: dayKey(), trigger });
    const done = execute(run, trigger).finally(async () => {
      current = null;
      await releaseLock();
    });
    current = { runId: run.id, done };
    return { started: true, runId: run.id, done };
  } catch (error) {
    await releaseLock();
    throw error;
  }
}

/** Fire-and-forget wrapper for the scheduler and boot catch-up. */
export function runDailyMockJob(trigger: Trigger) {
  return startDailyMockJob(trigger).then((start) => (start.started ? start.done : start));
}

async function execute(run: InstanceType<typeof JobRun>, trigger: Trigger) {
  const today = run.dayKey;
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
    // Each exam has one daily mock built from its pattern; create/refresh it before generating.
    const exams = await Exam.find({ id: { $in: examIds }, lifecycle: "published" }).lean();
    const mocks = await Promise.all(exams.map((exam) => ensureDailyMock(exam)));
    let leaseLost = false;
    const renew = async () => {
      if (!leaseLost && !(await renewLock())) leaseLost = true;
    };
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
          const set = await generateDailyMockSet({ studentId: student.id, mockId: mock.id, dayKey: today, onProgress: renew });
          // "generating" here means another worker owns this set right now: not a failure.
          if (set.status === "ready") run.ready += 1;
          else run.skipped += 1;
        } catch (error) {
          run.failed += 1;
          const code = (error as { code?: string }).code;
          // Budget exhausted or no provider: every remaining call would fail the same way.
          if (code === "AI_BUDGET" || code === "AI_UNAVAILABLE") {
            throw new Error(error instanceof Error ? error.message : String(code));
          }
        }
        await renew();
        if (leaseLost) throw new Error("Lost the job lease to another instance; stopping this run.");
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
  console.log(JSON.stringify({ job: JOB, trigger, runId: run.id, status: run.status, ready: run.ready, failed: run.failed, skipped: run.skipped }));
  return run;
}

/**
 * In-process scheduler for 02:00 IST. On boot it also catches up if today's run
 * was missed (e.g. a free-tier host was asleep at 02:00). Hosts that sleep should
 * additionally call POST /api/v1/internal/jobs/daily-mocks from an external cron.
 * With several instances, each schedules the run but the DB lease lets only one execute.
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

/** One run's progress, for whoever triggered it (cron or admin). */
export async function getDailyMockRun(runId: string) {
  const run = await JobRun.findOne({ id: runId, job: JOB })
    .select("id dayKey trigger status ready failed skipped error finishedAt createdAt updatedAt")
    .lean();
  if (!run) return null;
  const { _id, ...rest } = run as typeof run & { _id?: unknown };
  return { ...rest, finished: run.status !== "running" };
}

export async function dailyMockJobStatus() {
  const [last, today, lock] = await Promise.all([
    JobRun.findOne({ job: JOB }).sort({ createdAt: -1 }).lean(),
    DailyMockSet.aggregate<{ _id: string; n: number }>([
      { $match: { dayKey: dayKey() } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    JobLock.findOne({ id: JOB }).select("lockedUntil").lean(),
  ]);
  return {
    schedule: "02:00 Asia/Kolkata daily",
    enabled: process.env.DAILY_MOCK_JOB !== "off",
    nextRunAt: nextIstRun(new Date()),
    // True when any instance holds a live lease, not just this process.
    running: Boolean(lock?.lockedUntil && new Date(lock.lockedUntil).getTime() > Date.now()),
    lastRun: last,
    today: Object.fromEntries(today.map((row) => [row._id, row.n])),
  };
}
