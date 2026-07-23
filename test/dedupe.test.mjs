import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeCandidates } from "../src/dedupe.mjs";

test("collapses same canonical url, keeps higher score", () => {
  const cands = [
    { name: "Sam", url: "https://linkedin.com/in/sam/", score: 40 },
    { name: "Sam", url: "https://www.linkedin.com/in/sam", score: 64 },
    { name: "Dana", url: "https://linkedin.com/in/dana", score: 50 },
  ];
  const { kept, duplicates } = dedupeCandidates(cands);
  assert.equal(kept.length, 2);
  assert.equal(duplicates.length, 1);
  const sam = kept.find((k) => k.name === "Sam");
  assert.equal(sam.score, 64);
  assert.equal(duplicates[0].candidate.score, 40);
});

test("candidates without identity are kept individually", () => {
  const { kept } = dedupeCandidates([{ name: "" }, { name: "" }]);
  assert.equal(kept.length, 2);
});
