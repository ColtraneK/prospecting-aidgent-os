// Turn human tracking plus browser-observed connection state into one explicit
// next action. Nothing here sends or clicks anything.

export function nextActionFor(cells = {}, { now = new Date(), followUpDays = 5, recheckDays = 2 } = {}) {
  const outcome = String(cells["Outcome"] || "").trim();
  const replied = valueSet(cells["Replied"]);
  const reached = parseDateOrSet(cells["Reached Out On"]);
  const humanConnection = String(cells["Connected/Req Sent"] || "").trim().toLowerCase();
  const browserConnection = String(cells["Browser Connection Status"] || "Unknown").trim();
  const checked = parseDate(cells["Connection Checked On"]);

  if (/not interested|do not contact|disqualified|closed|converted|customer|won|lost/i.test(outcome)) {
    return { action: "No action", due: "", priority: 9 };
  }
  if (replied) return { action: "Review reply", due: dateOnly(now), priority: 1 };
  if (reached.set) {
    const due = reached.date ? addDays(reached.date, followUpDays) : dateOnly(now);
    return new Date(due) <= startOfDay(now)
      ? { action: "Follow up", due, priority: 2 }
      : { action: "Waiting for reply", due, priority: 6 };
  }
  if (browserConnection === "1st" || humanConnection === "connected") {
    return { action: "Send first message", due: dateOnly(now), priority: 2 };
  }
  if (browserConnection === "Pending" || humanConnection.includes("request")) {
    return { action: "Recheck connection", due: checked ? addDays(checked, recheckDays) : dateOnly(now), priority: 5 };
  }
  if (["2nd", "3rd+"].includes(browserConnection)) {
    return { action: "Send connection request", due: dateOnly(now), priority: 3 };
  }
  return { action: "Browser-check profile", due: dateOnly(now), priority: 4 };
}

export function planNextActions(existingSheet, opts = {}) {
  const updates = [], queue = [];
  for (const row of existingSheet?.rows || []) {
    const next = nextActionFor(row.cells, opts);
    updates.push({ rowNumber: row.rowNumber, set: { "Next Action": next.action, "Next Action Due": next.due } });
    queue.push({ rowNumber: row.rowNumber, name: row.cells.Name || "", url: row.cells["LinkedIn (or profile URL)"] || "", ...next });
  }
  queue.sort((a, b) => a.priority - b.priority || String(a.due).localeCompare(String(b.due)) || a.name.localeCompare(b.name));
  return { updates, queue };
}

function valueSet(v) { return !/^(|false|no|0)$/i.test(String(v == null ? "" : v).trim()); }
function parseDateOrSet(v) { const set = valueSet(v); return { set, date: set ? parseDate(v) : null }; }
function parseDate(v) { const d = new Date(String(v || "")); return Number.isNaN(d.getTime()) ? null : d; }
function dateOnly(v) { const d = v instanceof Date ? v : new Date(v); return d.toISOString().slice(0, 10); }
function addDays(v, days) { const d = v instanceof Date ? new Date(v) : new Date(v); d.setUTCDate(d.getUTCDate() + days); return dateOnly(d); }
function startOfDay(v) { const d = new Date(v); d.setHours(0, 0, 0, 0); return d; }
