// outreach.mjs — the guardrails around the ONE thing a model is now allowed to
// write: the words in columns I and J.
//
// THE BOUNDARY THIS FILE DEFENDS
//
// v5 relaxes exactly one rule and hardens everything around it. A model may
// write words; it may never pick people. Sourcing and scoring stay deterministic
// — the same code, the same persona, the same reproducible answer about who
// qualifies. What changed is that the suggested comment and the suggested intro
// DM may now be drafted by the agent instead of assembled by a template, because
// a template that quotes a fragment of someone's post back at them reads exactly
// like the automation it is.
//
// The risk that relaxation creates is fabrication: a fluent message about a post
// nobody wrote. So a drafted message is not trusted, it is CHECKED — here, in
// code, against the evidence already in the row. The load-bearing check is
// grounding: the draft must quote at least four consecutive words that really
// appear in column D. A model cannot pass that by being plausible; it can only
// pass it by having actually read the post.
//
// A draft that fails any check is not repaired and not quietly reworded. It is
// left BLANK, with the reason reported to the agent that wrote it. A blank cell
// is a visible gap someone can fill in; a silently "fixed" message is a claim
// nobody checked.
//
// Pure: no network, no sheet, no model. Every rule here is testable.

/** Longest message lengths. A DM is a connection note; a comment is a reply. */
export const MAX_DM = 280;
export const MAX_COMMENT = 250;

/** How many consecutive words of the post a draft must actually quote. */
export const GROUNDING_WORDS = 4;

/**
 * What a message may say about someone when NOTHING was captured about them.
 *
 * This is an ALLOWLIST, and it has to be. The first version of this check was a
 * blocklist of nouns — post, comment, update, article — and a blocklist is the
 * wrong shape for the problem, because the space of ways to assert a fact about
 * a stranger is unbounded. "Loved your piece on…", "your thread on…", "I read
 * your newsletter…", "saw you have been rebuilding the ops function after the
 * Series B" — every one of those is a fabricated biography, and every one of
 * them slips past a list of four nouns.
 *
 * So with an empty column D, the only second-person thing a draft may reach for
 * is an ABSTRACT noun: their view, not their history. "I would value your take"
 * asserts nothing. "your rebuild of the ops function" asserts a great deal, and
 * we did not see it.
 */
const ABSTRACT_SECOND_PERSON = new Set([
  "take", "view", "views", "perspective", "perspectives", "thoughts", "thinking",
  "read", "opinion", "opinions", "advice", "experience", "world", "work", "time",
  "side", "angle", "input", "reaction", "sense", "approach", "day", "week",
]);

/** `your <noun>` where <noun> is a claim about them rather than their opinion. */
const YOUR_NOUN = /\byour\s+(?:(?:recent|latest|last|new|own)\s+)?([\p{L}][\p{L}'’-]*)/giu;

/**
 * Second-person assertions of things that HAPPENED. Past tense, perfect aspect,
 * and first-person claims of having consumed something they made.
 */
const ASSERTS_HISTORY = [
  /\byou(?:'ve|’ve|\s+(?:have|had|were|was|been))\b/i,
  /\byou\s+[\p{L}]+ed\b/iu,
  /\byou\s+(?:post|write|share|publish|say|mention|run|lead|build|launch|host|speak|start|grow)\w*\b/i,
  /\bI\s+(?:read|saw|watched|heard|listened|caught|noticed|enjoyed|loved|came\s+across|stumbled)\b/i,
  /\b(?:saw|noticed|spotted|read|caught)\s+(?:that\s+)?you\b/i,
  /\bhas\s+been\s+(?:doing|building|running|working)\b/i,
];

/**
 * Normalize for comparison: lowercase, strip quotes and punctuation, collapse
 * whitespace. Curly quotes, the em dash and the ellipsis all vanish, so a draft
 * is never rejected for typography.
 */
export function normalizeWords(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[""''`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The POST out of a column D cell, without the date stamp wrapped around it.
 *
 * Column D is composed, not raw: `"<the post>"\n(2026-07-29)`, or
 * `"<the post>"\n(2026-07-29 — older than 7 days)`, or — when only a permalink
 * was captured and no text — just `(2026-07-29)`. Grounding has to run against
 * the post and nothing else. Matching against the whole cell let a draft satisfy
 * the four-word rule by echoing "older than 7 days" or a date, which is a
 * quotation of our own formatting rather than of anything the person wrote.
 */
export function postTextOf(cell) {
  const s = String(cell || "").trim();
  if (!s) return "";
  const quoted = s.match(/^"([\s\S]*)"\s*(?:\n|$)/);
  if (quoted) return quoted[1].trim();
  // No quotes: drop a trailing parenthesised stamp on its own line.
  return s.replace(/\n?\(([^)]*)\)\s*$/, "").replace(/^"|"$/g, "").trim();
}

/**
 * Does `draft` quote enough consecutive words of `source` to prove it was read?
 *
 * Four words, or the whole post when the post is shorter than four words. That
 * second clause matters more than it looks: "We are hiring." is a real post, and
 * demanding a four-word quotation from a three-word post made the row
 * permanently unfillable while blaming the drafter for it. Quote what there is.
 *
 * This is the whole anti-fabrication test, and it is deliberately cheap to pass
 * honestly and impossible to pass by inventing. Any agent that read the post can
 * echo four of its words; an agent writing from imagination cannot.
 */
export function sharesPhrase(draft, source, n = GROUNDING_WORDS) {
  const a = normalizeWords(draft);
  const b = normalizeWords(source);
  if (!b.length || !a.length) return false;
  const need = Math.min(n, b.length);
  if (a.length < need) return false;
  const grams = new Set();
  for (let i = 0; i + need <= b.length; i++) grams.add(b.slice(i, i + need).join(" "));
  for (let i = 0; i + need <= a.length; i++) {
    if (grams.has(a.slice(i, i + need).join(" "))) return true;
  }
  return false;
}

/**
 * With no post captured, does this draft assert something we never observed?
 * Returns the offending phrase, or "" when the draft claims nothing.
 */
export function unfoundedClaim(draft) {
  const s = String(draft || "");
  for (const re of ASSERTS_HISTORY) {
    const m = s.match(re);
    if (m) return m[0].trim();
  }
  YOUR_NOUN.lastIndex = 0;
  let m;
  while ((m = YOUR_NOUN.exec(s))) {
    const noun = m[1].toLowerCase().replace(/[’']s$/, "");
    if (!ABSTRACT_SECOND_PERSON.has(noun)) return m[0].trim();
  }
  return "";
}

/** The first name as it should be used in a greeting. */
export function firstNameOf(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sameName = (a, b) =>
  normalizeWords(a).join(" ") === normalizeWords(b).join(" ");

/**
 * Check ONE drafted field against the evidence in its row.
 *
 * @param {object} o
 * @param {string} o.text      the drafted comment or DM
 * @param {"comment"|"dm"} o.kind
 * @param {string} o.name      column A, the person's name
 * @param {string} o.postText  column D, their post verbatim (may be empty)
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateDraft({ text, kind = "dm", name = "", postText = "" } = {}) {
  const errors = [];
  const draft = String(text || "").trim();
  // The post itself, never the date stamp this system wrapped around it.
  const post = postTextOf(postText);
  const limit = kind === "comment" ? MAX_COMMENT : MAX_DM;

  // An empty draft is not a failure. It is the honest state of a row nobody has
  // written words for yet, and it is what a failed row is left as.
  if (!draft) return { ok: true, errors: [] };

  if (draft.length > limit) {
    errors.push(`${draft.length} characters, over the ${limit}-character limit for a ${kind === "comment" ? "comment" : "DM"}`);
  }
  if (draft.includes("|")) {
    errors.push("contains a \"|\" — that is a headline being pasted in, not a sentence someone wrote");
  }
  if (/https?:\/\/|www\.|linkedin\.com/i.test(draft)) {
    errors.push("contains a URL; a first message with a link in it reads as a pitch and is not what this drafts");
  }

  // A mid-word ellipsis is the tell of a truncated template ("…willpower and
  // m…"). Decidable against the post itself: if the fragment before the
  // ellipsis is not a whole word in the post but IS the start of one, the
  // message cut somebody's word in half.
  const cut = draft.match(/(\p{L}[\p{L}\p{N}'’-]*)…/u);
  if (cut && post) {
    const frag = cut[1];
    const whole = new RegExp(`(^|[^\\p{L}])${esc(frag)}([^\\p{L}]|$)`, "iu").test(post);
    const prefix = new RegExp(`(^|[^\\p{L}])${esc(frag)}\\p{L}`, "iu").test(post);
    if (!whole && prefix) {
      errors.push(`cuts "${frag}…" off mid-word — quote whole words or shorten the excerpt`);
    }
  }

  // Whoever the draft greets has to be the person in column A.
  const greeted = draft.match(/^\s*(?:hi|hey|hello|dear)[\s,]+([\p{L}][\p{L}'’-]*)/iu);
  const first = firstNameOf(name);
  if (greeted && first && !sameName(greeted[1], first)) {
    errors.push(`greets "${greeted[1]}" but column A says "${first}"`);
  }

  // Grounding. With a post in column D, prove you read it. Without one, assert
  // nothing about them at all.
  if (post) {
    const need = Math.min(GROUNDING_WORDS, normalizeWords(post).length);
    if (!sharesPhrase(draft, post)) {
      errors.push(
        `quotes no ${need} consecutive words from their post, so nothing here is provably about them`,
      );
    }
  } else if (kind === "comment") {
    errors.push("there is no captured post to comment on");
  } else {
    const claim = unfoundedClaim(draft);
    if (claim) {
      errors.push(
        `says "${claim}", but nothing was captured about this person — that is a ` +
        "fact nobody observed. With column D empty a message may ask for their view " +
        "and may say who you work with, and may claim nothing about them",
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Check a whole row's pair of drafts and return what may actually be written.
 *
 * Anything that fails comes back as "" plus a stated reason. This is the
 * function the sheet-write path calls, so an unchecked draft cannot reach a
 * cell by any route — not through the pipeline, not through the
 * validate-outreach command, not through a fixture.
 *
 * @returns {{comment:string, dm:string, rejected:[{field,reasons}]}}
 */
export function enforceOutreach({ name = "", postText = "", comment = "", dm = "" } = {}) {
  const rejected = [];
  const c = validateDraft({ text: comment, kind: "comment", name, postText });
  const d = validateDraft({ text: dm, kind: "dm", name, postText });
  if (!c.ok) rejected.push({ field: "Suggested Comment", reasons: c.errors });
  if (!d.ok) rejected.push({ field: "Suggested Intro DM", reasons: d.errors });
  return {
    comment: c.ok ? String(comment || "") : "",
    dm: d.ok ? String(dm || "") : "",
    rejected,
  };
}

/**
 * Match a batch of drafted messages to the rows they belong to, check each one,
 * and return the writes that survived.
 *
 * Pure, and separate from the CLI on purpose: this is the logic that decides
 * what reaches somebody's sheet, and it was worth being able to test without a
 * Google account. A draft that matches no row is dropped rather than guessed at
 * — a message can only be written onto a person this system actually researched.
 *
 * @param {object} o
 * @param {Array} o.rows     sheet rows: { rowNumber, cells }
 * @param {Array} o.drafts   [{ url, name?, comment?, dm? }]
 * @param {(x:{url?:string,name?:string})=>{key:string}} o.keyOf  canonicalKey
 * @returns {{updates:Array, failures:Array, unmatched:Array}}
 */
export function planOutreachWrites({ rows = [], drafts = [], keyOf } = {}) {
  const byKey = new Map();
  for (const row of rows) {
    const cells = row.cells || {};
    const key = String(cells["Canonical Key"] || "").trim() ||
      (keyOf ? keyOf({ url: cells["LinkedIn (or profile URL)"], name: cells["Name"] }).key : "");
    if (key && !byKey.has(key)) byKey.set(key, row);
  }

  const updates = [];
  const failures = [];
  const unmatched = [];
  for (const d of drafts) {
    const key = keyOf ? keyOf({ url: d.url, name: d.name }).key : "";
    const row = key ? byKey.get(key) : null;
    if (!row) { unmatched.push(d.url || d.name || "(no url)"); continue; }
    const name = row.cells["Name"] || "";
    const postText = row.cells["Recent Post (verbatim + date)"] || "";
    const checked = enforceOutreach({ name, postText, comment: d.comment || "", dm: d.dm || "" });
    if (checked.rejected.length) {
      failures.push({ name, rowNumber: row.rowNumber, rejected: checked.rejected });
    }
    // Only ever columns I and J, and only what passed. A blank is left alone
    // rather than overwriting a draft an earlier pass got right.
    const set = {};
    if (checked.comment) set["Suggested Comment"] = checked.comment;
    if (checked.dm) set["Suggested Intro DM"] = checked.dm;
    if (Object.keys(set).length) updates.push({ rowNumber: row.rowNumber, set });
  }
  return { updates, failures, unmatched };
}

/** One line per rejection, for the run report. Never written to the sheet. */
export function formatOutreachRejections(rows = []) {
  const lines = [];
  for (const r of rows) {
    for (const rej of r.rejected || []) {
      lines.push(`  ${r.name || r.canonicalKey || "(unnamed row)"} — ${rej.field} left blank: ${rej.reasons.join("; ")}`);
    }
  }
  if (!lines.length) return "";
  return [
    `${lines.length} drafted message(s) failed validation and were left blank:`,
    ...lines,
    "Redraft them against the post in column D. A blank cell is a gap you can see;",
    "a message that quotes a post nobody wrote is not.",
  ].join("\n");
}
