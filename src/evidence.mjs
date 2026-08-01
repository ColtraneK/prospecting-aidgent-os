// evidence.mjs — compose sheet cells from VERIFIED data only.
// Never invents activity, dates, quotes, titles, geography, or URLs. If a fact
// was not captured, it is omitted. Pure + testable.
//
// v6 note: the composed comment/DM templates are gone — the agent drafts I and
// J and the grounding validator (outreach.mjs, on the merge path) checks them.
// What remains here is the evidence formatting nothing may improvise on.

/**
 * Shorten to at most `n` characters, ALWAYS at a word boundary.
 *
 * The old version sliced at the character and appended an ellipsis, which is how
 * a sheet came to contain "…through sheer willpower and m…". That does not read
 * as an excerpt, it reads as a bug. Cutting at the last space costs a few
 * characters and never truncates a word.
 */
function clip(s, n = 200) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return trimTail(sp > 0 ? cut.slice(0, sp) : cut) + "…";
}

/** Drop dangling punctuation left behind by a cut. */
function trimTail(s) {
  return String(s).replace(/[\s,;:.\-–—]+$/, "");
}

/**
 * Column D: their latest captured post/comment, verbatim, with its date.
 *
 * Whatever was actually captured goes in the cell — a blank D used to mean
 * "the post was older than 7 days", which was indistinguishable from "we found
 * nothing". So an older post is still shown, explicitly dated and marked, and
 * only a genuinely empty capture yields "". We never present an old post as
 * recent and we never invent one.
 *
 * The permalink lives in its own column (E) so Sheets renders it as one clean
 * clickable link instead of burying it under 500 characters of quoted post.
 */
export function recentPostCell(candidate = {}, recent = false) {
  const a = candidate.activity;
  if (!a) return "";
  const text = String(a.summary || "").trim(); // verbatim (already the captured text)
  const url = String(a.url || "").trim();
  if (!text && !url) return "";

  const date = String(a.date || "").trim();
  const stamp = recent
    ? (date ? `(${date})` : "")
    : `(${date || "date unknown"} — older than 7 days)`;

  return [text ? `"${clip(text, 500)}"` : "", stamp]
    .filter(Boolean)
    .join("\n");
}

/** Column E: the bare permalink and nothing else, or "" when none was captured. */
export function postLinkCell(candidate = {}) {
  const a = candidate.activity;
  return a ? String(a.url || "").trim() : "";
}

/**
 * Column G: the agent's 0-100 score at reading scale.
 *
 * Deterministic arithmetic on a number already recorded in column T — nothing
 * new to disagree with it. A blank score stays blank rather than becoming a 1,
 * because "not scored" and "scored terribly" are different facts.
 */
export function scoreOutOf10(fitScore) {
  const n = Number(fitScore);
  if (fitScore === null || fitScore === undefined || fitScore === "" || !Number.isFinite(n)) return "";
  return Math.max(1, Math.min(10, Math.round(n / 10)));
}
