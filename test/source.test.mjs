import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSourceCandidates } from "../src/source.mjs";

const good = {
  name: "Ada Nkem",
  url: "https://linkedin.com/in/Ada-Nkem/?utm_source=search",
  source_url: "https://example.org/speakers/ada",
  source_query: "site:linkedin.com/in operations hiring",
  source_snippet: "Ada leads operations and is hiring.",
  why_nominated: "Current hiring signal matches the ICP.",
};

test("public search candidates retain provenance and canonicalize profiles", () => {
  const parsed = parseSourceCandidates({ candidates: [good] }, { nowIso: "2026-08-03T12:00:00Z" });
  assert.equal(parsed.rejected.length, 0);
  assert.equal(parsed.rows[0].url, "https://www.linkedin.com/in/ada-nkem");
  assert.equal(parsed.rows[0].source_url, good.source_url);
  assert.equal(parsed.rows[0].discovered_at, "2026-08-03T12:00:00Z");
});

test("missing provenance, non-profile URLs, and existing leads are rejected", () => {
  const key = "https://www.linkedin.com/in/ada-nkem";
  const parsed = parseSourceCandidates([
    { ...good, source_url: "" },
    { ...good, url: "https://linkedin.com/company/acme" },
    good,
  ], { existingKeys: new Set([key]) });
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.rejected.length, 3);
});

test("refresh=true permits an intentional recheck", () => {
  const key = "https://www.linkedin.com/in/ada-nkem";
  const parsed = parseSourceCandidates([{ ...good, refresh: true }], { existingKeys: new Set([key]) });
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].refresh, true);
});
