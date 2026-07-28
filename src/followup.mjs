// followup.mjs — pure planner for the follow-up pass.
//
// After YOU reach out (you tick "Reached Out" in column H), this pass observes
// three read-only LinkedIn surfaces — your sent invitations, your connections,
// and your message threads — and records what it saw in columns V-Y.
//
// It OBSERVES ONLY. It never sends an invite, never sends or opens a reply on
// your behalf, never withdraws anything. And it writes nothing outside V-Y, so
// your own tracking in H:N is untouched.
//
// Matching across surfaces is fuzzy by necessity: the connections page exposes
// profile URLs, but the messaging list often exposes only a display name. So
// every observation and every sheet row is reduced to a set of ALIASES (a URL
// key and/or a name key) and matched if any alias overlaps.
//
// Pure and fully testable: the worker hands it plain observation objects.

import { FOLLOWUP_FIELDS, HUMAN_FIELDS } from "./schema.mjs";
import { canonicalizeLinkedInUrl, normalizeText } from "./url.mjs";

/** Values a human might put in "Reached Out" to mean yes. */
export function isTruthyFlag(v) {
  return /^(true|yes|y|x|1|done|sent|checked)$/i.test(String(v == null ? "" : v).trim());
}

/**
 * Every key a person might be matched by. URL is authoritative; the bare name
 * key is the bridge to surfaces (messaging) that do not expose a profile URL.
 */
export function aliasesFor({ url, name } = {}) {
  const out = [];
  const canon = canonicalizeLinkedInUrl(url);
  if (canon) out.push(canon);
  const n = normalizeText(name);
  if (n) out.push(`name:${n}`);
  return out;
}

function clip(s, n = 300) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

/**
 * Turn raw worker output into alias-indexed lookups.
 * `observed*` flags say whether that surface was actually read; when a surface
 * was NOT read we record "unknown" rather than guessing a negative.
 */
export function indexObservations(obs = {}) {
  const connections = new Set();
  const pending = new Set();
  const threads = new Map();

  for (const c of obs.connections || []) for (const a of aliasesFor(c)) connections.add(a);
  for (const p of obs.pendingInvites || []) for (const a of aliasesFor(p)) pending.add(a);
  for (const t of obs.threads || []) {
    for (const a of aliasesFor(t)) if (!threads.has(a)) threads.set(a, t);
  }

  return {
    connections,
    pending,
    threads,
    observedConnections: obs.observedConnections !== false,
    observedInvites: obs.observedInvites !== false,
    observedMessages: obs.observedMessages !== false,
  };
}

/** Decide the V value for one row, given that row's aliases. */
export function connectionStatusFor(aliases, idx) {
  if (aliases.some((a) => idx.connections.has(a))) return "connected";
  if (aliases.some((a) => idx.pending.has(a))) return "pending";
  // Only claim a negative when we actually read both surfaces.
  if (idx.observedConnections && idx.observedInvites) return "not_connected";
  return "unknown";
}

/** Decide the W/X values for one row, given that row's aliases. */
export function replyStatusFor(aliases, idx) {
  if (!idx.observedMessages) return { status: "unknown", lastReply: "" };
  let thread = null;
  for (const a of aliases) {
    if (idx.threads.has(a)) {
      thread = idx.threads.get(a);
      break;
    }
  }
  if (!thread) return { status: "no_reply", lastReply: "" };
  if (!thread.lastMessageFromThem) return { status: "no_reply", lastReply: "" };
  const text = clip(thread.lastMessageText || "");
  const date = String(thread.lastMessageDate || "").trim();
  const lastReply = text ? (date ? `"${text}" (${date})` : `"${text}"`) : date;
  return { status: "replied", lastReply };
}

/**
 * Plan V-Y updates for every row the human has marked "Reached Out".
 * Rows you have not reached out to are left completely alone.
 *
 * @returns {{updates: Array, counts: object, skipped: number}}
 */
export function planFollowUp(existingSheet, observations, { nowIso = new Date().toISOString() } = {}) {
  const idx = indexObservations(observations);
  const parsed = new Date(nowIso);
  const stamp = isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);

  const updates = [];
  const counts = { checked: 0, connected: 0, pending: 0, notConnected: 0, unknown: 0, replied: 0 };
  let skipped = 0;

  for (const row of (existingSheet && existingSheet.rows) || []) {
    const cells = row.cells || {};
    if (!isTruthyFlag(cells["Reached Out"])) {
      skipped++;
      continue;
    }
    const aliases = aliasesFor({
      url: cells["LinkedIn (or profile URL)"] || cells["Canonical Key"],
      name: cells["Name"],
    });
    if (!aliases.length) {
      skipped++;
      continue;
    }

    const conn = connectionStatusFor(aliases, idx);
    const { status: reply, lastReply } = replyStatusFor(aliases, idx);

    const set = {
      "Connection Status": conn,
      "Reply Status": reply,
      "Follow-up Checked": stamp,
    };
    // Never blank out a reply recorded on an earlier pass just because this
    // pass could not read messaging.
    if (lastReply) set["Last Reply"] = lastReply;

    for (const h of HUMAN_FIELDS) delete set[h];
    assertOnlyFollowupFields(set);

    updates.push({ rowNumber: row.rowNumber, aliases, set });
    counts.checked++;
    if (conn === "connected") counts.connected++;
    else if (conn === "pending") counts.pending++;
    else if (conn === "not_connected") counts.notConnected++;
    else counts.unknown++;
    if (reply === "replied") counts.replied++;
  }

  return { updates, counts, skipped };
}

/** Defensive: the follow-up pass may only ever write V-Y. */
export function assertOnlyFollowupFields(set) {
  for (const k of Object.keys(set)) {
    if (!FOLLOWUP_FIELDS.includes(k)) {
      throw new Error(`follow-up may only write ${FOLLOWUP_FIELDS.join(", ")} — got "${k}"`);
    }
  }
  return true;
}

/** Human-readable summary for the console. */
export function formatFollowUpReport(counts, skipped = 0) {
  return [
    `Follow-up checked ${counts.checked} row(s) you marked Reached Out (${skipped} not marked, left alone).`,
    `  connected: ${counts.connected}   pending: ${counts.pending}   not connected: ${counts.notConnected}   unknown: ${counts.unknown}`,
    `  replies detected: ${counts.replied}`,
  ].join("\n");
}
