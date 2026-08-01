// evidence.mjs — compose the agent's text fields from VERIFIED data only.
// Never invents activity, dates, quotes, titles, geography, or URLs. If a fact
// was not captured, it is omitted. Pure + testable.

/**
 * Shorten to at most `n` characters, ALWAYS at a word boundary.
 *
 * The old version sliced at the character and appended an ellipsis, which is how
 * a sheet came to contain "…through sheer willpower and m…". That does not read
 * as an excerpt, it reads as a bug, and it was being sent to strangers. Cutting
 * at the last space costs a few characters and never truncates a word.
 */
function clip(s, n = 200) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return trimTail(sp > 0 ? cut.slice(0, sp) : cut) + "…";
}

/**
 * The first `maxWords` words, whole. Used for the quoted excerpt inside a
 * drafted message, where the unit that matters is words rather than characters:
 * a ten-word quote reads as a deliberate quotation, and a 90-character one reads
 * as whatever happened to fit.
 */
function excerpt(s, maxWords = 12) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const w = t.split(" ");
  if (w.length <= maxWords) return trimTail(t);
  return trimTail(w.slice(0, maxWords).join(" ")) + "…";
}

/** Drop dangling punctuation left behind by a cut. */
function trimTail(s) {
  return String(s).replace(/[\s,;:.\-–—]+$/, "");
}

/**
 * How to describe this ICP's audience when there is no post to react to.
 *
 * NEVER the candidate's own headline. Interpolating that produced
 * "how Award-Winning Founder | 500+ Public Speaking Engagements | …s are
 * approaching this space" — pipe soup with a broken plural glued to the end, in
 * a message meant to sound like a person. The persona already knows who it sells
 * to; `persona` was a parameter of composeIntroDM that nothing ever read.
 *
 * The "people in X roles" phrasing is deliberate: it is grammatical for every
 * title, including the multi-word ones the persona guardrails now insist on, so
 * nothing here has to pluralise a job title.
 */
export function audiencePhrase(persona = {}) {
  const explicit = String(persona.audience_phrase || "").trim();
  if (explicit) return explicit;
  const titles = Array.isArray(persona.buyer_titles) ? persona.buyer_titles.filter(Boolean) : [];
  const t = String(titles[0] || "").trim();
  return t ? `people in ${t} roles` : "";
}

/**
 * Column D: their latest captured post/comment, verbatim, with its date.
 *
 * Whatever we actually captured goes in the cell — a blank D used to mean "the
 * post was older than 7 days", which was indistinguishable from "we found
 * nothing", and left you with a comment suggestion and no post to comment on.
 * So an older post is still shown, explicitly dated and marked, and only a
 * genuinely empty capture yields "". We never present an old post as recent and
 * we never invent one.
 *
 * The permalink used to live at the end of this cell. It now has its own column
 * (E) so Sheets renders it as one clean clickable link instead of burying it
 * under 500 characters of quoted post.
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
 * Column G: the 0-100 fit score at reading scale.
 *
 * Deterministic arithmetic on a number the scorer already produced — no model,
 * no judgement, nothing new to disagree with column T. A blank score stays
 * blank rather than becoming a 1, because "we did not score this" and "we
 * scored this and it was terrible" are different facts.
 */
export function scoreOutOf10(fitScore) {
  const n = Number(fitScore);
  if (fitScore === null || fitScore === undefined || fitScore === "" || !Number.isFinite(n)) return "";
  return Math.max(1, Math.min(10, Math.round(n / 10)));
}

/**
 * Column H: why this person, in the scorer's own words.
 *
 * Given the factor breakdown `scoreCandidate` already computes, this says what
 * actually earned the points — "title matches 'Fractional COO'; in target
 * geography 'United States'; recent (<=7d) activity about 'capacity'". Without
 * it the column was a headline plus a post excerpt, which tells you what the
 * person says about themselves and nothing about why the system chose them, so
 * a 6 out of 10 was unexplainable to the one person who has to act on it.
 *
 * The factors are optional so the older call still works; passing them is what
 * merge.mjs and the pipeline now do.
 */
export function composeWhyThem(candidate = {}, factors = null) {
  const role = [candidate.title, candidate.company].filter(Boolean).join(" at ");
  const scored = (Array.isArray(factors) ? factors : [])
    .filter((f) => f && Number(f.points) > 0 && f.detail)
    .map((f) => f.detail);
  if (scored.length) {
    return [role ? clip(role, 90) : "", scored.join("; ")].filter(Boolean).join(" — ");
  }

  const parts = [];
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
 * Column I: a suggested COMMENT on their recent post. Reacts to something
 * specific and verified, no pitch. Returns "" if there is no activity to react
 * to — a comment with no post behind it is a bug, not a suggestion.
 *
 * This is now the OFFLINE FALLBACK. On a live run the agent drafts column I
 * itself and `npm run validate-outreach` checks it; this template is what a
 * dry-run, a fixture demo and any machine with no model available still produce.
 * It is written to pass exactly the same validator, which is the point: the
 * floor and the ceiling are held to one standard.
 */
export function composeComment(candidate = {}) {
  const a = candidate.activity;
  if (!a || !a.summary) return "";
  const hook = excerpt(a.summary, 14);
  if (!hook) return "";
  return `Really liked this: "${hook}" — curious how you are seeing that play out. Thanks for putting it out there.`;
}

/**
 * Column J: a suggested INTRO DM. References something specific and verified,
 * no pitch, ends with a light question. Also the offline fallback.
 *
 * The excerpt is short and QUOTED. "your post on 'capacity is the constraint
 * nobody budgets for' stood out" reads as a quotation; the old unquoted
 * mid-word slice read as a broken program, which is what it was.
 */
export function composeIntroDM(candidate = {}, persona = {}) {
  const first = String(candidate.name || "").trim().split(/\s+/)[0] || "there";
  const a = candidate.activity;
  if (a && a.summary) {
    const hook = excerpt(a.summary, 10);
    if (hook) {
      return `Hi ${first}, your ${a.type || "post"} on "${hook}" stood out — I work with people chewing on the same problem and would value your take. Open to a quick exchange?`;
    }
  }
  const audience = audiencePhrase(persona);
  if (audience) {
    return `Hi ${first}, I have been paying attention to how ${audience} are approaching this and would value your perspective. Open to connecting?`;
  }
  return "";
}
