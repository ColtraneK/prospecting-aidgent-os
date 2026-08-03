// sheet.mjs — Google Sheets maintenance (unattended, service-account auth).
// I/O only. All planning/merge logic is pure (merge.mjs, sheetPlan.mjs) so tests
// never touch the network. googleapis is imported lazily so the pure modules and
// their tests do not require it to be installed.
//
// This layer maintains an EXISTING Sheet in place. It detects the Leads header
// row (it need not be row 3), preserves human columns K:R, and ensures the
// system columns S:AC exist before writing. It never deletes rows.

import { LEADS_HEADERS, SYSTEM_FIELDS, colLetter, COLS, checkLeadsLayout } from "./schema.mjs";
import { buildValueUpdates, LEADS_TAB } from "./sheetPlan.mjs";
import { toRunLogRow, RUN_LOG_HEADERS } from "./runlog.mjs";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const LAST_COL = colLetter(LEADS_HEADERS.length - 1); // derived from schema.mjs

/** Thrown when a sheet's header row is from an older column layout. */
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
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

/** Find the 1-based header row by locating "Name" in column A within the top rows. */
export function detectHeaderRow(values) {
  for (let i = 0; i < Math.min(values.length, 30); i++) {
    const row = values[i] || [];
    if (String(row[0] || "").trim().toLowerCase() === "name") return i + 1;
  }
  return 3; // sensible default for sheets built by BuildLeadSheet.gs
}

/**
 * Read the Leads tab into { headers, headerRow, firstDataRow, rows:[{rowNumber, cells}] }.
 * Robust to the header row not being row 3.
 */
export async function readLeads(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${LEADS_TAB}!A1:${LAST_COL}`,
  });
  const values = res.data.values || [];
  const headerRow = detectHeaderRow(values);
  const raw = values[headerRow - 1] || [];
  // Refuse an old-layout sheet HERE, before a run spends twenty minutes walking
  // LinkedIn only to write the intro DM into someone's "Reached Out" column.
  const layout = checkLeadsLayout(raw);
  if (!layout.ok) throw new LeadsLayoutError(layout.message, layout.mismatch);
  // rawHeaders is what the sheet ACTUALLY says, blanks and all. `headers` fills
  // the blanks in so cell lookup works; passing the filled version back to the
  // write guard would make it check its own defaults and always pass.
  const rawHeaders = raw.map((h) => String(h == null ? "" : h));
  const headers = (values[headerRow - 1] || LEADS_HEADERS).map((h, i) => String(h || LEADS_HEADERS[i] || ""));
  const rows = [];
  for (let i = headerRow; i < values.length; i++) {
    const arr = values[i] || [];
    const cells = {};
    headers.forEach((h, ci) => {
      if (h) cells[h] = arr[ci] !== undefined ? arr[ci] : "";
    });
    if (!cells["Name"] && !cells["LinkedIn (or profile URL)"]) continue; // skip blanks
    rows.push({ rowNumber: i + 1, cells });
  }
  return { headers, rawHeaders, headerRow, firstDataRow: headerRow + 1, rows };
}

/**
 * Ensure the system columns S:AC exist in the header row. Non-destructive: only
 * writes headers that are missing, into their canonical positions.
 * The range is derived from SYSTEM_FIELDS, so adding a system column here is
 * enough — an older sheet gets the new headers on its next run.
 *
 * This leniency covers a sheet that is missing trailing system headers. It does
 * NOT cover a sheet whose columns are in the old order: checkLeadsLayout()
 * refuses that case in readLeads, because patching it would silently misalign
 * every existing row.
 */
export async function ensureLeadsSchema(sheets, spreadsheetId, headerRow) {
  const startCol = COLS[SYSTEM_FIELDS[0]].letter;
  const endCol = COLS[SYSTEM_FIELDS[SYSTEM_FIELDS.length - 1]].letter;
  const range = `${LEADS_TAB}!${startCol}${headerRow}:${endCol}${headerRow}`;
  const cur = await sheets.spreadsheets.values.get({ spreadsheetId, range }).catch(() => ({ data: {} }));
  const existing = (cur.data.values && cur.data.values[0]) || [];
  const needs = SYSTEM_FIELDS.some((h, i) => String(existing[i] || "").trim() !== h);
  if (needs) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [SYSTEM_FIELDS] },
    });
  }
}

/**
 * Apply a merge plan: append new leads, then update ONLY the agent/system
 * columns of existing leads. Never writes K:R. Never deletes rows.
 */
export async function applyPlan(sheets, spreadsheetId, plan, { headerRow = 3, firstDataRow = 4, headers = null } = {}) {
  // Second guard, at the last moment before any write. readLeads already
  // checked, but applyPlan is reachable on its own and a misaligned write is
  // not recoverable.
  if (headers) {
    const layout = checkLeadsLayout(headers);
    if (!layout.ok) throw new LeadsLayoutError(layout.message, layout.mismatch);
  }
  await ensureLeadsSchema(sheets, spreadsheetId, headerRow);
  const { appends, cellUpdates } = buildValueUpdates(plan);

  if (appends.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${LEADS_TAB}!A${firstDataRow}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appends },
    });
  }
  if (cellUpdates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: cellUpdates.map((u) => ({ range: u.range, values: u.values })),
      },
    });
  }
  return { appended: appends.length, updated: cellUpdates.length };
}

/** Ensure a "Run Log" tab exists (with headers), then append one report row. */
export async function appendRunLog(sheets, spreadsheetId, report) {
  await ensureTab(sheets, spreadsheetId, "Run Log", RUN_LOG_HEADERS);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Run Log!A1",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [toRunLogRow(report)] },
  });
}

async function ensureTab(sheets, spreadsheetId, title, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === title);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
  }
}

/**
 * Translate a Google Sheets API failure into the sentence that actually fixes it.
 *
 * Both of the common failures are silent setup mistakes, and both surface as a
 * raw GaxiosError stack that sends people looking in the wrong place: a 403 is
 * almost always "you never shared the sheet with the service account" (the
 * service account is a different identity from your own Google login, so your
 * own access proves nothing), and a 404 is almost always a mistyped or wrong id.
 * Pure and string-in/string-out, so it is testable without the network.
 *
 * Returns null when the error is not one of these, so callers can rethrow.
 */
export function explainSheetsError(err, { sheetId = "", credentialsPath = "" } = {}) {
  const status = Number(err && (err.status || err.code)) || 0;
  const msg = String((err && err.message) || "");
  const where = sheetId ? ` (${sheetId})` : "";
  if (status === 403 || /caller does not have permission|insufficient|forbidden/i.test(msg)) {
    return [
      `Google refused access to that sheet${where}.`,
      "",
      "Almost always this means the sheet is not shared with the service account.",
      "The service account is a SEPARATE Google identity from your own login, so",
      "being able to open the sheet yourself does not give it access.",
      "",
      credentialsPath
        ? `Open ${credentialsPath}, copy the "client_email" value,`
        : 'Open your service-account .json key, copy the "client_email" value,',
      "then in the sheet click Share, paste that address, set it to Editor, and Send.",
    ].join("\n");
  }
  // A tab created by hand has 26 columns; the Leads layout needs 28. The API
  // says "exceeds grid limits", which sounds like a bug in this tool and is
  // actually a sheet that was never built.
  if (/exceeds grid limits|max columns/i.test(msg)) {
    return [
      `That sheet's Leads tab is too narrow for the lead layout${where}.`,
      "",
      `The Leads tab needs ${LEADS_HEADERS.length} columns (A to ${LAST_COL}) and a hand-made tab is too narrow.`,
      "Open the sheet, then Extensions > Apps Script, and run buildLeadSheet.",
      "It widens the tab and builds the headers, dropdowns and formatting in one go.",
      "",
      "If you would rather not paste a script: open the shared template, click",
      "File > Make a copy, and bind that copy instead.",
    ].join("\n");
  }
  if (status === 404 || /requested entity was not found|not found/i.test(msg)) {
    return [
      `Google has no sheet with that id${where}.`,
      "",
      "Check the id you bound. The safest way is to open your sheet in the browser",
      "and copy the whole URL, then re-run bind-sheet with that URL.",
    ].join("\n");
  }
  return null;
}
