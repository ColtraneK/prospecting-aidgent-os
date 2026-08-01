import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate, DEFAULT_ACCEPT_THRESHOLD } from "../src/scoring.mjs";

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

test("an observed connection degree ranks warmer people higher", () => {
  const base = { name: "Ada", title: "Founder", location: "Austin, United States" };
  const first = scoreCandidate(persona, { ...base, degree: "1st" }, { nowMs: now });
  const second = scoreCandidate(persona, { ...base, degree: "2nd" }, { nowMs: now });
  const third = scoreCandidate(persona, { ...base, degree: "3rd" }, { nowMs: now });
  const none = scoreCandidate(persona, base, { nowMs: now });

  assert.equal(first.score - none.score, 10);
  assert.equal(second.score - none.score, 8);
  assert.equal(third.score, none.score, "3rd degree is neutral, not a penalty");

  // A degree nobody saw must cost nothing: it is a gap in our observation, not
  // a fact about the person.
  assert.equal(none.factors.find((f) => f.name === "degree_match").points, 0);
  assert.match(none.factors.find((f) => f.name === "degree_match").detail, /not observed/);
});

test("a 3rd-degree person still qualifies on the other signals", () => {
  const r = scoreCandidate(persona, {
    name: "Grace", title: "Owner", location: "Toronto, Canada", degree: "3rd",
  }, { nowMs: now });
  assert.equal(r.accepted, true);
});

// --- v5: knowing someone is not a reason they are a fit ---------------------

test("connection degree ranks a person and never qualifies them", () => {
  // The exact arithmetic that put half the 2026-08-01 pilot in the sheet:
  // title (25) + 1st degree (10) = 35 = the threshold, with no geography, no
  // industry, no size and no activity. Being connected to someone is a reason
  // to reach them sooner. It was never evidence that they fit.
  const titleOnly = { name: "Kit", title: "Founder", location: "Berlin, Germany" };
  const cold = scoreCandidate(persona, titleOnly, { nowMs: now });
  const warm = scoreCandidate(persona, { ...titleOnly, degree: "1st" }, { nowMs: now });

  assert.equal(cold.accepted, false, "title alone was never meant to be enough");
  assert.equal(warm.accepted, false, "and a connection degree must not make it enough");
  assert.equal(warm.score, cold.score + 10, "the points are still earned…");
  assert.equal(warm.qualifyingScore, cold.qualifyingScore, "…they just do not count toward the bar");
  assert.match(warm.rejectedReason, /ranks this person higher but does not qualify/);
});

test("the warm version of a qualifying lead still outranks the cold one", () => {
  // Excluding the factor from the bar must not throw away the signal. Warm
  // people still sort first; they just have to earn their place first.
  const base = { name: "Ada", title: "Founder", location: "Austin, United States" };
  const cold = scoreCandidate(persona, base, { nowMs: now });
  const warm = scoreCandidate(persona, { ...base, degree: "1st" }, { nowMs: now });
  assert.equal(cold.accepted, true);
  assert.equal(warm.accepted, true);
  assert.ok(warm.score > cold.score, "column T still shows the warmth");
});

test("rank-only beats a higher threshold on the pilot's own shape", () => {
  // The work order offered two fixes and asked for both to be tested. The real
  // 26 candidates live in a sheet this repo work deliberately does not touch,
  // so these are the archetypes the pilot review documented, and they are what
  // separates the options:
  //
  //   A  title + 1st degree, nothing else        <- the bug: must NOT be accepted
  //   B  title + geography, cold                 <- a genuine fit: must stay
  //   C  title + company size, cold              <- a modest but real second signal
  //   D  title + recent on-topic post, cold      <- the person we actually want
  const A = { name: "A", title: "Founder", location: "Berlin, Germany", degree: "1st" };
  const B = { name: "B", title: "Founder", location: "Austin, United States" };
  const C = { name: "C", title: "Founder", location: "Berlin, Germany", companySize: "1-10 employees", industry: "Professional services" };
  const D = {
    name: "D", title: "Founder", location: "Berlin, Germany",
    activity: { date: "2026-07-20", type: "post", url: "u", summary: "scaling operations without more headcount" },
  };

  const rankOnly = (c) => scoreCandidate(persona, c, { nowMs: now }).accepted;
  // The alternative the work order offered: leave degree inside the number and
  // raise the bar to 45 instead.
  const raised = (c) => {
    const r = scoreCandidate(persona, c, { nowMs: now });
    const titleHit = r.factors.find((f) => f.name === "title_match").points > 0;
    return titleHit && r.score >= 45;
  };

  // Both options kill the reported bug.
  assert.equal(rankOnly(A), false);
  assert.equal(raised(A), false);

  // Rank-only keeps everyone who has a genuine second signal.
  assert.equal(rankOnly(B), true);
  assert.equal(rankOnly(C), true);
  assert.equal(rankOnly(D), true);

  // Raising the bar instead costs B — a title plus a confirmed geography, which
  // is precisely the "one more real ICP signal" the threshold was written for.
  assert.equal(raised(B), false, "threshold 45 drops a title+geography match");
  assert.equal(raised(C), true);
  assert.equal(raised(D), true);

  // And the defect itself survives a raised bar: B is rejected at 45 while the
  // SAME person, connected to you, is accepted at 47. The degree is still
  // buying qualification, only at a higher price.
  const warmB = scoreCandidate(persona, { ...B, degree: "1st" }, { nowMs: now });
  assert.equal(warmB.score, 47);
  assert.equal(raised({ ...B, degree: "1st" }), true, "a raised threshold moves the defect, it does not fix it");
  assert.equal(rankOnly({ ...B, degree: "1st" }), true, "under rank-only they qualify on geography, and merely rank higher");

  assert.equal(DEFAULT_ACCEPT_THRESHOLD, 35, "the bar itself did not need to move");
});
