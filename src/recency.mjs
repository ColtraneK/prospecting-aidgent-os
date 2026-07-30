// recency.mjs — 7-day recency preference. Pure. `now` is injected for testable time.

export const RECENCY_WINDOW_DAYS = 7;

/** Parse a date-ish value to epoch ms, or null. Accepts ISO strings and Date. */
export function toEpoch(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value.getTime();
  const t = Date.parse(String(value));
  return isNaN(t) ? null : t;
}

/** Whole-day difference between two epochs (>=0 when activity is in the past). */
export function daysBetween(nowMs, activityMs) {
  return Math.floor((nowMs - activityMs) / 86400000);
}

/** True when activity is within the last `windowDays` days (inclusive). */
export function isRecent(activityDate, nowMs, windowDays = RECENCY_WINDOW_DAYS) {
  const a = toEpoch(activityDate);
  if (a === null) return false;
  const d = daysBetween(nowMs, a);
  return d >= 0 && d <= windowDays;
}

/**
 * Turn the date text LinkedIn actually shows into an ISO date, or "" when it
 * cannot be read confidently (never a guess — a blank scores zero, a wrong
 * date scores wrong). Activity feeds mostly show RELATIVE stamps ("2d", "1w",
 * "3mo", "5h ago", "2 days ago"); profiles occasionally carry a real datetime.
 * Pure: `nowMs` is injected so tests can pin the clock.
 */
export function parseActivityDate(text, nowMs) {
  const t = String(text || "").trim();
  if (!t) return "";
  // Absolute dates first (a <time datetime="..."> or "Jul 12, 2026").
  const abs = Date.parse(t);
  if (!isNaN(abs)) return new Date(abs).toISOString().slice(0, 10);
  // Relative stamps: "2d", "1w •", "3mo ago", "45m", "2 days ago", "1 week".
  const m = t.match(/(\d+)\s*(m(?:in(?:ute)?s?)?|h(?:ou)?r?s?|d(?:ay)?s?|w(?:(?:ee)?k)?s?|mo(?:nth)?s?|y(?:ea)?r?s?)\b/i);
  if (!m) return "";
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  let days;
  if (unit.startsWith("mo")) days = n * 30;
  else if (unit.startsWith("y")) days = n * 365;
  else if (unit.startsWith("w")) days = n * 7;
  else if (unit.startsWith("d")) days = n;
  else days = 0; // minutes/hours -> today
  return new Date(nowMs - days * 86400000).toISOString().slice(0, 10);
}

/**
 * Recency ranking boost (NOT a hard filter). Recent activity is preferred but a
 * strong ICP match with no recent activity is still allowed.
 *   within window        -> full boost, tapering by age
 *   older activity        -> small residual boost
 *   no activity date      -> 0
 */
export function recencyBoost(activityDate, nowMs, windowDays = RECENCY_WINDOW_DAYS) {
  const a = toEpoch(activityDate);
  if (a === null) return 0;
  const d = daysBetween(nowMs, a);
  if (d < 0) return 0; // future date -> treat as unusable
  if (d <= windowDays) {
    // 20 points at day 0, tapering to ~14 at the window edge.
    return Math.round(20 - (6 * d) / windowDays);
  }
  // Older but real activity keeps a small residual signal, floored at 2.
  return Math.max(2, Math.round(10 - d / 30));
}
