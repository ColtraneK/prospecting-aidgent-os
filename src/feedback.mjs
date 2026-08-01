// feedback.mjs — the code path behind the sheet's Feedback tab.
//
// The tab is how a non-technical person steers targeting: they write plain
// English in columns A–C, the agent translates each note into a persona change,
// and columns D–F record what happened.
//
// The v6 contract: an unapplied row NEVER bricks a run — it is printed as a
// LOUD warning at the start of `inspect` and `qualify`, and the agent applies
// it inline (it edits the persona anyway) and stamps it:
//   - `npm run feedback -- --list` shows what is waiting
//   - `npm run feedback -- --apply <row> --changed "<what changed>"` stamps D–F
//   - `npm run feedback -- --needs-decision <row> --reason "<why>"` stamps D+F
// A row marked "Needs a decision" is waiting on the human and is printed until
// resolved.

export const FEEDBACK_TAB = "Feedback";
export const FEEDBACK_HEADERS = [
  "Date", // A  theirs
  "What to change", // B  theirs
  "Must / Prefer / Avoid", // C  theirs
  "Status", // D  agent: New (blank) | Applied | Needs a decision
  "Applied on", // E  agent
  "What your agent changed", // F  agent
];

export const STATUS_APPLIED = "Applied";
export const STATUS_NEEDS_DECISION = "Needs a decision";

/**
 * Parse the raw Feedback!A1:F values into rows. Pure. Tolerates the banner and
 * subtitle rows above the header, and a header row that is not row 3.
 * A row counts as feedback when column B carries any text.
 */
export function parseFeedback(values = []) {
  let headerRow = 0;
  for (let i = 0; i < Math.min(values.length, 10); i++) {
    const a = String((values[i] || [])[0] || "").trim().toLowerCase();
    const b = String((values[i] || [])[1] || "").trim().toLowerCase();
    if (a === "date" && b.startsWith("what")) { headerRow = i + 1; break; }
  }
  if (!headerRow) headerRow = 3;
  const rows = [];
  for (let i = headerRow; i < values.length; i++) {
    const arr = values[i] || [];
    const note = String(arr[1] || "").trim();
    if (!note) continue;
    rows.push({
      rowNumber: i + 1,
      date: String(arr[0] || "").trim(),
      note,
      intent: String(arr[2] || "").trim(), // Must / Prefer / Avoid
      status: String(arr[3] || "").trim(),
      appliedOn: String(arr[4] || "").trim(),
      changed: String(arr[5] || "").trim(),
    });
  }
  return { headerRow, rows };
}

/** Rows the person wrote that nobody has handled yet. Status New (blank). */
export function unappliedRows(rows = []) {
  return rows.filter((r) => {
    const s = r.status.toLowerCase();
    return s !== STATUS_APPLIED.toLowerCase() && s !== STATUS_NEEDS_DECISION.toLowerCase();
  });
}

/**
 * The loud warning inspect and qualify print when feedback sits unapplied.
 * A note nobody applied never bricks a run — but it is never silent either.
 */
export function formatWarning(unapplied = [], waiting = []) {
  if (!unapplied.length && !waiting.length) return "";
  const lines = [];
  if (unapplied.length) {
    lines.push(`WARNING: ${unapplied.length} feedback row(s) on the sheet's Feedback tab are not applied yet.`);
    lines.push(formatFeedback(unapplied));
    lines.push("The person wrote these to change the targeting. Apply each one now — edit the");
    lines.push("persona to match, then stamp it:");
    lines.push('  npm run feedback -- --apply <row> --changed "<what you changed>"');
    lines.push("or, if it needs the person:");
    lines.push('  npm run feedback -- --needs-decision <row> --reason "<why>"');
  }
  if (waiting.length) {
    lines.push(`${waiting.length} feedback row(s) are waiting on the person's decision:`);
    lines.push(formatFeedback(waiting));
  }
  return lines.join("\n");
}

/** Rows triaged as needing the person's decision — never silently forgotten. */
export function needsDecisionRows(rows = []) {
  return rows.filter((r) => r.status.toLowerCase() === STATUS_NEEDS_DECISION.toLowerCase());
}

/** Human-readable listing for the console. */
export function formatFeedback(rows = []) {
  if (!rows.length) return "Feedback tab: no rows waiting.";
  const lines = ["Feedback rows:"];
  for (const r of rows) {
    const status = r.status || "New";
    lines.push(`  row ${r.rowNumber} [${status}]${r.intent ? ` (${r.intent})` : ""}: ${r.note}` +
      (r.changed ? `\n      -> ${r.changed}` : ""));
  }
  return lines.join("\n");
}

/** Read the Feedback tab. Returns { headerRow, rows }; missing tab -> no rows. */
export async function readFeedback(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values
    .get({ spreadsheetId, range: `${FEEDBACK_TAB}!A1:F300` })
    .catch((err) => {
      // A sheet without the tab (older copy) has no feedback to apply; anything
      // else (permissions, bad id) must surface, not pass as "no feedback".
      if (/unable to parse range|not found/i.test(String(err && err.message))) return { data: {} };
      throw err;
    });
  return parseFeedback(res.data.values || []);
}

/** Stamp the agent columns D–F of one feedback row. Never touches A–C. */
export async function writeFeedbackStatus(sheets, spreadsheetId, rowNumber, { status, appliedOn = "", changed = "" }) {
  const row = Number(rowNumber);
  if (!Number.isInteger(row) || row < 1) throw new Error(`bad feedback row number: ${rowNumber}`);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${FEEDBACK_TAB}!D${row}:F${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status, appliedOn, changed]] },
  });
}
