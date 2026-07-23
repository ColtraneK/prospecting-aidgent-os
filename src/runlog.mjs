// runlog.mjs — build the run report object and its Run Log row. Pure.

import { RUN_LOG_HEADERS } from "./schema.mjs";

/** Deterministic run id from an injected timestamp + short random-ish suffix. */
export function makeRunId(nowIso, suffix = "") {
  const stamp = String(nowIso).replace(/[^0-9]/g, "").slice(0, 14);
  return `run-${stamp}${suffix ? "-" + suffix : ""}`;
}

/**
 * @param {{runId, persona, requestedTarget, counts, blocker, startedMs, endedMs, nowIso}} r
 */
export function buildRunReport(r) {
  const durationSec = Math.max(0, Math.round(((r.endedMs || 0) - (r.startedMs || 0)) / 1000));
  const counts = r.counts || {};
  return {
    runId: r.runId,
    timestamp: r.nowIso,
    persona: r.persona,
    requestedTarget: r.requestedTarget,
    candidatesInspected: counts.inspected || 0,
    newLeads: counts.newLeads || 0,
    updatedLeads: counts.updatedLeads || 0,
    duplicatesSkipped: counts.duplicatesSkipped || 0,
    rejectedCandidates: counts.rejected || 0,
    blocker: r.blocker || "",
    durationSec,
  };
}

/** Row array aligned to RUN_LOG_HEADERS. */
export function toRunLogRow(report) {
  return [
    report.runId,
    report.timestamp,
    report.persona,
    report.requestedTarget,
    report.candidatesInspected,
    report.newLeads,
    report.updatedLeads,
    report.duplicatesSkipped,
    report.rejectedCandidates,
    report.blocker,
    report.durationSec,
  ];
}

export function formatRunReport(report) {
  const lines = [
    `Run ${report.runId} (${report.persona})`,
    `  target: ${report.requestedTarget}   inspected: ${report.candidatesInspected}`,
    `  new: ${report.newLeads}   updated: ${report.updatedLeads}   dupes: ${report.duplicatesSkipped}   rejected: ${report.rejectedCandidates}`,
    `  duration: ${report.durationSec}s`,
  ];
  if (report.blocker) lines.push(`  BLOCKER: ${report.blocker}`);
  return lines.join("\n");
}

export { RUN_LOG_HEADERS };
