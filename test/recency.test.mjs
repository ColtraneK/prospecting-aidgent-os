import { test } from "node:test";
import assert from "node:assert/strict";
import { isRecent, recencyBoost, daysBetween } from "../src/recency.mjs";

const now = Date.parse("2026-07-23T12:00:00Z");

test("isRecent true within 7 days, false older, false for missing", () => {
  assert.equal(isRecent("2026-07-20", now), true);
  assert.equal(isRecent("2026-07-16", now), true); // exactly 7 days
  assert.equal(isRecent("2026-07-10", now), false); // 13 days
  assert.equal(isRecent("", now), false);
  assert.equal(isRecent(null, now), false);
});

test("recencyBoost is a soft boost, not a gate", () => {
  const fresh = recencyBoost("2026-07-23", now); // ~0 days
  const edge = recencyBoost("2026-07-16", now); // ~7 days
  const old = recencyBoost("2026-05-01", now); // ~83 days
  const none = recencyBoost(null, now);
  assert.ok(fresh > edge, "fresher activity boosts more");
  assert.ok(edge > old, "recent beats old");
  assert.ok(old >= 2, "older real activity keeps a small residual signal");
  assert.equal(none, 0, "no date -> no boost, but not disqualifying");
});

test("daysBetween counts whole days", () => {
  assert.equal(daysBetween(now, Date.parse("2026-07-22T12:00:00Z")), 1);
});
