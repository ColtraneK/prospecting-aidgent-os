// observed.mjs — accept rows an agent read off a LinkedIn page with its own
// browser, and refuse anything it could have made up.
//
// This is the seam that lets an AI do the looking without letting it do the
// deciding. The agent is good at reading a page that changed shape overnight;
// it is not allowed to judge fit, invent a person, or write a row. So the only
// thing we take from it is a claim of the form "this profile URL was on the
// page, and the visible name next to it was X" — and then the worker goes and
// opens that URL itself.
//
// A row without a real /in/ URL is not evidence of anything, so it is dropped
// with a reason rather than passed along.

import { canonicalizeLinkedInUrl } from "./url.mjs";

const PROFILE_URL = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#\s]+/i;

// Slugs that mean the agent filled in an example instead of reading a page.
const PLACEHOLDER = /\b(example|sample|placeholder|your-name|firstname|lastname|john-doe|jane-doe|test-user)\b/i;

/**
 * @param {unknown} raw  parsed JSON: an array, or { people: [...] }
 * @returns {{rows: Array, rejected: Array<{row: unknown, reason: string}>}}
 */
export function parseObserved(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.people) ? raw.people : null;
  if (!list) {
    return { rows: [], rejected: [{ row: raw, reason: "not a JSON array of people (or { people: [...] })" }] };
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

    // Everything below the URL and name is a hint the worker may overwrite with
    // what it sees for itself. We keep it only so an unreadable profile page
    // still leaves something honest in the row.
    rows.push({
      name,
      url: canon,
      title: str(item.title || item.headline),
      location: str(item.location),
      observedBy: "agent",
    });
  }

  return { rows, rejected };
}

/** Human-readable summary for the console. Never silently drops anything. */
export function describeObserved({ rows, rejected }) {
  const lines = [`Agent-read: ${rows.length} row(s) accepted.`];
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
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, 300);
}
