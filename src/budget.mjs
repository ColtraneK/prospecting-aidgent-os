// budget.mjs — daily budgets, persisted across invocations.
//
// v6 removed the human gates from the middle of a run, so the ceilings that
// used to be a person saying "that's enough" are now code: page opens and
// profile inspections are budgeted PER DAY, and the count survives the process
// ending — otherwise "120 a day" would mean "120 per invocation", which is a
// different and much larger number.
//
// State lives in private/budget-state.json (git-ignored, one machine's facts).
// An exhausted budget refuses loudly with the reset time. It is never raised
// mid-run and never negotiated: a short day costs a few rows, a restricted
// LinkedIn account costs the tool.

import fsDefault from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";

export const BUDGET_STATE_PATH = path.join(REPO_ROOT, "private", "budget-state.json");
export const DEFAULT_OPEN_BUDGET = 120; // page navigations per day
export const DEFAULT_INSPECT_BUDGET = 60; // profiles inspected per day

/** Local calendar date — budgets reset at the person's midnight, not UTC's. */
export function dayOf(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** When today's budget resets: the next local midnight, as an ISO string. */
export function resetTimeAfter(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0);
  return next.toISOString();
}

/** Read the persisted state, resetting it when the day has rolled over. */
export function readBudgetState(file = BUDGET_STATE_PATH, { fs = fsDefault, nowMs = Date.now() } = {}) {
  const today = dayOf(nowMs);
  let state = null;
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    state = null;
  }
  if (!state || typeof state !== "object" || state.date !== today) {
    return { date: today, opens: 0, inspections: 0 };
  }
  return {
    date: today,
    opens: Math.max(0, Number(state.opens) || 0),
    inspections: Math.max(0, Number(state.inspections) || 0),
  };
}

/**
 * A budget that counts and persists. Every successful take is written to disk
 * immediately, so a crashed run still spent what it spent.
 */
export function createBudget({
  file = BUDGET_STATE_PATH,
  openLimit = DEFAULT_OPEN_BUDGET,
  inspectLimit = DEFAULT_INSPECT_BUDGET,
  fs = fsDefault,
  nowMs = null, // injectable clock for tests; null = real time per call
} = {}) {
  const clock = () => (nowMs === null ? Date.now() : nowMs);
  const save = (state) => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
    } catch {
      // A read-only disk must not grant an unlimited budget — the in-memory
      // count still applies for this invocation — but it must not crash either.
    }
  };

  const take = (field, limit, n) => {
    const now = clock();
    const state = readBudgetState(file, { fs, nowMs: now });
    if (state[field] + n > limit) {
      return {
        ok: false,
        remaining: Math.max(0, limit - state[field]),
        limit,
        resetAt: resetTimeAfter(now),
      };
    }
    state[field] += n;
    save(state);
    return { ok: true, remaining: limit - state[field], limit, resetAt: resetTimeAfter(now) };
  };

  return {
    /** Spend n page opens. Returns { ok, remaining, limit, resetAt }. */
    takeOpen(n = 1) {
      return take("opens", openLimit, n);
    },
    /** Spend n profile inspections. Same shape. */
    takeInspection(n = 1) {
      return take("inspections", inspectLimit, n);
    },
    state() {
      return readBudgetState(file, { fs, nowMs: clock() });
    },
  };
}

/** The loud refusal. Printed, never softened, never worked around. */
export function formatBudgetRefusal(kind, { remaining, limit, resetAt } = {}) {
  const what = kind === "inspections" ? "profile inspections" : "page opens";
  return [
    `BUDGET EXHAUSTED: today's ${what} budget (${limit}/day) is used up` +
      (remaining ? ` (${remaining} left, fewer than needed)` : "") + ".",
    `It resets at ${resetAt}.`,
    "This ceiling is a safety rail, not a setting to raise. Stop for the day and",
    "come back after the reset — a restricted LinkedIn account costs the tool.",
  ].join("\n");
}
