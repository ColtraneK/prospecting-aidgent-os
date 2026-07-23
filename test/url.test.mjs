import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalizeLinkedInUrl, canonicalKey, normalizeText } from "../src/url.mjs";

test("canonicalizeLinkedInUrl normalizes host, scheme, case, trailing slash, query", () => {
  const forms = [
    "https://www.linkedin.com/in/Sam-Rivera-Fake/",
    "http://linkedin.com/in/sam-rivera-fake",
    "linkedin.com/in/sam-rivera-fake?utm=1",
    "https://www.linkedin.com/in/sam-rivera-fake/details/experience/",
  ];
  for (const f of forms) {
    assert.equal(canonicalizeLinkedInUrl(f), "https://www.linkedin.com/in/sam-rivera-fake");
  }
});

test("canonicalizeLinkedInUrl rejects non-profile / non-linkedin urls", () => {
  assert.equal(canonicalizeLinkedInUrl("https://example.com/in/x"), "");
  assert.equal(canonicalizeLinkedInUrl("https://www.linkedin.com/feed/"), "");
  assert.equal(canonicalizeLinkedInUrl(""), "");
  assert.equal(canonicalizeLinkedInUrl(null), "");
});

test("canonicalKey prefers URL, falls back to name+company", () => {
  assert.deepEqual(canonicalKey({ url: "https://linkedin.com/in/abc" }), {
    key: "https://www.linkedin.com/in/abc",
    basis: "url",
  });
  const k = canonicalKey({ name: "Dana Lopez", company: "Lopez Studio" });
  assert.equal(k.basis, "name+company");
  assert.equal(k.key, "name:dana lopez|company:lopez studio");
});

test("normalizeText strips diacritics and punctuation", () => {
  assert.equal(normalizeText("José  O'Neil, Inc."), "jose o neil inc");
});
