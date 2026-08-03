import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRun, readArtifact, readManifest, writeArtifact, blockRun, latestRun } from "../src/runs.mjs";

test("durable runs preserve artifacts, counts, and resume instructions", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidgent-runs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { manifest } = createRun({ persona: "acme", target: 3, now: new Date("2026-08-03T12:00:00Z"), root });
  writeArtifact(manifest.runId, "source.json", [{ name: "Ada" }], { root, stage: "enriching", counts: { sourced: 1 } });
  assert.deepEqual(readArtifact(manifest.runId, "source.json", root), [{ name: "Ada" }]);
  assert.equal(readManifest(manifest.runId, root).counts.sourced, 1);
  blockRun(manifest.runId, { kind: "apify", reason: "timeout", resume: "npm run enrich -- --run x" }, { root });
  const blocked = latestRun(root);
  assert.equal(blocked.stage, "blocked");
  assert.equal(blocked.blocker.kind, "apify");
  assert.match(blocked.blocker.resume, /npm run enrich/);
});
