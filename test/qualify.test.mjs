// The v6 write path: the agent's judgement, checked in code before it becomes
// cells. Only fit=true rows are written; a failing draft is reported and never
// written; K-Q are untouched; a refresh never blanks I/J. Grounding runs on
// the merge path, so qualify goes THROUGH the validator, not around it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDecisions, planQualify, formatRefused } from "../src/qualify.mjs";
import { buildValueUpdates } from "../src/sheetPlan.mjs";
import { HUMAN_FIELDS, COLS } from "../src/schema.mjs";

const KEY = "https://www.linkedin.com/in/dara-okonjo";
const POST = "Capacity is the constraint nobody budgets for, and every ops plan pretends otherwise.";

const evidence = [{
  key: KEY,
  name: "Dara Okonjo",
  url: KEY,
  why_nominated: "wrote about capacity this week",
  headline: "Fractional COO for lean advisory firms",
  title: "Fractional COO for lean advisory firms",
  company: "",
  location: "Austin, Texas, United States",
  degree: "2nd",
  post: { summary: POST, date: "2026-07-30", url: "https://www.linkedin.com/feed/update/urn:li:activity:1/", type: "post" },
  activity_status: "captured",
  disqualified: null,
}];

const decision = {
  key: KEY,
  fit: true,
  score: 82,
  why_them: "Ops leader at a firm our ICP describes; posted about the exact pain this week.",
  suggested_comment: `"Capacity is the constraint nobody budgets for" — this matches what I keep seeing. Curious how you frame it with clients.`,
  suggested_intro: `Hi Dara, your line that capacity is the constraint nobody budgets for stuck with me — would value your take on where firms get it most wrong.`,
};

const emptySheet = { headers: [], rows: [] };
const NOW = Date.parse("2026-08-01T12:00:00Z");

test("a fit=true decision with grounded drafts becomes one full row, A-J + R-X", () => {
  const { plan, counts } = planQualify({
    persona: {}, evidence, decisions: [decision], existingSheet: emptySheet, nowMs: NOW, nowIso: "2026-08-01T12:00:00Z",
  });
  assert.equal(counts.newLeads, 1);
  const cells = plan.newRows[0].cells;
  assert.equal(cells["Name"], "Dara Okonjo");
  assert.match(cells["Recent Post (verbatim + date)"], /Capacity is the constraint/);
  assert.match(cells["Post Link"], /urn:li:activity:1/);
  assert.equal(cells["Degree"], "2nd");
  assert.equal(cells["Score (1-10)"], 8, "G is the agent's 0-100 score at reading scale");
  assert.equal(cells["Fit Score"], 82, "T carries the agent's raw score");
  assert.equal(cells["Why Them"], decision.why_them, "H is the agent's rationale");
  assert.ok(cells["Suggested Comment"].length, "a grounded comment is written");
  assert.ok(cells["Suggested Intro DM"].length, "a grounded DM is written");
  // Human columns are seeded once (Date Added, Source Type) and no more.
  assert.equal(cells["Reached Out"], "");
  assert.equal(cells["Notes"], "");
});

test("fit=false rows are skipped, never written", () => {
  const { plan, skipped } = planQualify({
    persona: {}, evidence, decisions: [{ ...decision, fit: false, score: 0, why_them: "" }],
    existingSheet: emptySheet, nowMs: NOW,
  });
  assert.equal(plan.newRows.length, 0);
  assert.equal(skipped, 1);
});

test("a decision with no captured evidence behind it is refused — invented people have no key", () => {
  const { plan, refused } = planQualify({
    persona: {}, evidence, decisions: [{ ...decision, key: "https://www.linkedin.com/in/nobody-inspected" }],
    existingSheet: emptySheet, nowMs: NOW,
  });
  assert.equal(plan.newRows.length, 0);
  assert.equal(refused.length, 1);
  assert.match(refused[0].reason, /no captured evidence/);
  assert.match(formatRefused(refused), /refused and NOT written/);
});

test("the agent cannot overrule a hard disqualifier", () => {
  const persona = { hard_exclusions: ["fractional coo"] };
  const { plan, refused } = planQualify({
    persona, evidence, decisions: [decision], existingSheet: emptySheet, nowMs: NOW,
  });
  assert.equal(plan.newRows.length, 0);
  assert.match(refused[0].reason, /hard-disqualified/);
});

test("a disqualification recorded at inspect time sticks at qualify time", () => {
  const dq = [{ ...evidence[0], disqualified: { reason: "matched hard exclusion: recruiter" } }];
  const { refused } = planQualify({
    persona: {}, evidence: dq, decisions: [decision], existingSheet: emptySheet, nowMs: NOW,
  });
  assert.equal(refused.length, 1);
  assert.match(refused[0].reason, /recruiter/);
});

test("an ungrounded draft is blanked and reported, and the row still lands with its evidence", () => {
  const bad = {
    ...decision,
    suggested_comment: "Great post! Love your energy and your journey.",
    suggested_intro: "Hi Dara, I came across your amazing profile and had to reach out.",
  };
  const { plan } = planQualify({
    persona: {}, evidence, decisions: [bad], existingSheet: emptySheet, nowMs: NOW,
  });
  assert.equal(plan.newRows.length, 1, "the evidence row lands; only the drafts are blanked");
  const cells = plan.newRows[0].cells;
  assert.equal(cells["Suggested Comment"], "");
  assert.equal(cells["Suggested Intro DM"], "");
  assert.equal(plan.outreachRejected.length, 1);
  assert.ok(plan.outreachRejected[0].rejected.length >= 2, "both failing drafts are reported for redraft");
});

test("re-qualifying someone already in the sheet refreshes their row and never blanks I/J or touches K-Q", () => {
  const existing = {
    headers: [],
    rows: [{
      rowNumber: 4,
      cells: {
        "Name": "Dara Okonjo",
        "LinkedIn (or profile URL)": KEY,
        "Canonical Key": KEY,
        "Suggested Comment": "an earlier, grounded comment",
        "Suggested Intro DM": "an earlier, grounded DM",
        "Reached Out": "yes",
        "Notes": "met at the conf",
      },
    }],
  };
  const noDrafts = { ...decision, suggested_comment: "", suggested_intro: "" };
  const { plan } = planQualify({
    persona: {}, evidence, decisions: [noDrafts], existingSheet: existing, nowMs: NOW,
  });
  assert.equal(plan.newRows.length, 0);
  assert.equal(plan.updates.length, 1);
  const set = plan.updates[0].set;
  assert.ok(!("Suggested Comment" in set), "a blank draft leaves the earlier one alone");
  assert.ok(!("Suggested Intro DM" in set), "a blank draft leaves the earlier one alone");
  for (const h of HUMAN_FIELDS) assert.ok(!(h in set), `refresh must not touch human column ${h}`);
  // And the concrete cell ranges never cross into K-Q.
  const { cellUpdates } = buildValueUpdates(plan);
  for (const u of cellUpdates) {
    assert.ok(!new RegExp(`![${COLS["Reached Out"].letter}-${COLS["Notes"].letter}]\\d`).test(u.range),
      `update range reaches a human column: ${u.range}`);
  }
});

test("parseDecisions refuses shapes that are not judgements", () => {
  const { decisions, rejected } = parseDecisions([
    decision,
    { key: KEY, fit: "yes" },
    { key: KEY, fit: true, score: 900, why_them: "x" },
    { key: KEY, fit: true, score: 50, why_them: "" },
    { fit: true, score: 50, why_them: "no key" },
  ]);
  assert.equal(decisions.length, 1);
  assert.equal(rejected.length, 4);
});

test("parseDecisions accepts { decisions: [...] } and canonicalizes keys", () => {
  const { decisions } = parseDecisions({ decisions: [{ ...decision, key: "https://linkedin.com/in/Dara-Okonjo?utm=1" }] });
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].key, KEY);
});
