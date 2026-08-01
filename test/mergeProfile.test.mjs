// mergeProfile: fold first-hand profile observations into a nomination row
// without letting a blank erase a fact. The rule that once cost everyone their
// geography (a missed profile parse wiped the captured location with "").

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeProfile, evidenceEntry } from "../src/worker.mjs";

test("a blank never overwrites a fact", () => {
  const base = { name: "Ada", url: "https://www.linkedin.com/in/ada", location: "London, UK", title: "Head of Ops" };
  const merged = mergeProfile(base, { location: "", headline: "", company: null });
  assert.equal(merged.location, "London, UK");
  assert.equal(merged.title, "Head of Ops");
});

test("a captured profile fact fills a gap in the base", () => {
  const merged = mergeProfile({ name: "Ada", url: "x" }, { headline: "COO at Analytical Engines", location: "London" });
  assert.equal(merged.location, "London");
  assert.equal(merged.title, "COO at Analytical Engines", "the headline stands in for a missing title");
});

test("a base degree wins over the profile's guess; a blank base takes the profile's", () => {
  assert.equal(mergeProfile({ degree: "2nd" }, { degree: "3rd" }).degree, "2nd");
  assert.equal(mergeProfile({ degree: "" }, { degree: "3rd" }).degree, "3rd");
});

test("first-hand captured activity on the base survives a profile visit", () => {
  const base = { activity: { summary: "the post that led here", date: "2026-07-30" }, activityStatus: "captured" };
  const merged = mergeProfile(base, { activity: { summary: "something newer" }, activityStatus: "captured" });
  assert.equal(merged.activity.summary, "the post that led here");
});

test("evidenceEntry records what the browser saw, never what the agent claimed", () => {
  const row = { name: "Ada Lovelace", url: "https://www.linkedin.com/in/ada", whyNominated: "posted about ops", sourceUrl: "https://www.linkedin.com/search/x" };
  const profile = {
    headline: "Head of Operations at Analytical Engines",
    company: "Analytical Engines",
    location: "London, United Kingdom",
    degree: "2nd",
    activity: { summary: "We cut onboarding to two days", date: "2026-07-30", url: "https://www.linkedin.com/feed/update/1", type: "post" },
    activityStatus: "captured",
    activityVerdict: null,
  };
  const ev = evidenceEntry(row, profile, {});
  assert.equal(ev.key, row.url);
  assert.equal(ev.title, profile.headline);
  assert.equal(ev.degree, "2nd");
  assert.equal(ev.post.summary, "We cut onboarding to two days");
  assert.equal(ev.why_nominated, "posted about ops", "the agent's rationale is provenance, carried as-is");
  assert.equal(ev.disqualified, null);
});

test("evidenceEntry applies hard disqualifiers and records the reason", () => {
  const row = { name: "R", url: "https://www.linkedin.com/in/r" };
  const ev = evidenceEntry(row, { headline: "Senior Recruiter" }, { hard_exclusions: ["recruiter"] });
  assert.ok(ev.disqualified);
  assert.match(ev.disqualified.reason, /recruiter/);
});

test("an unreachable profile is evidence of nothing, and says so", () => {
  const ev = evidenceEntry({ name: "Gone", url: "https://www.linkedin.com/in/gone" }, null, {}, { unreachable: true, unreachableReason: "profile 404" });
  assert.equal(ev.activity_status, "unreachable");
  assert.ok(ev.disqualified);
  assert.match(ev.disqualified.reason, /could not be opened/);
  assert.equal(ev.post, null);
});
