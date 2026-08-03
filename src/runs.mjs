// Durable, resumable run state. Every stage writes an immutable artifact and
// advances manifest.json; scheduled tasks can stop and resume without inventing
// progress or paying for the same Apify batch twice.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPO_ROOT } from "./config.mjs";

export const RUNS_DIR = path.join(REPO_ROOT, "private", "runs");
export const STAGES = ["sourcing", "enriching", "browser_verification", "qualifying", "complete", "blocked"];

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

export function makeRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

export function runPath(runId, root = RUNS_DIR) {
  const id = String(runId || "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) throw new Error(`invalid run id: ${id || "(blank)"}`);
  return path.join(root, id);
}

export function createRun({ persona = "", target = 10, now = new Date(), root = RUNS_DIR } = {}) {
  const runId = makeRunId(now);
  // A fresh clone has no ignored private/runs directory. Creating it here is
  // part of starting a durable run, not a setup chore for the person.
  fs.mkdirSync(root, { recursive: true });
  const dir = runPath(runId, root);
  fs.mkdirSync(dir, { recursive: false });
  const manifest = {
    version: 1,
    runId,
    persona,
    target: Number(target) || 0,
    stage: "sourcing",
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    blocker: null,
    counts: { sourced: 0, enriched: 0, browserVerified: 0, qualified: 0, written: 0 },
    artifacts: {},
  };
  atomicJson(path.join(dir, "manifest.json"), manifest);
  return { dir, manifest };
}

export function readManifest(runId, root = RUNS_DIR) {
  const file = path.join(runPath(runId, root), "manifest.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function updateManifest(runId, patch = {}, { root = RUNS_DIR, now = new Date() } = {}) {
  const current = readManifest(runId, root);
  const next = {
    ...current,
    ...patch,
    counts: { ...(current.counts || {}), ...(patch.counts || {}) },
    artifacts: { ...(current.artifacts || {}), ...(patch.artifacts || {}) },
    updatedAt: now.toISOString(),
  };
  if (!STAGES.includes(next.stage)) throw new Error(`invalid run stage: ${next.stage}`);
  atomicJson(path.join(runPath(runId, root), "manifest.json"), next);
  return next;
}

export function writeArtifact(runId, name, value, { root = RUNS_DIR, stage, counts } = {}) {
  if (!/^[a-z0-9_.-]+\.json$/i.test(name)) throw new Error(`invalid artifact name: ${name}`);
  const file = path.join(runPath(runId, root), name);
  atomicJson(file, value);
  const rel = name.replace(/\\/g, "/");
  const patch = { artifacts: { [name.replace(/\.json$/i, "")]: rel } };
  if (stage) patch.stage = stage;
  if (counts) patch.counts = counts;
  updateManifest(runId, patch, { root });
  return file;
}

export function readArtifact(runId, name, root = RUNS_DIR) {
  return JSON.parse(fs.readFileSync(path.join(runPath(runId, root), name), "utf8"));
}

export function latestRun(root = RUNS_DIR) {
  let ids = [];
  try { ids = fs.readdirSync(root).filter((id) => fs.existsSync(path.join(root, id, "manifest.json"))); } catch { return null; }
  ids.sort().reverse();
  return ids.length ? readManifest(ids[0], root) : null;
}

export function blockRun(runId, blocker, opts = {}) {
  return updateManifest(runId, { stage: "blocked", blocker: { ...blocker, at: new Date().toISOString() } }, opts);
}
