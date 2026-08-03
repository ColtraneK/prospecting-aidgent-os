// qualify.mjs — turn the agent's judgements into checked sheet writes. Pure.
//
// This is v7's write path, and the only one. The agent read evidence.json —
// public discovery + Apify posts + Browser observations — and judged each candidate:
// fit or not, a 0-100 score, a written rationale, and drafted messages. This
// module is what stands between that judgement and the sheet:
//
//  - only fit=true rows are considered at all;
//  - a decision with no captured evidence behind it is REFUSED — the agent can
//    only qualify people `inspect` actually opened, so an invented person has
//    no key to point at;
//  - hard disqualifiers are re-checked in code (the agent cannot overrule an
//    exclusion the person wrote);
//  - every draft goes through the grounding validator on the merge path
//    (merge.mjs -> outreach.mjs): a failing draft is blanked and reported,
//    never repaired, never written;
//  - human columns K-R are never touched, and a refresh never blanks I/J
//    (merge.mjs holds both guarantees).

import { canonicalizeLinkedInUrl } from "./url.mjs";
import { disqualify } from "./disqualify.mjs";
import { recentPostCell, postLinkCell } from "./evidence.mjs";
import { isRecent } from "./recency.mjs";
import { planSheetUpdate } from "./merge.mjs";

/**
 * @param {unknown} raw  parsed JSON: an array, or { decisions: [...] }
 * @returns {{decisions: Array, rejected: Array<{row: unknown, reason: string}>}}
 */
export function parseDecisions(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.decisions) ? raw.decisions : null;
  if (!list) {
    return { decisions: [], rejected: [{ row: raw, reason: "not a JSON array of decisions (or { decisions: [...] })" }] };
  }
  const decisions = [];
  const rejected = [];
  for (const item of list) {
    if (!item || typeof item !== "object") {
      rejected.push({ row: item, reason: "not an object" });
      continue;
    }
    const key = canonicalizeLinkedInUrl(String(item.key || item.url || "").trim());
    if (!key) {
      rejected.push({ row: item, reason: "no usable key — use the candidate's canonical profile URL from evidence.json" });
      continue;
    }
    if (typeof item.fit !== "boolean") {
      rejected.push({ row: item, reason: "fit must be true or false" });
      continue;
    }
    const score = Number(item.score);
    if (item.fit && (!Number.isFinite(score) || score < 0 || score > 100)) {
      rejected.push({ row: item, reason: "a fit row needs a score between 0 and 100" });
      continue;
    }
    if (item.fit && !String(item.why_them || "").trim()) {
      rejected.push({ row: item, reason: "a fit row needs a why_them — a person with no stated reason is not a judgement" });
      continue;
    }
    decisions.push({
      key,
      fit: item.fit,
      score: item.fit ? Math.round(score) : 0,
      whyThem: String(item.why_them || "").trim(),
      comment: String(item.suggested_comment || "").trim(),
      dm: String(item.suggested_intro || "").trim(),
    });
  }
  return { decisions, rejected };
}

/**
 * Plan the sheet update for a batch of decisions against captured evidence.
 *
 * @returns {{plan, counts, refused: Array<{key, name, reason}>, skipped: number}}
 */
export function planQualify({ persona = {}, evidence = [], decisions = [], existingSheet, nowMs = Date.now(), nowIso = new Date().toISOString() } = {}) {
  const byKey = new Map();
  for (const ev of evidence) {
    const k = canonicalizeLinkedInUrl(ev && (ev.key || ev.url));
    if (k && !byKey.has(k)) byKey.set(k, ev);
  }

  const refused = [];
  const candidates = [];
  let skipped = 0;

  for (const raw of decisions) {
    // Accept both the parsed shape (parseDecisions) and the file's own field
    // names, so the pure planner is honest about what a decision carries.
    const d = {
      key: canonicalizeLinkedInUrl(raw.key || raw.url) || String(raw.key || ""),
      fit: raw.fit === true,
      score: Number(raw.score),
      whyThem: String(raw.whyThem ?? raw.why_them ?? "").trim(),
      comment: String(raw.comment ?? raw.suggested_comment ?? "").trim(),
      dm: String(raw.dm ?? raw.suggested_intro ?? "").trim(),
    };
    d.score = Number.isFinite(d.score) ? Math.max(0, Math.min(100, Math.round(d.score))) : 0;
    if (!d.fit) { skipped++; continue; }
    const ev = byKey.get(d.key);
    if (!ev) {
      refused.push({ key: d.key, name: "", reason: "no captured evidence for this key — only candidates in this durable run can be qualified" });
      continue;
    }
    if (ev.browser_verified !== true) {
      refused.push({ key: d.key, name: ev.name || "", reason: "profile was not verified in Codex Browser for this run" });
      continue;
    }
    // The agent cannot overrule a hard disqualifier the person set.
    const dq = ev.disqualified && ev.disqualified.reason
      ? { disqualified: true, reason: ev.disqualified.reason }
      : disqualify(persona, ev);
    if (dq.disqualified) {
      refused.push({ key: d.key, name: ev.name || "", reason: `hard-disqualified: ${dq.reason}` });
      continue;
    }

    const post = ev.post || null;
    const activity = post ? { summary: post.summary || "", date: post.date || "", url: post.url || "", type: post.type || "post" } : null;
    const candidate = {
      name: ev.name || "",
      url: ev.url || d.key,
      title: ev.title || ev.headline || "",
      company: ev.company || "",
      location: ev.location || "",
      degree: ev.degree || "",
      activity,
      score: d.score,
      accepted: true,
      whyThem: d.whyThem,
      comment: d.comment,
      introDM: d.dm,
      researchSource: [
        ev.source_url ? `Public web: ${ev.source_url}` : "Public web",
        activity ? "Apify profile posts" : "",
        "Codex Browser",
      ].filter(Boolean).join("\n"),
      sourceType: "Public Web + Apify",
      browserConnectionStatus: ev.browser_connection_status || "Unknown",
      connectionCheckedOn: ev.connection_checked_on || "",
    };
    candidate.recentPost = recentPostCell(candidate, activity ? isRecent(activity.date, nowMs) : false);
    candidate.postLink = postLinkCell(candidate);
    candidates.push(candidate);
  }

  const plan = planSheetUpdate(existingSheet, candidates, { nowIso, sourceType: "Public Web + Apify" });
  return { plan, counts: plan.counts, refused, skipped };
}

/** Console lines for refused decisions. Reported to the agent, never written. */
export function formatRefused(refused = []) {
  if (!refused.length) return "";
  return [
    `${refused.length} fit=true decision(s) were refused and NOT written:`,
    ...refused.map((r) => `  ${r.name || r.key} — ${r.reason}`),
  ].join("\n");
}
