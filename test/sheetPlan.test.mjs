import { test } from "node:test";
import assert from "node:assert/strict";
import { groupContiguous, buildValueUpdates, rowArray } from "../src/sheetPlan.mjs";
import { LEADS_HEADERS } from "../src/schema.mjs";

test("groupContiguous groups runs and splits at gaps", () => {
  // B(1), D(3),E(4),F(5), N(13)..Q(16), S(18),T(19)  (R=17 excluded)
  assert.deepEqual(groupContiguous([1, 3, 4, 5, 13, 14, 15, 16, 18, 19]), [
    [1, 1], [3, 5], [13, 16], [18, 19],
  ]);
});

test("buildValueUpdates emits correct A1 ranges and never a human column", () => {
  const plan = {
    newRows: [{ cells: Object.fromEntries(LEADS_HEADERS.map((h) => [h, h === "Name" ? "Sam" : ""])) }],
    updates: [{
      rowNumber: 4,
      set: {
        "Title / Company": "Owner @ Lopez",
        "Recent Post (verbatim + link)": "u",
        "Why Them": "w",
        "Suggested Comment": "c",
        "Suggested Intro DM": "d",
        "Activity Date": "2026-07-22",
        "Activity Type": "comment",
        "Fit Score": 61,
        "Last Verified": "2026-07-23",
        "Research Source": "linkedin_activity",
        "Research Status": "Refreshed",
      },
    }],
  };
  const { appends, cellUpdates } = buildValueUpdates(plan);
  assert.equal(appends.length, 1);
  assert.equal(appends[0].length, LEADS_HEADERS.length);
  assert.equal(appends[0][0], "Sam");

  const ranges = cellUpdates.map((c) => c.range);
  // B4 (title), D4:G4 (post/why/comment/dm), O4:R4 (activity+score+verified), T4:U4 (source+status)
  assert.deepEqual(ranges, ["Leads!B4", "Leads!D4:G4", "Leads!O4:R4", "Leads!T4:U4"]);
  // none of H..N (human columns) appear
  for (const r of ranges) {
    assert.ok(!/![H-N]\d/.test(r), `range ${r} must not touch human columns H:N`);
  }
});

test("buildValueUpdates throws if a human field sneaks into a set", () => {
  const plan = { updates: [{ rowNumber: 5, set: { "Notes": "nope" } }] };
  assert.throws(() => buildValueUpdates(plan), /human column/);
});

test("rowArray orders cells by header", () => {
  const cells = Object.fromEntries(LEADS_HEADERS.map((h) => [h, ""]));
  cells["Name"] = "A";
  cells["Fit Score"] = 50;
  const arr = rowArray(cells);
  assert.equal(arr[0], "A");
  assert.equal(arr[LEADS_HEADERS.indexOf("Fit Score")], 50);
});
