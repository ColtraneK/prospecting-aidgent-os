// sheet.mjs — Google Sheets maintenance (unattended, service-account auth).
// I/O only. All planning/merge logic is pure (merge.mjs, sheetPlan.mjs) so tests
// never touch the network. googleapis is imported lazily so the pure modules and
// their tests do not require it to be installed.
//
// This layer maintains an EXISTING Sheet in place. It detects the Leads header
// row (it need not be row 3), preserves human columns H:N, and ensures the
// system columns O:Y exist before writing. It never deletes rows.

import { LEADS_HEADERS, SYSTEM_FIELDS, colLetter, COLS } from "./schema.mjs";
import { buildValueUpdates, LEADS_TAB } from "./sheetPlan.mjs";
import { toRunLogRow, RUN_LOG_HEADERS } from "./runlog.mjs";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const LAST_COL = colLetter(LEADS_HEADERS.length - 1); // "Y" (derived, so it follows schema.mjs)

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
  return { headers, headerRow, firstDataRow: headerRow + 1, rows };
}

/**
 * Ensure the system columns O:Y exist in the header row. Non-destructive: only
 * writes headers that are missing, into their canonical O:Y positions.
 * The range is derived from SYSTEM_FIELDS, so adding a system column here is
 * enough — an older sheet gets the new headers on its next run.
 */
export async function ensureLeadsSchema(sheets, spreadsheetId, headerRow) {
  const startCol = COLS[SYSTEM_FIELDS[0]].letter; // O
  const endCol = COLS[SYSTEM_FIELDS[SYSTEM_FIELDS.length - 1]].letter; // Y
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
 * columns of existing leads. Never writes H:N. Never deletes rows.
 */
export async function applyPlan(sheets, spreadsheetId, plan, { headerRow = 3, firstDataRow = 4 } = {}) {
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
