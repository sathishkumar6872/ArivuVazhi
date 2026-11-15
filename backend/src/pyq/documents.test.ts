import assert from "node:assert/strict";
import test from "node:test";
import { matchStatus, subjectCodeOf } from "./documents.js";
import { gapRanges } from "./extract.js";

test("subject code is read from TNPSC-style rows and key headings", () => {
  assert.equal(subjectCodeOf("GENERAL ENGLISH WITH GENERAL STUDIES (Subject Code 004) Click here"), "004");
  assert.equal(subjectCodeOf("Subject Code: 003 (QB Code: CCSE4GT/2024)"), "003");
  assert.equal(subjectCodeOf("பொது அறிவு GENERAL STUDIES (Subject Code ) Click here"), "");
  assert.equal(subjectCodeOf("Group IV 2024 final key"), "");
});

test("an AI-marked paper alone does not count as having an answer key", () => {
  const labels = matchStatus([{ docType: "question_paper", status: "processed", paperId: "p1" }]);
  assert.ok(labels.includes("Answer Key Missing"));
  assert.ok(!labels.includes("Both Found"));
});

test("unmatched answer keys ask for matching", () => {
  const labels = matchStatus([
    { docType: "question_paper", status: "approved", paperId: "p1" },
    { docType: "answer_key", status: "processed", paperId: "" },
  ]);
  assert.ok(labels.includes("Both Found"));
  assert.ok(labels.includes("Matching Required"));
});

test("missing question numbers are re-read only on the pages around them", () => {
  const found = [
    { number: 1, page: 3 },
    { number: 2, page: 3 },
    { number: 5, page: 4 },
    { number: 6, page: 5 },
    { number: 9, page: 12 },
  ];
  const ranges = gapRanges(found, 28);
  assert.deepEqual(ranges, [
    { from: 3, to: 4, numbers: [3, 4] },
    { from: 5, to: 8, numbers: [7, 8] },
  ]);
  assert.deepEqual(gapRanges([{ number: 1, page: 1 }, { number: 2, page: 1 }], 10), []);
});
