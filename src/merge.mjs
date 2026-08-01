// merge.mjs — plan Google Sheet updates without touching human columns (K-Q).
// Pure and fully testable.

import { HUMAN_FIELDS, LEADS_HEADERS } from "./schema.mjs";
import { scoreOutOf10 } from "./evidence.mjs";
import { canonicalKey, canonicalizeLinkedInUrl } from "./url.mjs";
import { dedupeCandidates } from "./dedupe.mjs";
import { enforceOutreach } from "./outreach.mjs";

// Agent fields the system refreshes on an EXISTING lead (never A/C, never K-Q).
const REFRESHABLE_AGENT_FIELDS = [
  "Title / Company",
  "Recent Post (verbatim + date)",
  "Post Link",
  "Degree",
  "Score (1-10)",
  "Why Them",
  "Suggested Comment",
  "Suggested Intro DM",
];

/**
 * The last gate before columns I and J become cells.
 *
 * Every write path funnels through toLeadRow/toRefreshSet, so putting the
 * validator here means no drafted message reaches the sheet unchecked by any
 * route — qualify goes through it, and nothing goes around it. A draft that
 * fails is blanked and the reason is attached to the row for the report. It
 * is never repaired: a message this code rewrote is a message nobody wrote.
 *
 * Note what is NOT done here. The reason does not go into Notes (column Q).
 * K–Q are the person's own columns and the system does not write them, no
 * matter how useful the note would be.
 */
function checkedOpeners(candidate) {
  return enforceOutreach({
    name: candidate.name || "",
    postText: candidate.recentPost || "",
    comment: candidate.comment || "",
    dm: candidate.introDM || "",
  });
}

/** Build the {header: value} map for a brand-new lead row (A:AB). */
export function toLeadRow(candidate, opts = {}) {
  const { nowIso = new Date().toISOString(), sourceType = "LinkedIn", researchStatus = "New" } = opts;
  const activity = candidate.activity || {};
  const key = candidate.canonicalKey || canonicalKey({ url: candidate.url, name: candidate.name, company: candidate.company }).key;
  const cells = {};
  for (const h of LEADS_HEADERS) cells[h] = "";
  // Agent A-J
  cells["Name"] = candidate.name || "";
  cells["Title / Company"] = candidate.title_company || joinTitleCompany(candidate);
  cells["LinkedIn (or profile URL)"] = canonicalizeLinkedInUrl(candidate.url) || candidate.url || "";
  cells["Recent Post (verbatim + date)"] = candidate.recentPost || "";
  cells["Post Link"] = candidate.postLink || "";
  cells["Degree"] = candidate.degree || "";
  cells["Score (1-10)"] = scoreOutOf10(candidate.score);
  cells["Why Them"] = candidate.whyThem || "";
  const openers = checkedOpeners(candidate);
  cells["Suggested Comment"] = openers.comment;
  cells["Suggested Intro DM"] = openers.dm;
  // Human K-Q — seed only Date Added + Source Type on insert; the rest is yours.
  // A person found among your existing connections is labelled "Connection" so
  // you can tell warm rows from cold ones at a glance.
  cells["Date Added"] = dateOnly(nowIso);
  cells["Source Type"] = candidate.sourceType || (candidate.fromConnection ? "Connection" : sourceType);
  // System R-AB
  cells["Activity Date"] = activity.date || "";
  cells["Activity Type"] = activity.type || "";
  cells["Fit Score"] = numOrBlank(candidate.score);
  cells["Last Verified"] = dateOnly(nowIso);
  cells["Canonical Key"] = key;
  cells["Research Source"] = candidate.researchSource || (activity.url ? "linkedin_activity" : "linkedin_profile");
  cells["Research Status"] = researchStatus;
  return cells;
}

/** Field updates for an EXISTING lead. Agent-refresh + system only. Never K-Q. */
export function toRefreshSet(candidate, opts = {}) {
  const { nowIso = new Date().toISOString() } = opts;
  const activity = candidate.activity || {};
  const set = {};
  set["Title / Company"] = candidate.title_company || joinTitleCompany(candidate);
  set["Recent Post (verbatim + date)"] = candidate.recentPost || "";
  set["Post Link"] = candidate.postLink || "";
  // Degree is a stable fact about the relationship, not something this run
  // re-derives. A pass that did not see the badge leaves it alone rather than
  // erasing a degree an earlier pass captured.
  if (candidate.degree) set["Degree"] = candidate.degree;
  set["Score (1-10)"] = scoreOutOf10(candidate.score);
  set["Why Them"] = candidate.whyThem || "";
  // I and J are the ONE pair of agent columns a refresh may not blank.
  //
  // Every other agent column is re-derived from this run's own observations,
  // so overwriting is correct. These two are not: assigning "" here would mean
  // a later qualify silently erased the drafted comment and DM of every person
  // it refreshed — deleting the only cells the person was told to act on. So a
  // blank leaves them alone, exactly as Degree does above.
  const openers = checkedOpeners(candidate);
  if (openers.comment) set["Suggested Comment"] = openers.comment;
  if (openers.dm) set["Suggested Intro DM"] = openers.dm;
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
  // Drafted messages that were blanked, so the run can say so out loud. This is
  // reported to the agent, not written into the person's Notes column.
  const outreachRejected = [];

  for (const cand of kept) {
    const key = canonicalKey({ url: cand.url, name: cand.name, company: cand.company }).key;
    const match = key ? index.get(key) : null;
    const check = checkedOpeners(cand);
    if (check.rejected.length) {
      outreachRejected.push({ name: cand.name || "", canonicalKey: key, rejected: check.rejected });
    }
    if (match) {
      updates.push({ rowNumber: match.rowNumber, canonicalKey: key, set: toRefreshSet({ ...cand, canonicalKey: key }, opts) });
    } else {
      newRows.push({ canonicalKey: key, cells: toLeadRow({ ...cand, canonicalKey: key }, opts) });
    }
  }

  return {
    newRows, updates, duplicatesSkipped, rejected, outreachRejected,
    counts: {
      inspected: scored.length,
      newLeads: newRows.length,
      updatedLeads: updates.length,
      duplicatesSkipped: duplicatesSkipped.length,
      rejected: rejected.length,
      outreachRejected: outreachRejected.length,
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
