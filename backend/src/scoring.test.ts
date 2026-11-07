import assert from "node:assert/strict";
import test from "node:test";
import { scoreAttempt, scoreItem } from "./scoring.js";

const rule = { marksPerQuestion: 1.5, negativeMarks: 0.5 };

test("awards full marks for a correct answer", () => {
  assert.deepEqual(scoreItem(true, rule), { state: "correct", awarded: 1.5 });
});

test("applies negative marks for an incorrect answer", () => {
  assert.deepEqual(scoreItem(false, rule), { state: "incorrect", awarded: -0.5 });
});

test("leaves unanswered questions at zero", () => {
  assert.deepEqual(scoreItem(null, rule), { state: "unanswered", awarded: 0 });
});

test("scores a mixed attempt without treating blanks as wrong", () => {
  const result = scoreAttempt([true, false, null, true], rule);
  assert.equal(result.correct, 2);
  assert.equal(result.incorrect, 1);
  assert.equal(result.unanswered, 1);
  assert.equal(result.rawScore, 2.5);
  assert.equal(result.maxScore, 6);
});
