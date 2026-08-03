import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBrowserVerifications, mergeBrowserEvidence } from "../src/browserVerification.mjs";

const candidate = { name: "Ada", url: "https://www.linkedin.com/in/ada-nkem" };

test("Browser observations are constrained to candidates in the run", () => {
  const parsed = parseBrowserVerifications({ verifications: [
    { url: candidate.url, name: "Ada Nkem", headline: "COO", connection_status: "2nd", checked_at: "2026-08-03" },
    { url: "https://www.linkedin.com/in/someone-else", name: "Other", connection_status: "1st" },
  ] }, { candidates: [candidate] });
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rejected.length, 1);
  assert.equal(parsed.rows[0].browser_connection_status, "2nd");
  assert.equal(parsed.rows[0].browser_verified, true);
});

test("connection labels are normalized and blockers are never accepted", () => {
  const pending = parseBrowserVerifications([{ url: candidate.url, connection_status: "Request sent" }], { candidates: [candidate] });
  assert.equal(pending.rows[0].browser_connection_status, "Pending");
  const blocked = parseBrowserVerifications([{ url: candidate.url, blocker: "checkpoint" }], { candidates: [candidate] });
  assert.equal(blocked.rows.length, 0);
  assert.match(blocked.rejected[0].reason, /checkpoint/);
});

test("unverified candidates remain explicitly unverified after merge", () => {
  const merged = mergeBrowserEvidence([candidate, { name: "Bo", url: "https://www.linkedin.com/in/bo-lee" }], [
    { url: candidate.url, browser_verified: true, browser_connection_status: "1st" },
  ]);
  assert.equal(merged[0].browser_verified, true);
  assert.equal(merged[1].browser_verified, false);
});
