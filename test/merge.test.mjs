import { test } from "node:test";
import assert from "node:assert/strict";
import { planSheetUpdate, toLeadRow, toRefreshSet, buildExistingIndex } from "../src/merge.mjs";
import { HUMAN_FIELDS } from "../src/schema.mjs";

const existingSheet = {
  rows: [
    {
      rowNumber: 4,
      cells: {
        "Name": "Dana Lopez",
        "Title / Company": "Owner @ Lopez Studio",
        "LinkedIn (or profile URL)": "https://www.linkedin.com/in/dana-lopez-fake",
        "Reached Out": "TRUE", "Replied": "TRUE", "Outcome": "Positive",
        "Date Added": "2026-06-01", "Source Type": "LinkedIn", "Batch": "B1",
        "Notes": "Met at conference.", "Canonical Key": "https://www.linkedin.com/in/dana-lopez-fake",
      },
    },
  ],
};

const scored = [
  { name: "Sam Rivera", title: "Founder", company: "Bright Ops", url: "https://linkedin.com/in/sam-rivera-fake/", score: 64, accepted: true, whyThem: "Founder at Bright Ops", opener: "Hi Sam" },
  { name: "Sam Rivera", title: "Founder", company: "Bright Ops", url: "https://www.linkedin.com/in/sam-rivera-fake", score: 40, accepted: true },
  { name: "Dana Lopez", title: "Owner", company: "Lopez Studio", url: "https://www.linkedin.com/in/dana-lopez-fake", score: 61, accepted: true, whyThem: "refreshed", opener: "Hi Dana", activity: { date: "2026-07-22", type: "comment", url: "u", summary: "s" } },
  { name: "Riya Patel", title: "Student", url: "https://linkedin.com/in/riya-patel-fake", score: 0, accepted: false, rejectedReason: "excluded geography: India" },
];

test("planSheetUpdate: 1 new, 1 update, 1 duplicate, 1 rejected", () => {
  const plan = planSheetUpdate(existingSheet, scored, { nowIso: "2026-07-23T12:00:00Z" });
  assert.equal(plan.counts.newLeads, 1);
  assert.equal(plan.counts.updatedLeads, 1);
  assert.equal(plan.counts.duplicatesSkipped, 1);
  assert.equal(plan.counts.rejected, 1);
  assert.equal(plan.newRows[0].cells["Name"], "Sam Rivera");
  assert.equal(plan.updates[0].rowNumber, 4);
});

test("existing-lead update touches NO human field", () => {
  const plan = planSheetUpdate(existingSheet, scored, { nowIso: "2026-07-23T12:00:00Z" });
  const keys = Object.keys(plan.updates[0].set);
  for (const h of HUMAN_FIELDS) assert.ok(!keys.includes(h), `update must not write human field ${h}`);
  // it does refresh agent + system fields
  assert.ok(keys.includes("Why Them"));
  assert.ok(keys.includes("Fit Score"));
  assert.ok(keys.includes("Last Verified"));
});

test("toLeadRow seeds Date Added + Source Type but leaves G/H/I/L/M blank", () => {
  const cells = toLeadRow({ name: "Sam", title: "Founder", company: "Bright Ops", url: "https://linkedin.com/in/sam-rivera-fake", score: 64 }, { nowIso: "2026-07-23T00:00:00Z" });
  assert.equal(cells["Date Added"], "2026-07-23");
  assert.equal(cells["Source Type"], "LinkedIn");
  assert.equal(cells["Reached Out"], "");
  assert.equal(cells["Replied"], "");
  assert.equal(cells["Outcome"], "");
  assert.equal(cells["Batch"], "");
  assert.equal(cells["Notes"], "");
  assert.equal(cells["Canonical Key"], "https://www.linkedin.com/in/sam-rivera-fake");
  assert.equal(cells["Research Status"], "New");
});

test("toRefreshSet marks status Refreshed and excludes human fields", () => {
  const set = toRefreshSet({ title: "Owner", company: "Lopez", url: "x", score: 61, activity: {} });
  assert.equal(set["Research Status"], "Refreshed");
  for (const h of HUMAN_FIELDS) assert.ok(!(h in set));
});

test("buildExistingIndex derives key when Canonical Key column is empty", () => {
  const idx = buildExistingIndex({
    rows: [{ rowNumber: 4, cells: { "Name": "X Y", "Title / Company": "Owner @ Z Co", "LinkedIn (or profile URL)": "https://linkedin.com/in/xy" } }],
  });
  assert.ok(idx.has("https://www.linkedin.com/in/xy"));
});
