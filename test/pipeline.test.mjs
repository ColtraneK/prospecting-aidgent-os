import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline } from "../src/pipeline.mjs";
import { buildValueUpdates } from "../src/sheetPlan.mjs";
import { HUMAN_FIELDS } from "../src/schema.mjs";

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
  assert.ok(sam["Recent Post (verbatim + link)"].length > 0);
  assert.match(sam["Recent Post (verbatim + link)"], /linkedin\.com\/feed\/update/);
  assert.equal(sam["Canonical Key"], "https://www.linkedin.com/in/sam-rivera-fake");

  // Recency: Sam's activity is within 7 days -> recent boost recorded.
  const samScored = scored.find((s) => s.name === "Sam Rivera" && s.accepted);
  assert.equal(samScored.recent, true);

  // Rejected reason references why (geography or title).
  assert.match(plan.rejected[0].reason, /geography|buyer-title/i);
});

test("existing human tracking (H:N) is preserved after applying the refresh", () => {
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

  // And the concrete Sheets writes never target H:N.
  const { cellUpdates } = buildValueUpdates(plan);
  for (const c of cellUpdates) assert.ok(!/![H-N]\d/.test(c.range), `${c.range} must avoid H:N`);
});
