import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionExam, escapeRegex, nextIstRun, planSyllabusMerge, stemKey } from "./governance.js";

test("stemKey treats case, punctuation and spacing changes as the same question", () => {
  assert.equal(stemKey("Which Article guarantees equality?"), stemKey("which  article guarantees EQUALITY"));
  assert.notEqual(stemKey("Article 14?"), stemKey("Article 15?"));
  assert.equal(stemKey("இந்திய அரசியலமைப்பு எது?"), stemKey("இந்திய  அரசியலமைப்பு எது"));
});

test("nextIstRun returns the next 02:00 Asia/Kolkata", () => {
  // 01:00 IST on 12 Nov = 19:30 UTC on 11 Nov → run at 02:00 IST same day (20:30 UTC).
  assert.equal(nextIstRun(new Date("2026-11-11T19:30:00Z")).toISOString(), "2026-11-11T20:30:00.000Z");
  // 02:00 IST exactly → next day.
  assert.equal(nextIstRun(new Date("2026-11-11T20:30:00Z")).toISOString(), "2026-11-12T20:30:00.000Z");
  // 23:00 IST → tomorrow 02:00 IST.
  assert.equal(nextIstRun(new Date("2026-11-12T17:30:00Z")).toISOString(), "2026-11-12T20:30:00.000Z");
});

test("exam lifecycle follows Draft → Under Review → Published → Revised → Archived/Cancelled", () => {
  assert.equal(canTransitionExam("draft", "under_review"), true);
  assert.equal(canTransitionExam("under_review", "published"), true);
  assert.equal(canTransitionExam("published", "revised"), true);
  assert.equal(canTransitionExam("revised", "archived"), true);
  assert.equal(canTransitionExam("draft", "cancelled"), true);
});

test("exam lifecycle rejects skipping review and reviving cancelled exams directly", () => {
  assert.equal(canTransitionExam("draft", "published"), false);
  assert.equal(canTransitionExam("cancelled", "published"), false);
  assert.equal(canTransitionExam("published", "draft"), false);
  assert.equal(canTransitionExam("published", "published"), true);
});

test("escapeRegex makes user search text literal", () => {
  const pattern = new RegExp(escapeRegex("a+b (c)"), "i");
  assert.equal(pattern.test("A+B (C)"), true);
  assert.equal(pattern.test("aab c"), false);
  assert.doesNotThrow(() => new RegExp(escapeRegex("[unclosed"), "i"));
});

test("syllabus merge keeps matching IDs, proposes new rows and withdraws missing ones", () => {
  const existing = [
    { id: "s1", name: "General Studies", nameEn: "General Studies", nameTa: "பொது அறிவு" },
    { id: "s2", name: "Aptitude", nameEn: "Aptitude", nameTa: "திறனறிவு" },
  ];
  const plan = planSyllabusMerge(existing, [
    { en: "general  studies", ta: "பொது அறிவு" },
    { en: "General Tamil", ta: "பொதுத் தமிழ்" },
  ]);
  assert.deepEqual(plan.keep.map((item) => item.row.id), ["s1"]);
  assert.equal(plan.keep[0].order, 1);
  assert.deepEqual(plan.create.map((item) => item.en), ["General Tamil"]);
  assert.deepEqual(plan.withdraw.map((row) => row.id), ["s2"]);
});

test("syllabus merge matches on Tamil name when the English label changes", () => {
  const plan = planSyllabusMerge([{ id: "t1", name: "Polity", nameEn: "Polity", nameTa: "அரசியல்" }], [
    { en: "Indian Polity", ta: "அரசியல்" },
  ]);
  assert.deepEqual(plan.keep.map((item) => item.row.id), ["t1"]);
  assert.equal(plan.create.length, 0);
  assert.equal(plan.withdraw.length, 0);
});
