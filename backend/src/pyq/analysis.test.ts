import assert from "node:assert/strict";
import test from "node:test";
import { analyzePattern, type AnalysisQuestion } from "./analysis.js";

const subjects = [
  { id: "s-hist", name: "History" },
  { id: "s-geo", name: "Geography" },
];
const topics = [
  { id: "t-freedom", name: "Freedom struggle", subjectId: "s-hist" },
  { id: "t-rivers", name: "Rivers", subjectId: "s-geo" },
];

let next = 0;
function q(year: number, subjectId: string, topicId: string, extra: Partial<AnalysisQuestion> = {}): AnalysisQuestion {
  next += 1;
  return { id: `q${next}`, year, paperId: `p${year}`, subjectId, topicId, subtopic: "", questionType: "direct", difficulty: "medium", stemKey: `stem-${next}`, stem: `Question ${next}`, ...extra };
}

test("one year of papers: distribution only, no trends or changes", () => {
  const result = analyzePattern({ questions: [q(2024, "s-hist", "t-freedom"), q(2024, "s-geo", "t-rivers")], subjects, topics });
  assert.equal(result.sufficient, false);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.frequentTopics, []);
  assert.ok(result.notes.some((note) => /at least 2 years/.test(note)));
  assert.equal(result.subjects.length, 2);
});

test("a question shared by two papers of the same year counts once", () => {
  const shared = { stemKey: "same", stem: "Who wrote Thirukkural?" };
  const result = analyzePattern({
    questions: [q(2024, "s-hist", "t-freedom", { ...shared, paperId: "gt" }), q(2024, "s-hist", "t-freedom", { ...shared, paperId: "ge" })],
    subjects,
    topics,
  });
  assert.equal(result.questions, 1);
  assert.equal(result.papers, 2);
  assert.deepEqual(result.repeated, []);
});

test("repeated questions, frequent topics and clear subject changes across years", () => {
  const questions: AnalysisQuestion[] = [];
  // 2023: 30 history + 10 geography; 2024: 20 history + 20 geography.
  for (let i = 0; i < 30; i += 1) questions.push(q(2023, "s-hist", "t-freedom"));
  for (let i = 0; i < 10; i += 1) questions.push(q(2023, "s-geo", "t-rivers"));
  for (let i = 0; i < 20; i += 1) questions.push(q(2024, "s-hist", "t-freedom"));
  for (let i = 0; i < 20; i += 1) questions.push(q(2024, "s-geo", "t-rivers"));
  questions.push(q(2023, "s-geo", "t-rivers", { stemKey: "kaveri", stem: "Longest river in Tamil Nadu?" }));
  questions.push(q(2024, "s-geo", "t-rivers", { stemKey: "kaveri", stem: "Longest river in Tamil Nadu?" }));
  const result = analyzePattern({ questions, subjects, topics });
  assert.equal(result.sufficient, true);
  assert.deepEqual(result.years, [2023, 2024]);
  assert.deepEqual(result.repeated, [{ stem: "Longest river in Tamil Nadu?", years: [2023, 2024] }]);
  assert.deepEqual(result.frequentTopics.map((topic) => topic.name).sort(), ["Freedom struggle", "Rivers"]);
  assert.ok(result.changes.some((change) => change.startsWith("History:")));
  assert.ok(result.changes.some((change) => change.startsWith("Geography:")));
});

test("small years are not compared and unmapped questions are reported", () => {
  const result = analyzePattern({ questions: [q(2023, "s-hist", "t-freedom"), q(2024, "unmapped", "unmapped")], subjects, topics });
  assert.equal(result.sufficient, true);
  assert.deepEqual(result.changes, []);
  assert.ok(result.notes.some((note) => /no subject yet/.test(note)));
  assert.ok(result.notes.some((note) => /at least 30 questions/.test(note)));
});

test("a generic stem with different options is not a repeated question", () => {
  const generic = { stemKey: "match the following", stem: "Match the following" };
  const result = analyzePattern({
    questions: [
      q(2023, "s-hist", "t-freedom", { ...generic, options: ["1 2 3 4", "2 1 4 3"] }),
      q(2023, "s-hist", "t-freedom", { ...generic, options: ["4 3 2 1", "3 4 1 2"] }),
      q(2024, "s-hist", "t-freedom", { ...generic, options: ["2 3 1 4", "1 4 2 3"] }),
      q(2024, "s-hist", "t-freedom", { ...generic, options: ["1 2 3 4", "2 1 4 3"] }),
    ],
    subjects,
    topics,
  });
  assert.equal(result.yearSize[2023], 2);
  assert.deepEqual(result.repeated, [{ stem: "Match the following", years: [2023, 2024] }]);
});
