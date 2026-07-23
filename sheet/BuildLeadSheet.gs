/**
 * ============================================================================
 *  AIDGENT OS  ·  Lead Sheet builder 
 * ----------------------------------------------------------------------------
 *  Builds and SAFELY refreshes the workbook the local research worker maintains.
 *
 *  Tabs: Start Here · Leads · ICP + Schedule · Personas · Prompt Library ·
 *        Lists · Run Log
 *
 *  Leads columns (must match src/schema.mjs and sheet/SHEET.md):
 *    A-G  agent output  : Name · Title / Company · LinkedIn (or profile URL) ·
 *                         Recent Post (verbatim + link) · Why Them ·
 *                         Suggested Comment · Suggested Intro DM
 *    H-N  human tracking: Reached Out · Replied · Outcome · Date Added ·
 *                         Source Type · Batch · Notes
 *    O-U  system fields : Activity Date · Activity Type · Fit Score ·
 *                         Last Verified · Canonical Key · Research Source · Research Status
 *
 *  RE-RUNNING IS SAFE. "Build / refresh" never clears Leads data, human tracking,
 *  your ICP + Schedule inputs, or Run Log history. It only refreshes headers,
 *  formatting, validation, and the static guidance tabs. Clearing leads is a
 *  separate, explicitly-confirmed action.
 *
 *  SETUP — USE YOUR EXISTING SHEET. Do NOT open sheets.new; that creates a new
 *  spreadsheet. Open the Sheet you want to use (or File > Make a copy of the
 *  provided template first), then in THAT sheet: Extensions > Apps Script ->
 *  paste this file -> run buildAidgentOsSheet. This script is container-bound:
 *  it only ever edits the spreadsheet it lives in, and never creates a new one.
 *  Then bind that sheet's id to your persona (sheet_id) / GOOGLE_SHEET_ID so the
 *  worker maintains the same sheet.
 * ============================================================================
 */

var NAVY = "#0A2540", CYAN = "#14CCF7", INK = "#1A2230", GRAY = "#8A93A2";
var SOFT = "#F2FBFE", SOFTBORDER = "#BDE9FA", ROWBG = "#F7FAFC", YELLOW = "#FFF8E1", WHITE = "#FFFFFF", FONT = "Arial";

var HEADER_ROW = 3, FIRST_DATA_ROW = 4;

var OUTCOMES = ["No response", "Neutral", "Positive", "Not a fit", "Follow up"];
var SOURCE_TYPES = ["LinkedIn", "Public web", "Referral", "Other"];
var RESEARCH_STATUS = ["New", "Refreshed", "Needs review"];

// [title, widthPx, type, group]  type: text|link|check|outcome|source|status|date|num
var LEADS_COLS = [
  ["Name", 170, "text", "agent"],
  ["Title / Company", 220, "text", "agent"],
  ["LinkedIn (or profile URL)", 180, "link", "agent"],
  ["Recent Post (verbatim + link)", 300, "text", "agent"],
  ["Why Them", 240, "text", "agent"],
  ["Suggested Comment", 320, "text", "agent"],
  ["Suggested Intro DM", 320, "text", "agent"],
  ["Reached Out", 90, "check", "human"],
  ["Replied", 80, "check", "human"],
  ["Outcome", 120, "outcome", "human"],
  ["Date Added", 100, "date", "human"],
  ["Source Type", 120, "source", "human"],
  ["Batch", 90, "text", "human"],
  ["Notes", 220, "text", "human"],
  ["Activity Date", 100, "date", "system"],
  ["Activity Type", 100, "text", "system"],
  ["Fit Score", 80, "num", "system"],
  ["Last Verified", 100, "date", "system"],
  ["Canonical Key", 220, "text", "system"],
  ["Research Source", 130, "text", "system"],
  ["Research Status", 120, "status", "system"],
];

var RUN_LOG_HEADERS = [
  "Run ID", "Timestamp", "Persona", "Requested Target", "Candidates Inspected",
  "New Leads", "Updated Leads", "Duplicates Skipped", "Rejected Candidates",
  "Blocker / Failure", "Duration (s)",
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚡ Aidgent OS")
    .addItem("Build / refresh all tabs", "buildAidgentOsSheet")
    .addSeparator()
    .addItem("Clear the Leads list…", "clearLeadsConfirm")
    .addItem("About", "aboutAidgentOs")
    .addToUi();
}

function buildAidgentOsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureLeads_(ss); // safe refresh, preserves data
  rebuildStartHere_(ss); // static
  ensureIcpSchedule_(ss); // create if missing, preserve inputs
  ensurePersonas_(ss); // create if missing
  rebuildPromptLibrary_(ss); // static
  rebuildLists_(ss); // static
  ensureRunLog_(ss); // create if missing, preserve history
  orderTabs_(ss, ["Start Here", "Leads", "ICP + Schedule", "Personas", "Prompt Library", "Lists", "Run Log"]);
  var start = ss.getSheetByName("Start Here"); if (start) ss.setActiveSheet(start);
  var def = ss.getSheetByName("Sheet1");
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) { try { ss.deleteSheet(def); } catch (e) {} }
  SpreadsheetApp.getActive().toast("Aidgent OS workbook is ready (data preserved).", "⚡ Built", 5);
}

// --- Leads (SAFE refresh: never clears data) -------------------------------
function ensureLeads_(ss) {
  var sh = ss.getSheetByName("Leads") || ss.insertSheet("Leads");
  var n = LEADS_COLS.length;
  sh.setHiddenGridlines(true);
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());

  banner_(sh, "AIDGENT OS   ·   LEADS", "Agent output A-G  ·  your tracking H-N  ·  system research O-U  ·  the worker never overwrites H-N", n);
  var headers = LEADS_COLS.map(function (c) { return c[0]; });
  sh.getRange(HEADER_ROW, 1, 1, n).setValues([headers])
    .setBackground(NAVY).setFontColor(WHITE).setFontFamily(FONT).setFontWeight("bold")
    .setFontSize(10).setWrap(true).setVerticalAlignment("middle");
  sh.setRowHeight(HEADER_ROW, 30);

  // Guidance notes on header cells by group.
  for (var i = 0; i < n; i++) {
    var group = LEADS_COLS[i][3];
    var note = group === "human" ? "Human-managed. The research worker NEVER writes this column."
      : group === "system" ? "System/agent-managed research field. Avoid hand-editing."
      : "Agent output. Refreshed on each run; safe to edit your own copy.";
    sh.getRange(HEADER_ROW, i + 1).setNote(note);
    sh.setColumnWidth(i + 1, LEADS_COLS[i][1]);
  }

  var maxRows = sh.getMaxRows();
  var dataRows = maxRows - HEADER_ROW;
  for (var c = 0; c < n; c++) {
    var col = c + 1, type = LEADS_COLS[c][2];
    var body = sh.getRange(FIRST_DATA_ROW, col, dataRows, 1);
    body.setFontFamily(FONT).setFontColor(INK).setFontSize(10).setVerticalAlignment("top");
    body.setWrapStrategy(type === "text" ? SpreadsheetApp.WrapStrategy.WRAP : SpreadsheetApp.WrapStrategy.CLIP);
    if (type === "check") { body.insertCheckboxes(); body.setHorizontalAlignment("center"); }
    else if (type === "date") { body.setNumberFormat("yyyy-mm-dd"); body.setHorizontalAlignment("center"); }
    else if (type === "outcome") setListValidation_(body, OUTCOMES);
    else if (type === "source") setListValidation_(body, SOURCE_TYPES);
    else if (type === "status") setListValidation_(body, RESEARCH_STATUS);
  }
  sh.setFrozenRows(HEADER_ROW);
  sh.setFrozenColumns(1);

  // Conditional formatting: zebra + outcome colors + status colors. Rebuilt each run.
  var rng = sh.getRange(FIRST_DATA_ROW, 1, dataRows, n);
  var rules = [SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied("=ISEVEN(ROW())").setBackground(ROWBG).setRanges([rng]).build()];
  var outCol = colOf_("Outcome"), stCol = colOf_("Research Status");
  var outRng = sh.getRange(FIRST_DATA_ROW, outCol, dataRows, 1);
  [["Positive", "#0F9D58", WHITE], ["Follow up", "#FFF2CC", INK], ["Neutral", SOFT, INK], ["No response", "#F1F3F4", GRAY], ["Not a fit", "#F4CCCC", "#7A1F1F"]]
    .forEach(function (m) { rules.push(cf_(m[0], m[1], m[2], outRng)); });
  var stRng = sh.getRange(FIRST_DATA_ROW, stCol, dataRows, 1);
  [["New", SOFT, INK], ["Refreshed", "#DCEEFB", NAVY], ["Needs review", "#FFF2CC", INK]]
    .forEach(function (m) { rules.push(cf_(m[0], m[1], m[2], stRng)); });
  sh.setConditionalFormatRules(rules);
  rng.setBorder(null, null, true, null, false, true, SOFTBORDER, SpreadsheetApp.BorderStyle.SOLID);
  if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
}

// --- Start Here (static) ---------------------------------------------------
function rebuildStartHere_(ss) {
  var sh = ss.getSheetByName("Start Here") || ss.insertSheet("Start Here");
  sh.clear(); sh.clearNotes(); sh.setHiddenGridlines(true);
  var W = 4; sh.setColumnWidth(1, 40); for (var c = 2; c <= W; c++) sh.setColumnWidth(c, 230);
  bigBanner_(sh, W, "AIDGENT OS", "Local, human-approved prospect research ");
  var r = 4;
  section_(sh, r++, W, "Today at a glance");
  metric_(sh, r++, "Prospects", "=COUNTA(Leads!A" + FIRST_DATA_ROW + ":A)");
  metric_(sh, r++, "Reached out", "=COUNTIF(Leads!H" + FIRST_DATA_ROW + ":H,TRUE)");
  metric_(sh, r++, "Replies", "=COUNTIF(Leads!I" + FIRST_DATA_ROW + ":I,TRUE)");
  metric_(sh, r++, "Positive", '=COUNTIF(Leads!J' + FIRST_DATA_ROW + ':J,"Positive")');
  r++;
  section_(sh, r++, W, "How it runs");
  [
    "This is a LOCAL system. Your computer stays on and awake and Codex desktop stays running.",
    "A dedicated Chrome profile that you sign into once does read-only research. It never sends, connects, reacts, comments, or posts.",
    "Each run researches profiles, recent posts, and comments, prefers the last 7 days, and maintains this Sheet.",
    "The worker writes agent (A-G) and system (O-U) fields. It never touches your human columns H-N.",
  ].forEach(function (t) { bullet_(sh, r++, W, t); });
  r++;
  section_(sh, r++, W, "First-time setup");
  [
    "1. Fill ICP + Schedule, then create a private persona (see Personas tab).",
    "2. npm run setup-login -- --persona <slug>  (sign into LinkedIn manually in the opened Chrome).",
    "3. npm run pilot -- --persona <slug> --headless  (review the 10-lead result).",
    "4. npm run source -- --persona <slug> --target 50 --headless --update-sheet  (schedule this locally).",
  ].forEach(function (t) { bullet_(sh, r++, W, t); });
  r++;
  sh.getRange(r, 2, 1, W - 1).merge().setValue("Safety: the agent reads and drafts. It never sends, connects, comments, or posts. Every outward action is yours.")
    .setFontColor(INK).setFontFamily(FONT).setFontSize(10).setWrap(true).setBackground(SOFT)
    .setBorder(true, true, true, true, false, false, SOFTBORDER, SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(r, 42);
  sh.setFrozenRows(2);
  trimCols_(sh, W);
}

// --- ICP + Schedule (create if missing; preserve user inputs) ---------------
function ensureIcpSchedule_(ss) {
  if (ss.getSheetByName("ICP + Schedule")) return; // never overwrite user inputs
  var sh = ss.insertSheet("ICP + Schedule");
  sh.setHiddenGridlines(true);
  var W = 4; sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 190); sh.setColumnWidth(3, 380); sh.setColumnWidth(4, 200);
  bigBanner_(sh, W, "ICP + SCHEDULE", "Yellow cells are yours to edit. This mirrors a persona under private/personas/.");
  var rows = [
    ["", "BUSINESS SNAPSHOT", "", ""],
    ["", "Business / offer", "", "yellow"],
    ["", "Website URL", "https://", "yellow"],
    ["", "Customer outcome", "", "yellow"],
    ["", "Target industries", "", "yellow"],
    ["", "Company sizes", "", "yellow"],
    ["", "", "", ""],
    ["", "LOCKED ICP  •  FIVE LINES", "", ""],
    ["", "1. Who I sell to", "", "yellow"],
    ["", "2. Exact titles", "", "yellow"],
    ["", "3. Geography (include / exclude)", "", "yellow"],
    ["", "4. Buying signal", "", "yellow"],
    ["", "5. Opener voice", "", "yellow"],
    ["", "", "", ""],
    ["", "SOURCING + SCHEDULE", "", ""],
    ["", "Prospects per manual run", "25", "yellow"],
    ["", "Prospects per scheduled run", "50", "yellow"],
    ["", "Weekdays", "Monday–Friday", "yellow"],
    ["", "Run time + timezone", "8:00 AM America/New_York", "yellow"],
    ["", "Recency preference", "Prefer last 7 days; allow strong older matches", ""],
    ["", "Mode", "Local LinkedIn (signed-in profile) or Public-web fallback", ""],
  ];
  writeLabeled_(sh, rows, W);
  sh.setFrozenRows(2);
  trimCols_(sh, W);
}

// --- Personas (create if missing) ------------------------------------------
function ensurePersonas_(ss) {
  if (ss.getSheetByName("Personas")) return;
  var sh = ss.insertSheet("Personas");
  sh.setHiddenGridlines(true);
  var W = 4; sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 200); sh.setColumnWidth(3, 420); sh.setColumnWidth(4, 160);
  bigBanner_(sh, W, "PERSONAS", "Personas are private and local (private/personas/<slug>.yaml). One skill switches between them.");
  var rows = [
    ["", "ACTIVE PERSONA", "", ""],
    ["", "Active slug", "", "yellow"],
    ["", "Last run", "(filled by the worker's Run Log)", ""],
    ["", "", "", ""],
    ["", "COMMANDS", "", ""],
    ["", "List", "npm run list-personas", ""],
    ["", "Select", "npm run select-persona -- --persona <slug>", ""],
    ["", "Validate", "npm run validate-persona -- --persona <slug>", ""],
    ["", "Create from approved ICP", "npm run create-persona -- --from approved-icp.json --slug <slug>", ""],
    ["", "", "", ""],
    ["", "RULES", "", ""],
    ["", "Private", "Real personas live under private/ and are git-ignored.", ""],
    ["", "Public", "The repo ships only a fake example (personas/example-generic.yaml).", ""],
  ];
  writeLabeled_(sh, rows, W);
  sh.setFrozenRows(2);
  trimCols_(sh, W);
}

// --- Prompt Library (static) -----------------------------------------------
function rebuildPromptLibrary_(ss) {
  var sh = ss.getSheetByName("Prompt Library") || ss.insertSheet("Prompt Library");
  sh.clear(); sh.setHiddenGridlines(true);
  var W = 3; sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 230); sh.setColumnWidth(3, 620);
  bigBanner_(sh, W, "PROMPT LIBRARY", "Use 1–2 to build a persona. Sourcing (3) and scheduling (4) run via the Codex skill / npm commands, not by pasting.");
  var items = [
    ["1  SCAN (build the ICP)", "Scan this business and tell me who its best-fit prospects are. Website: {{URL}}. Read the homepage, about, and services or pricing pages. Draft a tight ICP I can correct: what they sell, the outcome, who buys it (industry, size, titles), where they are, and the one buying signal. Six short lines. Then ask me five quick questions to lock it. Do not contact anyone."],
    ["2  LOCK THE ICP -> PERSONA", "Here are my corrections: {{ANSWERS}}. Lock the ICP in five lines (who I sell to, exact titles, geography, buying signal, opener voice), then create a private persona at private/personas/{{SLUG}}.yaml with keywords, exclusions, and my Google Sheet id. Do not source yet."],
    ["3  SOURCE (run the skill)", "Use the research-outreach-prospects skill with persona {{SLUG}}. Pilot 10 first, then run headless with --update-sheet. Read-only research: prefer the last 7 days, never send/connect/comment, never touch my human columns H-N, and stop on any login/CAPTCHA/checkpoint/rate-limit page."],
    ["4  SCHEDULE (local)", "Create a local Codex scheduled task that runs: npm run source -- --persona {{SLUG}} --target 50 --headless --update-sheet — every weekday at my chosen time, computer on and awake, desktop app running."],
  ];
  var r = 4;
  items.forEach(function (it) {
    sh.getRange(r, 2).setValue(it[0]).setFontColor(NAVY).setFontWeight("bold").setFontFamily(FONT).setVerticalAlignment("top").setWrap(true);
    sh.getRange(r, 3).setValue(it[1]).setFontColor(INK).setFontFamily(FONT).setFontSize(10).setWrap(true).setVerticalAlignment("top");
    sh.setRowHeight(r, 96); r++;
  });
  sh.setFrozenRows(2);
  trimCols_(sh, W);
}

// --- Lists (static) --------------------------------------------------------
function rebuildLists_(ss) {
  var sh = ss.getSheetByName("Lists") || ss.insertSheet("Lists");
  sh.clear(); sh.setHiddenGridlines(true);
  var W = 3; sh.setColumnWidth(1, 30); sh.setColumnWidth(2, 200); sh.setColumnWidth(3, 460);
  bigBanner_(sh, W, "LISTS + FIELD GUIDE", "Dropdown values and the quality bar for every sourced row.");
  var rows = [
    ["", "OUTCOME (col J)", OUTCOMES.join(" · ")],
    ["", "SOURCE TYPE (col L)", SOURCE_TYPES.join(" · ")],
    ["", "RESEARCH STATUS (col U)", RESEARCH_STATUS.join(" · ")],
    ["", "", ""],
    ["", "QUALITY BAR", ""],
    ["", "Identity", "A real person with a current title and company."],
    ["", "ICP fit", "Title, company, geography, and situation match the locked persona."],
    ["", "Evidence", "Prefer verifiable activity from the last 7 days; strong older evidence is allowed."],
    ["", "No fabrication", "Never invent activity, dates, quotes, geography, titles, or URLs."],
  ];
  writeLabeled_(sh, rows, W);
  sh.setFrozenRows(2);
  trimCols_(sh, W);
}

// --- Run Log (create if missing; preserve history) -------------------------
function ensureRunLog_(ss) {
  var sh = ss.getSheetByName("Run Log");
  if (sh) return;
  sh = ss.insertSheet("Run Log");
  sh.setHiddenGridlines(true);
  sh.getRange(1, 1, 1, RUN_LOG_HEADERS.length).setValues([RUN_LOG_HEADERS])
    .setBackground(NAVY).setFontColor(WHITE).setFontFamily(FONT).setFontWeight("bold").setWrap(true);
  sh.setFrozenRows(1);
  for (var i = 1; i <= RUN_LOG_HEADERS.length; i++) sh.setColumnWidth(i, i === 2 ? 170 : 120);
}

// --- Clear Leads (explicit confirmation required) --------------------------
function clearLeadsConfirm() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.alert(
    "Clear the Leads list?",
    "This permanently deletes ALL rows on the Leads tab, including your human tracking (Reached Out, Replied, Outcome, Notes). This cannot be undone. Continue?",
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) { ui.alert("Cancelled. Nothing was cleared."); return; }
  var res2 = ui.prompt("Type CLEAR to confirm", ui.ButtonSet.OK_CANCEL);
  if (res2.getSelectedButton() !== ui.Button.OK || String(res2.getResponseText()).trim().toUpperCase() !== "CLEAR") {
    ui.alert("Cancelled. Nothing was cleared."); return;
  }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Leads");
  var last = sh.getLastRow();
  if (last >= FIRST_DATA_ROW) sh.getRange(FIRST_DATA_ROW, 1, last - HEADER_ROW, LEADS_COLS.length).clearContent();
  SpreadsheetApp.getActive().toast("Leads cleared.", "⚡", 4);
}

function aboutAidgentOs() {
  SpreadsheetApp.getUi().alert(
    "Aidgent OS",
    "Local, human-approved prospect research.\n\n" +
    "Leads: A-G agent output, H-N your tracking, O-U system research.\n" +
    "The worker never writes H-N and never sends, connects, or comments.\n\n" +
    "Build / refresh is safe: it preserves your data, tracking, ICP inputs, and Run Log.\n" +
    "Clearing leads is a separate, confirmed action.\n\nAn open, human-approved starter kit. MIT licensed.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// --- shared helpers --------------------------------------------------------
function banner_(sh, title, subtitle, n) {
  sh.getRange(1, 1, 1, n).merge().setValue(title).setBackground(NAVY).setFontColor(WHITE)
    .setFontFamily(FONT).setFontSize(14).setFontWeight("bold").setVerticalAlignment("middle");
  sh.setRowHeight(1, 40);
  sh.getRange(2, 1, 1, n).merge().setValue(subtitle).setBackground(SOFT).setFontColor(INK)
    .setFontFamily(FONT).setFontSize(10).setFontStyle("italic");
  sh.setRowHeight(2, 24);
}
function bigBanner_(sh, W, title, subtitle) {
  sh.getRange(1, 1, 1, W).merge().setValue(title).setBackground(NAVY).setFontColor(WHITE)
    .setFontFamily(FONT).setFontSize(20).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.setRowHeight(1, 50);
  sh.getRange(2, 1, 1, W).merge().setValue(subtitle).setBackground(SOFT).setFontColor(INK)
    .setFontFamily(FONT).setFontSize(11).setFontStyle("italic").setHorizontalAlignment("center");
  sh.setRowHeight(2, 26);
}
function section_(sh, row, W, label) {
  sh.getRange(row, 1, 1, W).merge().setValue(label.toUpperCase()).setFontColor(NAVY).setFontWeight("bold")
    .setFontFamily(FONT).setFontSize(11).setVerticalAlignment("middle")
    .setBorder(false, false, true, false, false, false, CYAN, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.setRowHeight(row, 26);
}
function metric_(sh, row, label, formula) {
  sh.getRange(row, 2).setValue(label).setFontColor(INK).setFontFamily(FONT).setFontSize(11).setVerticalAlignment("middle");
  sh.getRange(row, 3).setFormula(formula).setFontColor(NAVY).setFontWeight("bold").setFontFamily(FONT).setFontSize(16)
    .setHorizontalAlignment("center").setBackground(SOFT)
    .setBorder(true, true, true, true, false, false, SOFTBORDER, SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(row, 28);
}
function bullet_(sh, row, W, text) {
  sh.getRange(row, 2).setValue("•").setFontColor(CYAN).setFontWeight("bold").setFontFamily(FONT).setHorizontalAlignment("center");
  sh.getRange(row, 3, 1, W - 2).merge().setValue(text).setFontColor(INK).setFontFamily(FONT).setFontSize(10).setWrap(true).setVerticalAlignment("middle");
  sh.setRowHeight(row, 30);
}
function writeLabeled_(sh, rows, W) {
  var r = 4;
  rows.forEach(function (row) {
    var label = row[1], value = row[2], mark = row[3];
    if (label && !value && (mark === "" || mark === undefined) && label === label.toUpperCase()) {
      section_(sh, r, W, label);
    } else if (label) {
      sh.getRange(r, 2).setValue(label).setFontColor(NAVY).setFontWeight("bold").setFontFamily(FONT).setFontSize(10).setVerticalAlignment("middle");
      var vcell = sh.getRange(r, 3, 1, W - 2).merge().setValue(value).setFontFamily(FONT).setFontSize(10).setWrap(true).setVerticalAlignment("middle")
        .setBorder(true, true, true, true, false, false, SOFTBORDER, SpreadsheetApp.BorderStyle.SOLID);
      if (mark === "yellow") vcell.setBackground(YELLOW).setFontColor(INK);
      else vcell.setFontColor(GRAY);
    }
    sh.setRowHeight(r, 28); r++;
  });
}
function setListValidation_(range, values) {
  range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build());
}
function cf_(text, bg, fg, range) {
  return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setFontColor(fg).setRanges([range]).build();
}
function colOf_(name) { for (var i = 0; i < LEADS_COLS.length; i++) if (LEADS_COLS[i][0] === name) return i + 1; return 1; }
function trimCols_(sh, W) { if (sh.getMaxColumns() > W) sh.deleteColumns(W + 1, sh.getMaxColumns() - W); }
function orderTabs_(ss, order) {
  order.forEach(function (name, idx) {
    var sh = ss.getSheetByName(name);
    if (sh && !sh.isSheetHidden()) { ss.setActiveSheet(sh); ss.moveActiveSheet(idx + 1); }
  });
}
