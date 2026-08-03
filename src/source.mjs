// Validate candidates discovered through public web search. Search snippets are
// provenance for nomination only; they never become profile facts.

import { canonicalizeLinkedInUrl } from "./url.mjs";

const PLACEHOLDER = /\b(example|sample|placeholder|your-name|firstname|lastname|john-doe|jane-doe|test-user)\b/i;

export function parseSourceCandidates(raw, { existingKeys = new Set(), nowIso = new Date().toISOString() } = {}) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.candidates) ? raw.candidates : null;
  if (!list) return { rows: [], rejected: [{ reason: "expected an array or { candidates: [...] }", row: raw }] };
  const rows = [], rejected = [], seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== "object") { rejected.push({ row: item, reason: "not an object" }); continue; }
    const name = clean(item.name, 120);
    const url = canonicalizeLinkedInUrl(item.url || item.profile_url || item.linkedin_url);
    const sourceUrl = clean(item.source_url || item.result_url, 1000);
    if (!name) { rejected.push({ row: item, reason: "name is required" }); continue; }
    if (!url || PLACEHOLDER.test(url)) { rejected.push({ row: item, reason: "a real linkedin.com/in/ URL is required" }); continue; }
    if (!/^https?:\/\//i.test(sourceUrl)) { rejected.push({ row: item, reason: "source_url is required for provenance" }); continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    if (existingKeys.has(url) && !item.refresh) {
      rejected.push({ row: item, reason: "already in the sheet; use refresh=true only for an intentional recheck" });
      continue;
    }
    rows.push({
      key: url,
      name,
      url,
      source_url: sourceUrl,
      source_query: clean(item.source_query || item.query, 500),
      source_snippet: clean(item.source_snippet || item.snippet, 1000),
      why_nominated: clean(item.why_nominated || item.why, 500),
      refresh: item.refresh === true,
      discovered_at: clean(item.discovered_at, 50) || nowIso,
    });
  }
  return { rows, rejected };
}

function clean(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}
