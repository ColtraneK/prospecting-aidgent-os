// The whole of what code decides about a person in v6: hard disqualifiers,
// nothing else. No points, no threshold — the agent judges fit, and these are
// the lines it cannot cross.

import { test } from "node:test";
import assert from "node:assert/strict";
import { disqualify, geoIncludes, geoExcludes, hardExclusions } from "../src/disqualify.mjs";

const persona = {
  hard_exclusions: ["recruiter", "marketing agency"],
  geography: { include: ["United States", "Canada"], exclude: ["India"] },
};

test("an exclusion substring in title, company, or headline disqualifies", () => {
  for (const candidate of [
    { title: "Technical Recruiter" },
    { company: "Bright Marketing Agency" },
    { headline: "Recruiter turned founder" },
  ]) {
    const r = disqualify(persona, candidate);
    assert.equal(r.disqualified, true, JSON.stringify(candidate));
    assert.match(r.reason, /hard exclusion/);
  }
});

test("an excluded geography disqualifies; a matching one does not", () => {
  assert.equal(disqualify(persona, { title: "COO", location: "Mumbai, India" }).disqualified, true);
  assert.equal(disqualify(persona, { title: "COO", location: "Denver, Colorado, United States" }).disqualified, false);
});

test("an observed location outside the include list disqualifies when one is set", () => {
  const r = disqualify(persona, { title: "COO", location: "Berlin, Germany" });
  assert.equal(r.disqualified, true);
  assert.match(r.reason, /outside target geography/);
});

test("an UNOBSERVED location disqualifies nobody — a gap is not a fact", () => {
  assert.equal(disqualify(persona, { title: "COO", location: "" }).disqualified, false);
});

test("no geography set means no geography rule", () => {
  assert.equal(disqualify({ hard_exclusions: ["recruiter"] }, { title: "COO", location: "Anywhere" }).disqualified, false);
});

test("an unreachable profile is disqualified — no facts means no row", () => {
  const r = disqualify(persona, { unreachable: true, unreachableReason: "profile 404" });
  assert.equal(r.disqualified, true);
  assert.match(r.reason, /could not be opened/);
});

test("exclusions match normalized, so punctuation and case cannot dodge them", () => {
  const r = disqualify({ hard_exclusions: ["marketing"] }, { headline: "MARKETING | growth" });
  assert.equal(r.disqualified, true);
});

test("v5-style `exclusions` still counts as hard exclusions", () => {
  assert.deepEqual(hardExclusions({ exclusions: ["cmo"] }), ["cmo"]);
  assert.equal(disqualify({ exclusions: ["cmo"] }, { title: "Fractional CMO" }).disqualified, true);
});

test("geography helpers accept a list, a string, or include/exclude", () => {
  assert.deepEqual(geoIncludes("United States"), ["United States"]);
  assert.deepEqual(geoIncludes(["US", "CA"]), ["US", "CA"]);
  assert.deepEqual(geoIncludes({ include: ["US"], exclude: ["IN"] }), ["US"]);
  assert.deepEqual(geoExcludes({ include: ["US"], exclude: ["IN"] }), ["IN"]);
  assert.deepEqual(geoExcludes(["US"]), []);
});
