// evidence.mjs — compose the agent's text fields from VERIFIED data only.
// Never invents activity, dates, quotes, titles, geography, or URLs. If a fact
// was not captured, it is omitted. Pure + testable.

function clip(s, n = 200) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

/**
 * Column D: the verbatim recent post text followed by its link, but ONLY when the
 * activity is recent (within the 7-day window). Returns "" otherwise — we never
 * paste an old post as if it were recent.
 */
export function recentPostCell(candidate = {}, recent = false) {
  const a = candidate.activity;
  if (!recent || !a) return "";
  const text = String(a.summary || "").trim(); // verbatim (already the captured text)
  const url = String(a.url || "").trim();
  if (!text && !url) return "";
  if (text && url) return `"${clip(text, 500)}"\n${url}`;
  return text ? `"${clip(text, 500)}"` : url;
}

/** A concise, evidence-based reason. Returns "" when nothing is verified. */
export function composeWhyThem(candidate = {}) {
  const parts = [];
  const role = [candidate.title, candidate.company].filter(Boolean).join(" at ");
  if (role) parts.push(role);
  const a = candidate.activity;
  if (a && (a.summary || a.type)) {
    const when = a.date ? ` (${a.date})` : "";
    const what = a.summary ? clip(a.summary, 140) : a.type || "recent activity";
    parts.push(`${a.type ? a.type + ": " : ""}${what}${when}`.trim());
  }
  return parts.join(". ");
}

/**
 * Column F: a suggested COMMENT reply to their recent post/comment. Reacts to
 * something specific and verified, no pitch. Returns "" if there is no activity
 * to react to.
 */
export function composeComment(candidate = {}) {
  const a = candidate.activity;
  if (!a || !a.summary) return "";
  const hook = clip(a.summary, 110);
  return `Really liked your point on ${hook} — curious how you are seeing that play out lately. Thanks for sharing it.`;
}

/**
 * Column G: a suggested INTRO DM (short outreach). References something specific
 * and verified, no pitch, ends with a light question. Returns a role-based draft
 * if no activity, and "" only when there is nothing at all to reference.
 */
export function composeIntroDM(candidate = {}, persona = {}) {
  const first = String(candidate.name || "").trim().split(/\s+/)[0] || "there";
  const a = candidate.activity;
  if (a && a.summary) {
    return `Hi ${first}, your ${a.type || "post"} on ${clip(a.summary, 90)} stood out. I work with people thinking about the same thing and would value your take. Open to a quick exchange?`;
  }
  if (candidate.title) {
    return `Hi ${first}, I have been following how ${candidate.title}s are approaching this space and would value your perspective. Open to connecting?`;
  }
  return "";
}
