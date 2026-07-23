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
