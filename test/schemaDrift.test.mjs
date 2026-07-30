// Drift guard: src/schema.mjs is the single source of truth for the Leads
// columns, but the Apps Script builder and SHEET.md restate them. If someone
// adds a column in one place and not the others, the sheet and the worker stop
// agreeing — silently, and only on a live run. These tests fail instead.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEADS_HEADERS, AGENT_FIELDS, HUMAN_FIELDS, SYSTEM_FIELDS, FOLLOWUP_FIELDS, COLS, RUN_LOG_HEADERS } from "../src/schema.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gs = fs.readFileSync(path.join(REPO_ROOT, "sheet", "BuildLeadSheet.gs"), "utf8");

/** Pull the column titles out of the builder's LEADS_COLS literal. */
function gsLeadsCols() {
  const block = gs.match(/var LEADS_COLS = \[([\s\S]*?)\n\];/);
  assert.ok(block, "LEADS_COLS not found in BuildLeadSheet.gs");
  return [...block[1].matchAll(/\[\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** Pull a `var NAME = [...]` string-array literal out of the builder. */
function gsArray(name) {
  const block = gs.match(new RegExp(`var ${name} = \\[([^\\]]*)\\]`));
  assert.ok(block, `${name} not found in BuildLeadSheet.gs`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("the Apps Script builder's columns match src/schema.mjs exactly", () => {
  assert.deepEqual(gsLeadsCols(), LEADS_HEADERS);
});

test("the builder groups columns into the same agent/human/system bands", () => {
  const block = gs.match(/var LEADS_COLS = \[([\s\S]*?)\n\];/)[1];
  const groups = [...block.matchAll(/\[\s*"([^"]+)"[^\]]*"(agent|human|system)"\s*\]/g)];
  assert.equal(groups.length, LEADS_HEADERS.length);
  for (const [, title, group] of groups) {
    const expected = AGENT_FIELDS.includes(title) ? "agent" : HUMAN_FIELDS.includes(title) ? "human" : "system";
    assert.equal(group, expected, `${title} is grouped as "${group}", expected "${expected}"`);
  }
});

test("the follow-up columns land in Y:AB and are the last four", () => {
  assert.deepEqual(FOLLOWUP_FIELDS.map((f) => COLS[f].letter), ["Y", "Z", "AA", "AB"]);
  assert.deepEqual(LEADS_HEADERS.slice(-4), FOLLOWUP_FIELDS);
  for (const f of FOLLOWUP_FIELDS) assert.ok(SYSTEM_FIELDS.includes(f), `${f} must be a system field`);
});

test('"Connection" is an offered Source Type, so warm rows are labelled consistently', () => {
  const types = gsArray("SOURCE_TYPES");
  assert.ok(types.includes("Connection"), types.join(", "));
  assert.ok(types.includes("LinkedIn") && types.includes("Public web"));
});

test("the builder's follow-up dropdowns match the values the planner writes", () => {
  // followup.mjs can only ever emit these; a dropdown that disagrees would show
  // the user a validation warning on a value the system itself wrote.
  assert.deepEqual(gsArray("CONNECTION_STATUS"), ["connected", "pending", "not_connected", "unknown"]);
  assert.deepEqual(gsArray("REPLY_STATUS"), ["replied", "no_reply", "unknown"]);
});

test("the builder's Run Log headers match runlog.mjs", () => {
  assert.deepEqual(gsArray("RUN_LOG_HEADERS"), RUN_LOG_HEADERS);
});

test("no column name is duplicated (COLS would silently collapse them)", () => {
  assert.equal(new Set(LEADS_HEADERS).size, LEADS_HEADERS.length);
  assert.equal(Object.keys(COLS).length, LEADS_HEADERS.length);
});

test("the builder refuses to rename columns out from under existing leads", () => {
  // The worker's own refusal message sends people to buildAidgentOsSheet. If
  // the builder then relabels a populated old-layout tab, the advice we give is
  // the thing that destroys their tracking — so the guard has to stay, and it
  // has to run before any header is written.
  assert.match(gs, /function assertRelabelIsSafe_\(/, "the relabel guard is gone");
  const inEnsure = gs.match(/function ensureLeads_\([\s\S]*?\n\}/)[0];
  assert.match(inEnsure, /assertRelabelIsSafe_\(sh\)/, "ensureLeads_ no longer calls the guard");
  const guardAt = inEnsure.indexOf("assertRelabelIsSafe_(sh)");
  const writeAt = inEnsure.indexOf("setValues([headers])");
  assert.ok(guardAt > -1 && writeAt > -1 && guardAt < writeAt,
    "the guard must run BEFORE the header row is written");
});

test("the builder never hardcodes a Leads column letter into a formula", () => {
  // The Start Here dashboard used to count Leads!H and Leads!I directly. v4
  // moved those two columns three to the right, and a hardcoded letter would
  // have gone on counting the wrong column without erroring.
  const formulas = [...gs.matchAll(/"=[^"]*Leads![A-Z]+\d*[^"]*"/g)].map((m) => m[0]);
  assert.deepEqual(formulas, [], `hardcoded Leads columns in a formula: ${formulas.join(", ")}`);
  assert.match(gs, /function letterOf_\(/, "letterOf_ is how formulas must resolve columns");
});

test("rebuilding clears the previous layout's validation instead of layering on top", () => {
  // v4 moved every column after D. A builder that only ADDS validation where a
  // type asks for it leaves the old layout's rules in place, so a rebuilt v3
  // sheet grows tickboxes down "Why Them" and "Suggested Comment" and a stale
  // Outcome dropdown down "Suggested Intro DM" — the agent's own output columns
  // rendered as things you are meant to tick. Caught on the real template.
  const loop = gs.match(/for \(var c = 0; c < n; c\+\+\)[\s\S]*?\n  \}/)[0];
  assert.match(loop, /body\.setDataValidation\(null\)/,
    "the per-column loop must clear inherited data validation before applying its own");
  assert.match(loop, /body\.setNumberFormat\(/,
    "the per-column loop must set a number format unconditionally, not only for dates");
  const clearAt = loop.indexOf("setDataValidation(null)");
  const applyAt = loop.indexOf("requireCheckbox()");
  assert.ok(clearAt > -1 && applyAt > -1 && clearAt < applyAt,
    "the clear must happen BEFORE this column's own validation is applied");
});
