import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline } from "../src/pipeline.mjs";
import { buildValueUpdates } from "../src/sheetPlan.mjs";
import { HUMAN_FIELDS, COLS } from "../src/schema.mjs";

const humanLetters = new Set(HUMAN_FIELDS.map((h) => COLS[h].letter));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "dry-run.json"), "utf8"));

const persona = {
  persona: "Example", version: 1, business: { name: "x", website: "y" },
  offer: "o", customer_outcome: "c",
  target_industries: ["Professional services"],
  company_sizes: ["1-10 employees", "11-50 employees"],
  buyer_titles: ["Founder", "Owner", "Managing Director", "Operations Lead"],
  geography: { include: ["United States", "Canada"], exclude: ["India"] },
  buying_signals: ["scaling operations", "operations busywork"],
  exclusions: ["Students", "Job seekers", "Recruiters"],
  opener_voice: "warm", search_keywords: ["operations", "founder"],
  research_sources: ["linkedin_profile"], sheet_id: "X", created: "2026-07-23", last_updated: "2026-07-23",
};

const nowMs = Date.parse(fx.nowIso);

test("dry-run fixture: 1 new, 1 duplicate, 1 refreshed existing, 1 rejected", () => {
  const { scored, plan, counts } = runPipeline({
    persona, existingSheet: fx.existingSheet, candidates: fx.candidates, nowMs, nowIso: fx.nowIso,
  });

  assert.equal(counts.newLeads, 1, "one new lead (Sam)");
  assert.equal(counts.updatedLeads, 1, "one refreshed existing lead (Dana)");
  assert.equal(counts.duplicatesSkipped, 1, "one within-batch duplicate (second Sam)");
  assert.equal(counts.rejected, 1, "one rejected out-of-ICP candidate (Riya)");

  // New lead carries evidence-based Why Them + comment + intro DM (non-empty, not fabricated).
  const sam = plan.newRows[0].cells;
  assert.equal(sam["Name"], "Sam Rivera");
  assert.ok(sam["Why Them"].length > 0);
  assert.ok(sam["Suggested Comment"].length > 0, "recent activity yields a suggested comment");
  assert.ok(sam["Suggested Intro DM"].length > 0);
  // Sam's post is within 7 days -> verbatim recent post + link lands in column D.
  assert.ok(sam["Recent Post (verbatim + date)"].length > 0);
  // The permalink lives in its own column now, and D no longer carries it.
  assert.equal(sam["Post Link"], "https://www.linkedin.com/feed/update/urn:li:activity:1111");
  assert.ok(!sam["Recent Post (verbatim + date)"].includes("linkedin.com"), sam["Recent Post (verbatim + date)"]);
  // Degree observed on the card, and the 1-10 score derived from the raw one.
  assert.equal(sam["Degree"], "2nd");
  assert.equal(sam["Score (1-10)"], Math.max(1, Math.min(10, Math.round(Number(sam["Fit Score"]) / 10))));
  assert.equal(sam["Canonical Key"], "https://www.linkedin.com/in/sam-rivera-fake");

  // Recency: Sam's activity is within 7 days -> recent boost recorded.
  const samScored = scored.find((s) => s.name === "Sam Rivera" && s.accepted);
  assert.equal(samScored.recent, true);

  // Rejected reason references why (geography or title).
  assert.match(plan.rejected[0].reason, /geography|buyer-title/i);
});

test("existing human tracking (K:Q) is preserved after applying the refresh", () => {
  const { plan } = runPipeline({ persona, existingSheet: fx.existingSheet, candidates: fx.candidates, nowMs, nowIso: fx.nowIso });
  const update = plan.updates[0];
  // The update set never contains a human field.
  for (const h of HUMAN_FIELDS) assert.ok(!(h in update.set));

  // Simulate applying: start from existing cells, overlay the set, confirm human values intact.
  const before = fx.existingSheet.rows.find((r) => r.rowNumber === update.rowNumber).cells;
  const after = { ...before, ...update.set };
  assert.equal(after["Reached Out"], "TRUE");
  assert.equal(after["Replied"], "TRUE");
  assert.equal(after["Outcome"], "Positive");
  assert.equal(after["Batch"], "B1");
  assert.equal(after["Notes"], "Met at conference; warm.");
  // agent/system fields did refresh
  assert.equal(after["Research Status"], "Refreshed");
  assert.equal(after["Activity Date"], "2026-07-22");

  // And the concrete Sheets writes never target the human band.
  const { cellUpdates } = buildValueUpdates(plan);
  for (const c of cellUpdates) {
    const col = c.range.match(/^Leads!([A-Z]+)/)[1];
    assert.ok(!humanLetters.has(col), `${c.range} must avoid the human band K:Q`);
  }
});
