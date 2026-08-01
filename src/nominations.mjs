// nominations.mjs — the gate between the agent's judgement and the worker's
// browser.
//
// v6 inverts v5's rule on purpose: the AGENT judges who is worth opening, and
// the CODE verifies the evidence. So the agent hands over a nominations file —
// "open these people, here is why" — and this module refuses anything the
// worker could not verify by opening it: a row without a real /in/ URL, a
// placeholder slug that means an example was filled in instead of a page read,
// a person who is already in the sheet.
//
// Nothing here writes a row. A nomination only earns the worker OPENING the
// profile; every fact that reaches the sheet is captured first-hand by the
// worker's own browser (see runInspect in worker.mjs).

import { canonicalizeLinkedInUrl, canonicalKey } from "./url.mjs";

const PROFILE_URL = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#\s]+/i;

// Slugs that mean the agent filled in an example instead of reading a page.
const PLACEHOLDER = /\b(example|sample|placeholder|your-name|firstname|lastname|john-doe|jane-doe|test-user)\b/i;

/**
 * @param {unknown} raw  parsed JSON: an array, or { nominations: [...] }
 * @param {{existingKeys?: Set<string>}} opts  canonical keys already in the sheet
 * @returns {{rows: Array, rejected: Array<{row: unknown, reason: string}>}}
 */
export function parseNominations(raw, { existingKeys = new Set() } = {}) {
  const list = Array.isArray(raw) ? raw
    : Array.isArray(raw?.nominations) ? raw.nominations
      : Array.isArray(raw?.people) ? raw.people : null;
  if (!list) {
    return { rows: [], rejected: [{ row: raw, reason: "not a JSON array of nominations (or { nominations: [...] })" }] };
  }

  const rows = [];
  const rejected = [];
  const seen = new Set();

  for (const item of list) {
    if (!item || typeof item !== "object") {
      rejected.push({ row: item, reason: "not an object" });
      continue;
    }
    const url = String(item.url || item.profileUrl || "").trim();
    const name = String(item.name || "").replace(/\s+/g, " ").trim();

    if (!PROFILE_URL.test(url)) {
      rejected.push({ row: item, reason: "no linkedin.com/in/ profile URL — a row without one cannot be verified" });
      continue;
    }
    if (PLACEHOLDER.test(url)) {
      rejected.push({ row: item, reason: "the profile URL looks like an example, not a page that was read" });
      continue;
    }
    if (!name) {
      rejected.push({ row: item, reason: "no name" });
      continue;
    }
    if (name.length > 120) {
      rejected.push({ row: item, reason: "name is too long to be a name" });
      continue;
    }

    const canon = canonicalizeLinkedInUrl(url);
    if (!canon) {
      rejected.push({ row: item, reason: "profile URL could not be canonicalized" });
      continue;
    }
    if (seen.has(canon)) continue; // the same person twice is not two people
    seen.add(canon);
    // Already researched: their row exists, and inspecting them again spends
    // budget on a person the sheet already carries.
    const { key } = canonicalKey({ url: canon, name });
    if (key && existingKeys.has(key)) {
      rejected.push({ row: item, reason: "already in the sheet — nominate net-new people" });
      continue;
    }

    rows.push({
      name,
      url: canon,
      whyNominated: str(item.why_nominated || item.whyNominated),
      sourceUrl: str(item.source_url || item.sourceUrl),
    });
  }

  return { rows, rejected };
}

/** Human-readable summary for the console. Never silently drops anything. */
export function describeNominations({ rows, rejected }) {
  const lines = [`Nominations: ${rows.length} accepted for inspection.`];
  if (rejected.length) {
    lines.push(`${rejected.length} rejected:`);
    for (const r of rejected.slice(0, 10)) {
      const who = r.row && typeof r.row === "object" ? (r.row.name || r.row.url || "(unnamed)") : String(r.row);
      lines.push(`  - ${who}: ${r.reason}`);
    }
    if (rejected.length > 10) lines.push(`  ...and ${rejected.length - 10} more`);
  }
  return lines.join("\n");
}

function str(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, 500);
}
