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

test("parseActivityDate reads the relative stamps LinkedIn actually shows", async () => {
  const { parseActivityDate } = await import("../src/recency.mjs");
  assert.equal(parseActivityDate("2d", now), "2026-07-21");
  assert.equal(parseActivityDate("2d •", now), "2026-07-21");
  assert.equal(parseActivityDate("1w", now), "2026-07-16");
  assert.equal(parseActivityDate("3 days ago", now), "2026-07-20");
  assert.equal(parseActivityDate("5h", now), "2026-07-23"); // hours -> today
  assert.equal(parseActivityDate("45m ago", now), "2026-07-23"); // minutes -> today
  assert.equal(parseActivityDate("2mo", now), "2026-05-24"); // ~30d months
});

test("parseActivityDate reads absolute dates and refuses to guess the rest", async () => {
  const { parseActivityDate } = await import("../src/recency.mjs");
  assert.equal(parseActivityDate("2026-07-20T09:00:00Z", now), "2026-07-20");
  assert.equal(parseActivityDate("", now), "");
  assert.equal(parseActivityDate("edited", now), "");
  assert.equal(parseActivityDate(null, now), "");
});

test("a parsed relative stamp actually earns recency points", async () => {
  const { parseActivityDate } = await import("../src/recency.mjs");
  // The whole reason relative stamps must parse: "2d" used to become "" and
  // silently score zero, rejecting people for a defect in our own reader.
  assert.equal(isRecent(parseActivityDate("2d", now), now), true);
  assert.equal(isRecent(parseActivityDate("3w", now), now), false);
});
