// The v4 layout inserted three columns INSIDE the agent band, which means every
// column after D moved. A sheet built on the old layout is not slightly wrong,
// it is catastrophically wrong: the suggested intro DM would land in the cell
// where the person keeps their "Reached Out" tick, on every row, with no undo.
//
// So the guard refuses. These tests pin the two halves of that promise: it
// refuses a genuinely old sheet, and it does NOT refuse the ordinary cases
// (a fresh sheet, a sheet missing only its trailing system headers) that the
// non-destructive ensureLeadsSchema patch has always handled.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLeadsLayout, LEADS_HEADERS, AGENT_FIELDS } from "../src/schema.mjs";

const V3_HEADERS = [
  "Name", "Title / Company", "LinkedIn (or profile URL)", "Recent Post (verbatim + link)",
  "Why Them", "Suggested Comment", "Suggested Intro DM",
  "Reached Out", "Replied", "Outcome", "Date Added", "Source Type", "Batch", "Notes",
  "Activity Date", "Activity Type", "Fit Score", "Last Verified", "Canonical Key",
  "Research Source", "Research Status",
  "Connection Status", "Reply Status", "Last Reply", "Follow-up Checked",
];

test("the current layout passes", () => {
  const r = checkLeadsLayout(LEADS_HEADERS);
  assert.equal(r.ok, true);
  assert.equal(r.message, "");
});

test("a v3 sheet is refused, and the refusal names the column and the fix", () => {
  const r = checkLeadsLayout(V3_HEADERS);
  assert.equal(r.ok, false);
  // The first divergence is D, where v3 promised a link inside the post cell
  // and v4 moved the link to its own column.
  assert.equal(r.mismatch.letter, "D");
  assert.equal(r.mismatch.found, "Recent Post (verbatim + link)");
  assert.equal(r.mismatch.expected, "Recent Post (verbatim + date)");
  assert.match(r.message, /old column layout/i);
  assert.match(r.message, /buildLeadSheet/);
  assert.match(r.message, /Extensions > Apps Script/);
});

test("an empty header row is 'not built yet', not 'wrong'", () => {
  // A blank Leads tab is where everybody starts. Refusing it would make the
  // first run of a brand-new sheet impossible.
  assert.equal(checkLeadsLayout([]).ok, true);
  assert.equal(checkLeadsLayout(["", "", ""]).ok, true);
  assert.equal(checkLeadsLayout(new Array(28).fill("")).ok, true);
});

test("a sheet missing only its trailing system headers is still patchable", () => {
  // This is exactly what ensureLeadsSchema exists for, and the guard must not
  // take that away: everything present agrees, the rest is simply absent.
  const partial = LEADS_HEADERS.slice(0, AGENT_FIELDS.length + 7);
  assert.equal(checkLeadsLayout(partial).ok, true);

  const gappy = LEADS_HEADERS.map((h, i) => (i >= 21 ? "" : h));
  assert.equal(checkLeadsLayout(gappy).ok, true);
});

test("a single renamed column is caught, not shrugged off", () => {
  const drifted = [...LEADS_HEADERS];
  drifted[12] = "Outcomes"; // someone edited a header by hand
  const r = checkLeadsLayout(drifted);
  assert.equal(r.ok, false);
  assert.equal(r.mismatch.letter, "M");
});

test("extra columns to the right of the layout are none of our business", () => {
  // People add their own scratch columns. That is fine; we only ever read and
  // write the ones we define.
  assert.equal(checkLeadsLayout([...LEADS_HEADERS, "My own notes", "CRM id"]).ok, true);
});

test("whitespace in a header is not a layout change", () => {
  assert.equal(checkLeadsLayout(LEADS_HEADERS.map((h) => `  ${h} `)).ok, true);
});

// --- the guard as the worker actually reaches it ---------------------------
//
// checkLeadsLayout being correct is worth nothing if nothing calls it. These
// drive the real readLeads/applyPlan against a stub Sheets client: no network,
// no credentials, but the same code path a live run takes.

import { readLeads, applyPlan, LeadsLayoutError } from "../src/sheet.mjs";

/** The two Sheets calls readLeads/applyPlan make, and a log of every write. */
function stubSheets(headerRowValues, dataRows = []) {
  const writes = [];
  return {
    writes,
    spreadsheets: {
      values: {
        get: async () => ({ data: { values: [[], [], headerRowValues, ...dataRows] } }),
        update: async (req) => { writes.push(req); return { data: {} }; },
        append: async (req) => { writes.push(req); return { data: {} }; },
        batchUpdate: async (req) => { writes.push(req); return { data: {} }; },
      },
    },
  };
}

test("readLeads refuses a v3 sheet instead of returning rows to write over", async () => {
  const sheets = stubSheets(V3_HEADERS, [["Carter Natale", "Founder @ Acme"]]);
  await assert.rejects(
    () => readLeads(sheets, "sheet-id"),
    (err) => {
      assert.ok(err instanceof LeadsLayoutError, `got ${err.name}`);
      assert.equal(err.mismatch.letter, "D");
      assert.match(err.message, /old column layout/i);
      return true;
    },
  );
  assert.equal(sheets.writes.length, 0, "a refused sheet must not be written to");
});

test("readLeads accepts the current layout and still reads its rows", async () => {
  const row = LEADS_HEADERS.map(() => "");
  row[0] = "Carter Natale";
  row[2] = "https://www.linkedin.com/in/carter-natale";
  const sheets = stubSheets(LEADS_HEADERS, [row]);
  const out = await readLeads(sheets, "sheet-id");
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].cells["Name"], "Carter Natale");
  assert.equal(out.headerRow, 3);
  // rawHeaders is what the sheet says, so the write guard checks the sheet and
  // not this module's own backfilled defaults.
  assert.deepEqual(out.rawHeaders, LEADS_HEADERS);
});

test("a blank Leads tab reads as empty rather than refusing", async () => {
  const sheets = stubSheets([], []);
  const out = await readLeads(sheets, "sheet-id");
  assert.deepEqual(out.rows, []);
  assert.deepEqual(out.rawHeaders, []);
});

test("applyPlan refuses too, so a caller that skipped readLeads cannot write blind", async () => {
  const sheets = stubSheets(V3_HEADERS);
  await assert.rejects(
    () => applyPlan(sheets, "sheet-id", { newRows: [{ cells: {} }], updates: [] }, { headers: V3_HEADERS }),
    (err) => err instanceof LeadsLayoutError,
  );
  assert.equal(sheets.writes.length, 0, "nothing may be written after a refusal");
});

test("applyPlan with the current headers writes normally", async () => {
  const sheets = stubSheets(LEADS_HEADERS);
  const cells = Object.fromEntries(LEADS_HEADERS.map((h) => [h, ""]));
  cells["Name"] = "Sam";
  const res = await applyPlan(sheets, "sheet-id", { newRows: [{ cells }], updates: [] }, { headers: LEADS_HEADERS });
  assert.equal(res.appended, 1);
  assert.ok(sheets.writes.length > 0);
});
