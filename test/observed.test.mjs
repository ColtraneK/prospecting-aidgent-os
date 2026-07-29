// The agent-read path is the one place a language model's output enters the
// system. These tests are the gate on it: a row is a claim that a profile URL
// was on a page, and anything that is not that gets dropped with a reason.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseObserved, describeObserved } from "../src/observed.mjs";

test("a real row is accepted and its URL is canonicalized", () => {
  const { rows, rejected } = parseObserved([
    { name: "Ada Lovelace", url: "https://www.linkedin.com/in/ada-lovelace-7b21/?miniProfileUrn=urn%3Ali%3A9", title: "Head of Ops" },
  ]);
  assert.equal(rejected.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Ada Lovelace");
  assert.ok(!rows[0].url.includes("?"), "query string must be stripped");
  assert.match(rows[0].url, /\/in\/ada-lovelace-7b21/);
  assert.equal(rows[0].observedBy, "agent");
});

test("a row with no profile URL is refused — it cannot be verified", () => {
  const { rows, rejected } = parseObserved([
    { name: "Grace Hopper", title: "VP Engineering at Compiler Co" },
  ]);
  assert.equal(rows.length, 0);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason, /cannot be verified/i);
});

test("a company page or feed link is not a person", () => {
  const { rows } = parseObserved([
    { name: "Compiler Co", url: "https://www.linkedin.com/company/compiler-co/" },
    { name: "A Post", url: "https://www.linkedin.com/feed/update/urn:li:activity:123/" },
  ]);
  assert.equal(rows.length, 0);
});

test("an example slug is refused — that is a filled-in template, not a read page", () => {
  const { rows, rejected } = parseObserved([
    { name: "John Doe", url: "https://www.linkedin.com/in/john-doe/" },
    { name: "Someone", url: "https://www.linkedin.com/in/example-person/" },
  ]);
  assert.equal(rows.length, 0);
  assert.equal(rejected.length, 2);
  for (const r of rejected) assert.match(r.reason, /example/i);
});

test("the same person listed twice is one person", () => {
  const { rows } = parseObserved([
    { name: "Ada Lovelace", url: "https://www.linkedin.com/in/ada/" },
    { name: "Ada Lovelace", url: "https://linkedin.com/in/ada?trk=search" },
  ]);
  assert.equal(rows.length, 1);
});

test("{ people: [...] } is accepted, and anything else is refused loudly", () => {
  assert.equal(parseObserved({ people: [{ name: "Ada", url: "https://www.linkedin.com/in/ada/" }] }).rows.length, 1);
  for (const junk of [null, "a string", 42, { rows: [] }]) {
    const out = parseObserved(junk);
    assert.equal(out.rows.length, 0);
    assert.equal(out.rejected.length, 1, `${JSON.stringify(junk)} must be rejected with a reason`);
  }
});

test("nothing is ever dropped silently", () => {
  const parsed = parseObserved([
    { name: "Ada Lovelace", url: "https://www.linkedin.com/in/ada/" },
    { name: "No URL Here" },
    { url: "https://www.linkedin.com/in/nameless/" },
  ]);
  const summary = describeObserved(parsed);
  assert.match(summary, /1 row\(s\) accepted/);
  assert.match(summary, /2 rejected/);
  assert.match(summary, /No URL Here/);
});

test("the agent's title and location are kept but bounded", () => {
  const { rows } = parseObserved([
    { name: "Ada", url: "https://www.linkedin.com/in/ada/", title: "x".repeat(1000), location: " London,\n  UK " },
  ]);
  assert.ok(rows[0].title.length <= 300);
  assert.equal(rows[0].location, "London, UK");
});
