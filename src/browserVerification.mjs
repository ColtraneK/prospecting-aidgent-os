// Contract between Codex Browser and the deterministic write path. The browser
// is read-only; it records what was visible and never performs an outward action.

import { canonicalizeLinkedInUrl } from "./url.mjs";

const CONNECTIONS = new Set(["1st", "2nd", "3rd+", "Pending", "Unknown"]);

export function parseBrowserVerifications(raw, { candidates = [] } = {}) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.verifications) ? raw.verifications : null;
  const allowed = new Set(candidates.map((c) => canonicalizeLinkedInUrl(c.url || c.key)).filter(Boolean));
  if (!list) return { rows: [], rejected: [{ row: raw, reason: "expected an array or { verifications: [...] }" }] };
  const rows = [], rejected = [], seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== "object") { rejected.push({ row: item, reason: "not an object" }); continue; }
    const url = canonicalizeLinkedInUrl(item.url || item.key || item.profile_url);
    const status = normalizeConnection(item.connection_status || item.connectionStatus || item.degree);
    if (!url || (allowed.size && !allowed.has(url))) { rejected.push({ row: item, reason: "profile was not in this run" }); continue; }
    if (seen.has(url)) continue;
    if (!CONNECTIONS.has(status)) { rejected.push({ row: item, reason: "connection_status must be 1st, 2nd, 3rd+, Pending, or Unknown" }); continue; }
    if (item.blocker) { rejected.push({ row: item, reason: `browser blocker: ${String(item.blocker).slice(0, 200)}` }); continue; }
    seen.add(url);
    rows.push({
      key: url,
      url,
      name: clean(item.name, 120),
      headline: clean(item.headline, 500),
      title: clean(item.title || item.headline, 500),
      company: clean(item.company, 300),
      location: clean(item.location, 300),
      degree: status === "3rd+" ? "3rd" : ["1st", "2nd"].includes(status) ? status : clean(item.degree, 20),
      browser_connection_status: status,
      connection_checked_on: dateOnly(item.checked_at || item.checkedAt || new Date().toISOString()),
      profile_notes: clean(item.profile_notes || item.notes, 1000),
      browser_verified: true,
    });
  }
  return { rows, rejected };
}

export function mergeBrowserEvidence(candidates, verifications) {
  const byKey = new Map(verifications.map((v) => [v.url, v]));
  return candidates.map((candidate) => {
    const v = byKey.get(candidate.url);
    return v ? { ...candidate, ...v, name: v.name || candidate.name } : { ...candidate, browser_verified: false };
  });
}

function normalizeConnection(v) {
  const s = String(v || "Unknown").trim().toLowerCase();
  if (/^1(st)?\b|connected/.test(s)) return "1st";
  if (/^2(nd)?\b/.test(s)) return "2nd";
  if (/^3(rd)?\+?\b/.test(s)) return "3rd+";
  if (/pending|request sent/.test(s)) return "Pending";
  return "Unknown";
}
function clean(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
function dateOnly(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); }
