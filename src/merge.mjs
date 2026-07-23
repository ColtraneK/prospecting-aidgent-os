// merge.mjs — plan Google Sheet updates without touching human columns (H-N).
// Pure and fully testable.

import { HUMAN_FIELDS, LEADS_HEADERS } from "./schema.mjs";
import { canonicalKey, canonicalizeLinkedInUrl } from "./url.mjs";
import { dedupeCandidates } from "./dedupe.mjs";

// Agent fields the system refreshes on an EXISTING lead (never A/C, never H-N).
const REFRESHABLE_AGENT_FIELDS = [
  "Title / Company",
  "Recent Post (verbatim + link)",
  "Why Them",
  "Suggested Comment",
  "Suggested Intro DM",
];

/** Build the {header: value} map for a brand-new lead row (A:U). */
export function toLeadRow(candidate, opts = {}) {
  const { nowIso = new Date().toISOString(), sourceType = "LinkedIn", researchStatus = "New" } = opts;
  const activity = candidate.activity || {};
  const key = candidate.canonicalKey || canonicalKey({ url: candidate.url, name: candidate.name, company: candidate.company }).key;
  const cells = {};
  for (const h of LEADS_HEADERS) cells[h] = "";
  // Agent A-G
  cells["Name"] = candidate.name || "";
  cells["Title / Company"] = candidate.title_company || joinTitleCompany(candidate);
  cells["LinkedIn (or profile URL)"] = canonicalizeLinkedInUrl(candidate.url) || candidate.url || "";
  cells["Recent Post (verbatim + link)"] = candidate.recentPost || "";
  cells["Why Them"] = candidate.whyThem || "";
  cells["Suggested Comment"] = candidate.comment || "";
  cells["Suggested Intro DM"] = candidate.introDM || "";
  // Human H-N — seed only Date Added + Source Type on insert; the rest is yours.
  cells["Date Added"] = dateOnly(nowIso);
  cells["Source Type"] = sourceType;
  // System O-U
  cells["Activity Date"] = activity.date || "";
  cells["Activity Type"] = activity.type || "";
  cells["Fit Score"] = numOrBlank(candidate.score);
  cells["Last Verified"] = dateOnly(nowIso);
  cells["Canonical Key"] = key;
  cells["Research Source"] = candidate.researchSource || (activity.url ? "linkedin_activity" : "linkedin_profile");
  cells["Research Status"] = researchStatus;
  return cells;
}

/** Field updates for an EXISTING lead. Agent-refresh + system only. Never H-N. */
export function toRefreshSet(candidate, opts = {}) {
  const { nowIso = new Date().toISOString() } = opts;
  const activity = candidate.activity || {};
  const set = {};
  set["Title / Company"] = candidate.title_company || joinTitleCompany(candidate);
  set["Recent Post (verbatim + link)"] = candidate.recentPost || "";
  set["Why Them"] = candidate.whyThem || "";
  set["Suggested Comment"] = candidate.comment || "";
  set["Suggested Intro DM"] = candidate.introDM || "";
  set["Activity Date"] = activity.date || "";
  set["Activity Type"] = activity.type || "";
  set["Fit Score"] = numOrBlank(candidate.score);
  set["Last Verified"] = dateOnly(nowIso);
  set["Research Source"] = candidate.researchSource || (activity.url ? "linkedin_activity" : "linkedin_profile");
  set["Research Status"] = "Refreshed";
  for (const h of HUMAN_FIELDS) delete set[h];
  return set;
}

export function buildExistingIndex(existingSheet) {
  const index = new Map();
  const rows = (existingSheet && existingSheet.rows) || [];
  for (const row of rows) {
    const cells = row.cells || {};
    if (!cells["Name"] && !cells["LinkedIn (or profile URL)"]) continue;
    let key = String(cells["Canonical Key"] || "").trim();
    if (!key) {
      key = canonicalKey({
        url: cells["LinkedIn (or profile URL)"],
        name: cells["Name"],
        company: companyFromTitleCompany(cells["Title / Company"]),
      }).key;
    }
    if (key && !index.has(key)) index.set(key, row);
  }
  return index;
}

export function planSheetUpdate(existingSheet, scored, opts = {}) {
  const rejected = [];
  const acceptedCandidates = [];
  for (const c of scored) {
    if (c.accepted === false) rejected.push({ candidate: c, reason: c.rejectedReason || "rejected" });
    else acceptedCandidates.push(c);
  }

  const { kept, duplicates } = dedupeCandidates(acceptedCandidates);
  const duplicatesSkipped = duplicates.map((d) => ({ candidate: d.candidate, reason: d.reason }));

  const index = buildExistingIndex(existingSheet);
  const newRows = [];
  const updates = [];

  for (const cand of kept) {
    const key = canonicalKey({ url: cand.url, name: cand.name, company: cand.company }).key;
    const match = key ? index.get(key) : null;
    if (match) {
      updates.push({ rowNumber: match.rowNumber, canonicalKey: key, set: toRefreshSet({ ...cand, canonicalKey: key }, opts) });
    } else {
      newRows.push({ canonicalKey: key, cells: toLeadRow({ ...cand, canonicalKey: key }, opts) });
    }
  }

  return {
    newRows, updates, duplicatesSkipped, rejected,
    counts: {
      inspected: scored.length,
      newLeads: newRows.length,
      updatedLeads: updates.length,
      duplicatesSkipped: duplicatesSkipped.length,
      rejected: rejected.length,
    },
  };
}

function joinTitleCompany(c) {
  const t = c.title || "", co = c.company || "";
  if (t && co) return `${t} @ ${co}`;
  return t || co || "";
}
function companyFromTitleCompany(tc) {
  const s = String(tc || "");
  const at = s.split(/\s+@\s+/);
  return at.length > 1 ? at[at.length - 1] : "";
}
function dateOnly(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function numOrBlank(v) {
  return v === null || v === undefined || v === "" ? "" : Number(v);
}

export { REFRESHABLE_AGENT_FIELDS, HUMAN_FIELDS };
