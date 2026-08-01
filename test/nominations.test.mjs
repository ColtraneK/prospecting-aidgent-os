// The gate between the agent's judgement and the worker's browser: the agent
// nominates whoever it judges worth opening, and this refuses anything the
// worker could not verify by opening it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNominations, describeNominations } from "../src/nominations.mjs";

const good = {
  name: "Ada Lovelace",
  url: "https://www.linkedin.com/in/ada-lovelace-7b21/",
  why_nominated: "posted about onboarding drag this week",
  source_url: "https://www.linkedin.com/search/results/content/?keywords=onboarding",
};

test("a real nomination passes and is canonicalized", () => {
  const { rows, rejected } = parseNominations([good]);
  assert.equal(rejected.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, "https://www.linkedin.com/in/ada-lovelace-7b21");
  assert.equal(rows[0].whyNominated, "posted about onboarding drag this week");
  assert.match(rows[0].sourceUrl, /search\/results\/content/);
});

test("a row without a /in/ profile URL is rejected with a reason", () => {
  const { rows, rejected } = parseNominations([
    { name: "Nobody", url: "https://www.linkedin.com/company/acme/" },
    { name: "Nolink" },
  ]);
  assert.equal(rows.length, 0);
  assert.equal(rejected.length, 2);
  for (const r of rejected) assert.match(r.reason, /cannot be verified|profile URL/);
});

test("placeholder slugs mean an example was filled in, not a page read", () => {
  const { rows, rejected } = parseNominations([
    { name: "Jane Doe", url: "https://www.linkedin.com/in/jane-doe/" },
  ]);
  assert.equal(rows.length, 0);
  assert.match(rejected[0].reason, /example/);
});

test("someone already in the sheet is refused at the gate", () => {
  const existingKeys = new Set(["https://www.linkedin.com/in/ada-lovelace-7b21"]);
  const { rows, rejected } = parseNominations([good], { existingKeys });
  assert.equal(rows.length, 0);
  assert.match(rejected[0].reason, /already in the sheet/);
});

test("the same person nominated twice is one person", () => {
  const { rows } = parseNominations([good, { ...good, url: "https://linkedin.com/in/Ada-Lovelace-7b21?utm=x" }]);
  assert.equal(rows.length, 1);
});

test("a nameless or non-object row never reaches the worker", () => {
  const { rows, rejected } = parseNominations([
    { url: "https://www.linkedin.com/in/quiet-person/" },
    "just a string",
    null,
  ]);
  assert.equal(rows.length, 0);
  assert.equal(rejected.length, 3);
});

test("not-a-list input is rejected whole, and { nominations: [...] } unwraps", () => {
  assert.equal(parseNominations({ oops: true }).rows.length, 0);
  const { rows } = parseNominations({ nominations: [good] });
  assert.equal(rows.length, 1);
});

test("describeNominations names every rejection", () => {
  const parsed = parseNominations([good, { name: "Nolink" }]);
  const text = describeNominations(parsed);
  assert.match(text, /1 accepted/);
  assert.match(text, /Nolink/);
});
