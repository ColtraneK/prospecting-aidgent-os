// Daily budgets: persisted across invocations, refused loudly when spent,
// reset when the day rolls over. The safety rail that replaced the deleted
// human gates, so it has to hold without a person watching.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBudget, readBudgetState, dayOf, resetTimeAfter, formatBudgetRefusal } from "../src/budget.mjs";

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "budget-")), "budget-state.json");

test("spending persists to disk, so a second invocation continues the count", () => {
  const file = tmpFile();
  const a = createBudget({ file, openLimit: 5, inspectLimit: 2 });
  assert.equal(a.takeOpen(2).ok, true);
  assert.equal(a.takeInspection().ok, true);

  // A brand-new budget object over the same file — a new process.
  const b = createBudget({ file, openLimit: 5, inspectLimit: 2 });
  assert.equal(b.state().opens, 2);
  assert.equal(b.state().inspections, 1);
});

test("an exhausted budget refuses with the reset time and never goes negative", () => {
  const file = tmpFile();
  const budget = createBudget({ file, openLimit: 2, inspectLimit: 1 });
  assert.equal(budget.takeOpen(2).ok, true);
  const refused = budget.takeOpen();
  assert.equal(refused.ok, false);
  assert.equal(refused.remaining, 0);
  assert.ok(!isNaN(Date.parse(refused.resetAt)), "refusal must carry a parseable reset time");
  // The refused take spent nothing.
  assert.equal(budget.state().opens, 2);

  assert.equal(budget.takeInspection().ok, true);
  assert.equal(budget.takeInspection().ok, false);
});

test("a take larger than what remains is refused whole, not partially spent", () => {
  const file = tmpFile();
  const budget = createBudget({ file, openLimit: 3 });
  assert.equal(budget.takeOpen(2).ok, true);
  assert.equal(budget.takeOpen(2).ok, false);
  assert.equal(budget.state().opens, 2);
});

test("the count resets when the day rolls over", () => {
  const file = tmpFile();
  const yesterday = Date.now() - 26 * 3600 * 1000;
  const spent = createBudget({ file, openLimit: 2, nowMs: yesterday });
  assert.equal(spent.takeOpen(2).ok, true);
  assert.equal(spent.takeOpen().ok, false);

  // Same file, today's clock: fresh budget.
  const today = createBudget({ file, openLimit: 2 });
  assert.equal(today.state().opens, 0);
  assert.equal(today.takeOpen().ok, true);
});

test("a corrupt or missing state file is a fresh day, never a crash", () => {
  const file = tmpFile();
  fs.writeFileSync(file, "not json{{{");
  const state = readBudgetState(file);
  assert.equal(state.opens, 0);
  assert.equal(state.date, dayOf());
});

test("the reset time is the next local midnight", () => {
  const now = new Date(2026, 6, 15, 22, 30, 0).getTime(); // July 15, 22:30 local
  const reset = new Date(resetTimeAfter(now));
  assert.equal(reset.getDate(), 16);
  assert.equal(reset.getHours(), 0);
  assert.ok(dayOf(now).endsWith("-15"));
});

test("the refusal message says what, how much, and when it resets", () => {
  const msg = formatBudgetRefusal("inspections", { remaining: 0, limit: 60, resetAt: "2026-08-02T00:00:00.000Z" });
  assert.match(msg, /BUDGET EXHAUSTED/);
  assert.match(msg, /60\/day/);
  assert.match(msg, /2026-08-02/);
  assert.match(msg, /not a setting to raise/i);
});
