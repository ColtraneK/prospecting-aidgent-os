import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate } from "../src/scoring.mjs";

const now = Date.parse("2026-07-23T12:00:00Z");
const persona = {
  buyer_titles: ["Founder", "Owner"],
  target_industries: ["Professional services"],
  company_sizes: ["1-10 employees"],
  buying_signals: ["scaling operations"],
  exclusions: ["Students", "Recruiters"],
  geography: { include: ["United States", "Canada"], exclude: ["India"] },
};

test("strong match with recent activity scores high and is accepted", () => {
  const r = scoreCandidate(persona, {
    name: "Sam", title: "Founder", company: "Bright Ops", location: "Austin, United States",
    activity: { date: "2026-07-20", type: "post", url: "u", summary: "scaling operations at Bright Ops" },
  }, { nowMs: now });
  assert.equal(r.accepted, true);
  assert.equal(r.recent, true);
  assert.ok(r.score >= 60, `score ${r.score}`);
  assert.ok(r.factors.some((f) => f.name === "recent_topic_activity" && f.points > 0));
});

test("strong ICP match with NO recent activity is still allowed", () => {
  const r = scoreCandidate(persona, {
    name: "Owen", title: "Owner", location: "Toronto, Canada",
  }, { nowMs: now });
  assert.equal(r.accepted, true, "title+geo alone should clear threshold");
  assert.equal(r.recent, false);
});

test("excluded geography is rejected", () => {
  const r = scoreCandidate(persona, { name: "Riya", title: "Founder", location: "Mumbai, India" }, { nowMs: now });
  assert.equal(r.accepted, false);
  assert.match(r.rejectedReason, /geography/);
});

test("non-buyer title is rejected", () => {
  const r = scoreCandidate(persona, { name: "Sky", title: "Student", location: "United States" }, { nowMs: now });
  assert.equal(r.accepted, false);
  assert.match(r.rejectedReason, /buyer-title/);
});

test("exclusion term rejects", () => {
  const r = scoreCandidate(persona, { name: "R", title: "Founder", headline: "Recruiters welcome", location: "United States" }, { nowMs: now });
  // exclusion 'Recruiters' present in headline
  assert.equal(r.accepted, false);
});
