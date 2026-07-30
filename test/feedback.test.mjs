// feedback.test.mjs — the Feedback tab's code path, offline.
//
// The tab's promise is behavioural: a note the person writes MUST change the
// next run or visibly block it. These tests pin the reading, the blocking
// decision, and the refusal wording — the parts that are code. Translating a
// note into persona fields is the agent's job and is not tested here.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFeedback, blockingRows, needsDecisionRows, formatFeedback, formatRefusal,
  STATUS_APPLIED, STATUS_NEEDS_DECISION, FEEDBACK_HEADERS,
} from "../src/feedback.mjs";

// The tab exactly as BuildLeadSheet.gs lays it out: banner, subtitle, headers
// on row 3, data from row 4.
const SHEET = [
  ["FEEDBACK"],
  ["Write what you want changed, in plain English. Your agent reads this before every run."],
  FEEDBACK_HEADERS,
  ["2026-07-30", "no leads outside the US", "Must", "", "", ""],
  ["2026-07-30", "prefer people who comment often", "Prefer", STATUS_APPLIED, "2026-07-30", "boosted comment activity"],
  ["2026-07-30", "make the openers funnier", "", STATUS_NEEDS_DECISION, "", "humour is a voice change, not a persona field — needs your call"],
];

test("rows are read from row 4 down and empty rows are skipped", () => {
  const { headerRow, rows } = parseFeedback(SHEET);
  assert.equal(headerRow, 3);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].rowNumber, 4);
  assert.equal(rows[0].note, "no leads outside the US");
  assert.equal(rows[0].intent, "Must");
});

test("a header row that is not row 3 is still found", () => {
  const moved = [["junk"], ...SHEET];
  const { headerRow, rows } = parseFeedback(moved);
  assert.equal(headerRow, 4);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].rowNumber, 5);
});

test("a New row blocks; Applied and Needs-a-decision rows do not", () => {
  const { rows } = parseFeedback(SHEET);
  const blocking = blockingRows(rows);
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].note, "no leads outside the US");
  const waiting = needsDecisionRows(rows);
  assert.equal(waiting.length, 1);
  assert.match(waiting[0].changed, /needs your call/);
});

test("status comparison ignores case, because humans type in sheets", () => {
  const { rows } = parseFeedback([
    FEEDBACK_HEADERS,
    ["", "note one", "", "applied", "", ""],
    ["", "note two", "", "APPLIED", "", ""],
    ["", "note three", "", "new", "", ""],
  ]);
  assert.equal(blockingRows(rows).length, 1);
  assert.equal(blockingRows(rows)[0].note, "note three");
});

test("an empty tab (or a tab with only its instructions) blocks nothing", () => {
  assert.equal(blockingRows(parseFeedback([]).rows).length, 0);
  assert.equal(blockingRows(parseFeedback(SHEET.slice(0, 3)).rows).length, 0);
});

test("the refusal names the rows, the command to run, and the reason", () => {
  const { rows } = parseFeedback(SHEET);
  const msg = formatRefusal(blockingRows(rows));
  assert.match(msg, /REFUSING to source/);
  assert.match(msg, /row 4/);
  assert.match(msg, /no leads outside the US/);
  assert.match(msg, /npm run feedback -- --apply/);
  assert.match(msg, /npm run feedback -- --needs-decision/);
  assert.match(msg, /AGENTS\.md section 4b/);
});

test("the listing shows the agent's write-back next to the person's note", () => {
  const { rows } = parseFeedback(SHEET);
  const out = formatFeedback(rows);
  assert.match(out, /prefer people who comment often/);
  assert.match(out, /boosted comment activity/);
});
