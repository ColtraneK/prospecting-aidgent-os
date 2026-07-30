// `--target` counts LEADS ADDED, not profiles opened.
//
// It used to cap candidates inspected, which meant "pilot 10" reliably produced
// ten profiles opened and, after scoring, two or three rows in the sheet. What
// anyone asking for ten leads means is ten rows. So acceptance moved inside the
// collection loop.
//
// These tests drive the real counter and the real shortfall reporter over a
// synthetic source list. No browser, no network — the loop's browser work is
// the one part they cannot exercise, so a drift check below pins the wiring.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeAddedCounter, shortfallFor } from "../src/worker.mjs";
import { scoreCandidate } from "../src/scoring.mjs";
import { canonicalKey } from "../src/url.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const persona = {
  buyer_titles: ["Founder", "Owner"],
  exclusions: ["Recruiters"],
  geography: { include: ["United States"], exclude: [] },
};
const accept = (c) => scoreCandidate(persona, c, { nowMs: Date.parse("2026-07-23T12:00:00Z") }).accepted;

/**
 * Thirty people. Twelve qualify (Founder or Owner in the United States); the
 * rest miss on title or geography, exactly as a real search page does.
 */
function thirtyCandidates() {
  const out = [];
  for (let i = 0; i < 30; i++) {
    const qualifies = i % 5 === 0 || i % 5 === 1; // 12 of 30
    out.push({
      name: `Person ${i}`,
      title: qualifies ? (i % 2 ? "Owner" : "Founder") : "Intern",
      location: qualifies ? "Austin, United States" : "Berlin, Germany",
      url: `https://www.linkedin.com/in/person-${i}`,
    });
  }
  return out;
}

/**
 * A faithful, browser-free replay of the worker's collection loop: tick the cap,
 * inspect, count, and stop the moment the target is reached.
 */
function runLoop({ items, target, existingKeys = [], cap = 1000 }) {
  const counter = makeAddedCounter({ accept, existingKeys });
  let inspected = 0;
  for (const item of items) {
    if (counter.added >= target) break;
    if (inspected >= cap) break;
    inspected += 1;
    counter.consider(item);
  }
  return { inspected, added: counter.added, capReached: inspected >= cap };
}

test("a target of 10 keeps walking past 10 inspections and stops on the 10th ACCEPTANCE", () => {
  const items = thirtyCandidates();
  const { inspected, added } = runLoop({ items, target: 10 });

  assert.equal(added, 10, "ten leads added, which is what was asked for");
  assert.ok(inspected > 10, `stopped after only ${inspected} inspections — that is the old behaviour`);
  // Qualifiers sit at 0,1,5,6,10,11,15,16,20,21,25,26 — so the 10th acceptance
  // is person 21, and the loop stops having opened 22 profiles for 10 rows.
  assert.equal(inspected, 22);
});

test("the old behaviour would have delivered 4 leads for the same ask", () => {
  // The regression this whole change exists to prevent: capping at 10 inspected.
  const items = thirtyCandidates();
  const counter = makeAddedCounter({ accept, existingKeys: [] });
  for (const c of items.slice(0, 10)) counter.consider(c);
  assert.equal(counter.added, 4);
});

test("someone already in the sheet is refreshed but does not count as added", () => {
  const items = thirtyCandidates();
  const qualifying = items.filter((c) => accept(c));
  // Pre-load the sheet with the first six people who would have qualified.
  const existingKeys = qualifying.slice(0, 6).map((c) => canonicalKey({ url: c.url, name: c.name }).key);

  const { added } = runLoop({ items, target: 10, existingKeys });
  assert.equal(added, 6, "only the six NEW qualifiers count; the run ran out of people");

  // With the duplicates absent from the sheet, the same list yields ten.
  assert.equal(runLoop({ items, target: 10 }).added, 10);
});

test("the same person twice in one run counts once", () => {
  const one = { name: "Ada", title: "Founder", location: "Austin, United States", url: "https://www.linkedin.com/in/ada" };
  const counter = makeAddedCounter({ accept, existingKeys: [] });
  assert.equal(counter.consider(one), true);
  assert.equal(counter.consider({ ...one, url: "https://linkedin.com/in/Ada/" }), false, "same canonical URL");
  assert.equal(counter.added, 1);
});

test("a rejected candidate never counts, however many of them there are", () => {
  const counter = makeAddedCounter({ accept, existingKeys: [] });
  for (let i = 0; i < 50; i++) {
    counter.consider({ name: `No ${i}`, title: "Intern", location: "Berlin, Germany", url: `https://www.linkedin.com/in/no-${i}` });
  }
  assert.equal(counter.added, 0);
});

test("a scorer that throws stops nobody's run", () => {
  const boom = makeAddedCounter({ accept: () => { throw new Error("nope"); }, existingKeys: [] });
  assert.equal(boom.consider({ name: "Ada", url: "https://www.linkedin.com/in/ada" }), false);
  assert.equal(boom.added, 0);
});

test("hitting the daily cap short of the target reports the TRUE added count", () => {
  const items = thirtyCandidates();
  const { inspected, added, capReached } = runLoop({ items, target: 25, cap: 12 });
  assert.equal(capReached, true);
  assert.equal(inspected, 12);
  assert.equal(added, 6);

  const s = shortfallFor({ added, target: 25, capReached, inspected, sourcesWalked: 1, sourcesTotal: 1 });
  assert.equal(s.kind, "daily_cap");
  assert.match(s.text, /^6 of 25 added/, s.text);
  assert.match(s.text, /daily inspection cap/);
  assert.match(s.text, /12 profile/);
});

test("running out of people is a different sentence from hitting the cap", () => {
  const s = shortfallFor({ added: 3, target: 10, capReached: false, inspected: 30, sourcesWalked: 4, sourcesTotal: 4 });
  assert.equal(s.kind, "sources_exhausted");
  assert.match(s.text, /^3 of 10 added/);
  assert.match(s.text, /ran out of people/);
  assert.ok(!/daily inspection cap/.test(s.text));
});

test("a run that made its target says nothing about a shortfall", () => {
  assert.equal(shortfallFor({ added: 25, target: 25, capReached: true, inspected: 120, sourcesWalked: 4, sourcesTotal: 4 }), null);
  assert.equal(shortfallFor({ added: 26, target: 25, capReached: false, inspected: 60, sourcesWalked: 4, sourcesTotal: 4 }), null);
});

test("the worker's own loop is wired to the counter, not to candidates.length", () => {
  // The counter above is only worth testing if the loop actually consults it.
  // The browser loop cannot be run offline, so pin the exact lines that decide
  // when it stops — and pin them tightly enough that reverting to the old
  // inspected-count behaviour cannot slip through with a green suite.
  const src = fs.readFileSync(path.join(REPO_ROOT, "src", "worker.mjs"), "utf8");

  // Every candidate that gets inspected is offered to the counter.
  assert.equal((src.match(/counter\.consider\(candidate\)/g) || []).length, 2,
    "both runResearch and runAgentRead must offer each inspected candidate to the counter");

  // No break anywhere stops on how many candidates have been collected, and
  // three of them consult reached(): the source loop and the inner result loop
  // in runResearch, and the row loop in runAgentRead. reached() is the only
  // place allowed to mention candidates.length, and only as the no-scorer
  // fallback.
  const breaks = [...src.matchAll(/if \((.*?)\)\s*break;/g)].map((m) => m[1]);
  for (const b of breaks) {
    assert.ok(!/candidates\.length/.test(b),
      `a loop still stops on inspected count instead of added count: "if (${b}) break;"`);
  }
  const reachedBreaks = breaks.filter((b) => /reached\(\)/.test(b));
  assert.equal(reachedBreaks.length, 3,
    `expected 3 loop guards on reached(), found ${reachedBreaks.length}: ${reachedBreaks.join(" | ")}`);

  // And reached() is defined in terms of the counter.
  const reached = [...src.matchAll(/const reached = \(\) => \((.*?)\);/g)].map((m) => m[1]);
  assert.equal(reached.length, 2, "both runs must define their own stop condition");
  for (const r of reached) {
    assert.match(r, /accept \? counter\.added >= config\.target/,
      `reached() ignores the counter: ${r}`);
  }
});

test("the daily cap is still a hard stop the target cannot argue with", () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, "src", "worker.mjs"), "utf8");
  assert.match(src, /if \(!pacer\.tick\(\)\) break;/, "the cap must still break the loop");
  const cfg = fs.readFileSync(path.join(REPO_ROOT, "src", "config.mjs"), "utf8");
  assert.match(cfg, /AIDGENT_DAILY_CAP, 120/, "the default cap must not have been loosened");
  assert.match(cfg, /AIDGENT_MIN_DELAY_MS, 3500/, "pacing must not have been shortened");
  assert.match(cfg, /AIDGENT_MAX_DELAY_MS, 9000/);
});
