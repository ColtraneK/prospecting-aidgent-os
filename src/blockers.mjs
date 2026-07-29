// blockers.mjs — detect states where we must stop safely and NOT proceed.
// Pure: takes an observed page state, returns a classification. The worker
// calls this after each navigation and exits nonzero on any blocker.

const RULES = [
  { kind: "login", test: (u, t, b) => /\/(login|uas\/login|checkpoint\/lg)/i.test(u) || /sign in to linkedin|join linkedin|welcome back/i.test(t + " " + b) },
  { kind: "checkpoint", test: (u, t, b) => /\/checkpoint\//i.test(u) || /security verification|let's do a quick security check|help us keep your account/i.test(t + " " + b) },
  { kind: "captcha", test: (u, t, b) => /captcha|are you (a )?human|verify you are a human|hcaptcha|recaptcha/i.test(t + " " + b) },
  { kind: "rate_limit", test: (u, t, b) => /\b429\b|too many requests|you.?ve reached the (weekly|monthly|commercial) limit|unusual activity|slow down/i.test(t + " " + b) },
  { kind: "session_expired", test: (u, t, b) => /session (has )?expired|you.?ve been signed out|please sign in again/i.test(t + " " + b) },
  { kind: "access_restricted", test: (u, t, b) => /this (profile|page) is not available|you don.?t have access|sign in to see|content isn.?t available|restricted/i.test(t + " " + b) },
];

/**
 * @param {{url?:string, title?:string, bodyTextSample?:string, httpStatus?:number}} state
 * @returns {{blocked:boolean, kind:string|null, reason:string|null}}
 */
export function detectBlocker(state = {}) {
  const url = String(state.url || "");
  const title = String(state.title || "");
  const body = String(state.bodyTextSample || "").slice(0, 4000);
  const status = Number(state.httpStatus || 0);

  if (status === 429) return { blocked: true, kind: "rate_limit", reason: "HTTP 429 rate limit" };
  if (status === 403) return { blocked: true, kind: "access_restricted", reason: "HTTP 403 forbidden" };
  if (status === 401) return { blocked: true, kind: "login", reason: "HTTP 401 unauthorized" };

  for (const rule of RULES) {
    if (rule.test(url, title, body)) {
      return { blocked: true, kind: rule.kind, reason: `${rule.kind} page detected` };
    }
  }
  return { blocked: false, kind: null, reason: null };
}

// LinkedIn's own wording when a search legitimately matched nobody. This is the
// ONLY empty page that is not a defect.
const NO_RESULTS_TEXT =
  /no results found|no matching results|try (different|new) keywords|we (couldn.?t|could not) find|didn.?t match any|no people (were )?found|no (pending )?invitations|you have no (pending )?invitations|no connections (yet|found)|nothing to show here/i;

/**
 * Why did a page that loaded fine produce zero rows?
 *
 * A search that finds nobody and a parser that cannot see anybody look
 * identical from the outside — both are "0 candidates" — and the second is a
 * bug that will silently return 0 forever. This separates them from evidence
 * that is actually on the page.
 *
 * @param {{url?:string, bodyTextSample?:string, profileLinkCount?:number}} state
 * @returns {{kind:string, reason:string, benign:boolean}}
 */
export function diagnoseEmptyResults(state = {}) {
  const text = String(state.bodyTextSample || "");
  const links = Number(state.profileLinkCount || 0);

  if (NO_RESULTS_TEXT.test(text)) {
    return {
      kind: "no_results",
      benign: true,
      reason: "LinkedIn reported no results for this search.",
    };
  }
  if (links > 0) {
    return {
      kind: "parse_failed",
      benign: false,
      reason:
        `the page shows ${links} link(s) to profiles but the extractor matched none — ` +
        "LinkedIn's result markup has changed and the collector needs updating.",
    };
  }
  if (!text.trim()) {
    return {
      kind: "page_not_rendered",
      benign: false,
      reason: "the page returned no readable text at all — it never finished rendering.",
    };
  }
  return {
    kind: "no_results_visible",
    benign: false,
    reason:
      "the page rendered, but it contained neither profile links nor a 'no results' message — " +
      "this is not the search page we expected.",
  };
}
