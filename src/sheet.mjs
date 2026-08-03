// Google Sheets I/O.  The merge plan is semantic; this module resolves the
// attendee's actual header row before any read or write.

import { checkLeadsLayout, resolveLeadsLayout, normalizeHeader, colLetter } from "./schema.mjs";
import { buildAppendCellUpdates, buildValueUpdates, LEADS_TAB } from "./sheetPlan.mjs";
import { toRunLogRow, RUN_LOG_HEADERS } from "./runlog.mjs";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const READ_LAST_COL = "ZZ";

export class LeadsLayoutError extends Error {
  constructor(message, mismatch) {
    super(message);
    this.name = "LeadsLayoutError";
    this.mismatch = mismatch;
  }
}

export async function getSheets(credentialsPath) {
  if (!credentialsPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set");
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({ keyFile: credentialsPath, scopes: SCOPES });
  return google.sheets({ version: "v4", auth: await auth.getClient() });
}

/** Find a header row even if Name was moved away from column A. */
export function detectHeaderRow(values, overrides = {}) {
  for (let i = 0; i < Math.min(values.length, 30); i++) {
    const row = values[i] || [];
    if (row.some((cell) => normalizeHeader(cell) === "name")) return i + 1;
    if (resolveLeadsLayout(row, overrides).ok) return i + 1;
  }
  return 1;
}

/**
 * Read rows into canonical semantic fields.  Extra columns stay untouched;
 * reordering and registered aliases do not change the returned field names.
 */
export async function readLeads(sheets, spreadsheetId, { overrides = {} } = {}) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${LEADS_TAB}!A1:${READ_LAST_COL}` });
  const values = res.data.values || [];
  const headerRow = detectHeaderRow(values, overrides);
  const checked = checkLeadsLayout(values[headerRow - 1] || [], overrides);
  if (!checked.ok) throw new LeadsLayoutError(checked.message, checked.mismatch);
  const layout = checked.layout;
  const rows = [];
  for (let i = headerRow; i < values.length; i++) {
    const arr = values[i] || [];
    const cells = {};
    for (const [field, resolved] of Object.entries(layout.byCanonical)) {
      cells[field] = arr[resolved.index0] === undefined ? "" : arr[resolved.index0];
    }
    if (!cells.Name && !cells["LinkedIn (or profile URL)"]) continue;
    rows.push({ rowNumber: i + 1, cells });
  }
  const firstDataRow = headerRow + 1;
  const lastLeadRow = rows.reduce((last, row) => Math.max(last, row.rowNumber), firstDataRow - 1);
  return {
    headers: layout.headers, rawHeaders: layout.headers, layout, headerRow, firstDataRow,
    lastLeadRow, nextAppendRow: lastLeadRow + 1, rows,
  };
}

/** Apply only recognized agent/system fields; no position-based writes. */
export async function applyPlan(sheets, spreadsheetId, plan, { headerRow = 1, firstDataRow = 2, appendRow = firstDataRow, headers = null, layout = null, overrides = {} } = {}) {
  const liveLayout = layout || (headers ? checkLeadsLayout(headers, overrides).layout : null);
  if (!liveLayout?.ok) {
    const checked = checkLeadsLayout(headers || [], overrides);
    throw new LeadsLayoutError(checked.message, checked.mismatch);
  }
  const { cellUpdates } = buildValueUpdates(plan, liveLayout);
  const appendUpdates = buildAppendCellUpdates(plan.newRows || [], liveLayout, appendRow);
  const writes = [...appendUpdates, ...cellUpdates];
  if (writes.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: writes.map((u) => ({ range: u.range, values: u.values })) },
    });
  }
  return { appended: (plan.newRows || []).length, updated: cellUpdates.length };
}

export async function appendRunLog(sheets, spreadsheetId, report) {
  await ensureTab(sheets, spreadsheetId, "Run Log", RUN_LOG_HEADERS);
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: "Run Log!A1", valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
    requestBody: { values: [toRunLogRow(report)] },
  });
}

async function ensureTab(sheets, spreadsheetId, title, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  if ((meta.data.sheets || []).some((s) => s.properties.title === title)) return;
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title } } }] } });
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${title}!A1`, valueInputOption: "RAW", requestBody: { values: [headers] } });
}

export function explainSheetsError(err, { sheetId = "", credentialsPath = "" } = {}) {
  const status = Number(err && (err.status || err.code)) || 0;
  const msg = String((err && err.message) || "");
  const where = sheetId ? ` (${sheetId})` : "";
  if (status === 403 || /caller does not have permission|insufficient|forbidden/i.test(msg)) {
    return [
      `Google refused access to that sheet${where}.`, "",
      "The Sheet is not shared with the service account. Share the copied Sheet with its client_email as Editor.",
      "The service account is a SEPARATE Google identity, so your own access is not enough.",
      credentialsPath ? `Find client_email in ${credentialsPath}.` : "Find client_email in the service-account JSON key.",
    ].join("\n");
  }
  if (/exceeds grid limits|max columns/i.test(msg)) {
    return [
      `That Sheet is too narrow for the values Codex is appending${where}.`,
      "Copy the official template instead of rebuilding a live Sheet; Codex preserves added or moved columns automatically.",
    ].join("\n");
  }
  if (status === 404 || /requested entity was not found|not found/i.test(msg)) {
    return `Google has no Sheet with that id${where}. Copy the full URL from your browser and run bind-sheet again.`;
  }
  return null;
}
