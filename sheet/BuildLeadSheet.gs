/**
 * ============================================================================
 *  AIDGENT OS  ·  Lead Sheet builder
 * ----------------------------------------------------------------------------
 *  Builds and SAFELY refreshes the workbook the local research worker maintains.
 *
 *  Tabs: Start Here · Leads · Feedback · ICP + Schedule · Prompt Library ·
 *        Lists · Run Log
 *
 *  Leads columns (must match src/schema.mjs and sheet/SHEET.md):
 *    A-J   agent output  : Name · Title / Company · LinkedIn (or profile URL) ·
 *                          Recent Post (verbatim + date) · Post Link · Degree ·
 *                          Score (1-10) · Why Them · Suggested Comment ·
 *                          Suggested Intro DM
 *    K-Q   human tracking: Reached Out · Replied · Outcome · Date Added ·
 *                          Source Type · Batch · Notes
 *    R-AB  system fields : Activity Date · Activity Type · Fit Score ·
 *                          Last Verified · Canonical Key · Research Source · Research Status
 *    Y-AB  follow-up     : Connection Status · Reply Status · Last Reply ·
 *                          Follow-up Checked
 *                          (filled by the read-only follow-up pass, for rows where
 *                           YOU ticked Reached Out. It observes; it never sends.)
 *
 *  RE-RUNNING IS SAFE. buildAidgentOsSheet never clears Leads data, human tracking,
 *  your ICP + Schedule inputs, or Run Log history. It only refreshes headers,
 *  formatting, validation, and the static guidance tabs. Clearing leads is a
 *  separate, explicitly-confirmed action.
 *
 *  HOUSE STYLE. The palette and fonts below are the same ones the shared
 *  template uses, so a sheet built here and a copy of the template look
 *  identical. Change them in one place: the constants at the top of this file.
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

// --- house style -----------------------------------------------------------
var INK = "#111827",      // banner and table-header fill
    DEEP = "#172554",     // banner subtitle fill
    BLUE = "#2563EB",     // section bars
    PALE = "#DBEAFE",     // number chips and callouts
    SUBTLE = "#DCE7FF",   // text on DEEP
    GRAYBG = "#F3F4F6",   // label cells
    MUTED = "#6B7280",    // hint and footer text
    BODY = "#1F2937",     // body text
    YEL = "#FFF7D6",      // cells you fill in
    WHITE = "#FFFFFF",
    LINE = "#E5E7EB",     // hairlines between rows
    ZEBRA = "#F9FAFB",    // alternating Leads rows
    BOX = "#CBD5E1";      // prompt-box outline

// Header fills for the three Leads bands, so who-owns-what reads at a glance.
// v4 lightens all three: the agent band is Aidgentic light blue, and the other
// two keep their old hues at the same weight so "yours vs the agent's" still
// reads instantly without the header row going dark.
var AGENT_HDR = PALE,      AGENT_TXT = INK;        // #DBEAFE on near-black
var HUMAN_HDR = "#FEF3C7", HUMAN_TXT = "#78350F";  // amber, kept as the human tint
var SYS_HDR = "#F3F4F6",   SYS_TXT = "#374151";    // neutral grey

var DISP = "Play";   // display face: banners, section bars, big numbers
var FACE = "Aptos";  // everything else

var HEADER_ROW = 3, FIRST_DATA_ROW = 4;

var OUTCOMES = ["No response", "Neutral", "Positive", "Not a fit", "Follow up"];
var SOURCE_TYPES = ["LinkedIn", "Connection", "Public web", "Referral", "Other"];
var RESEARCH_STATUS = ["New", "Refreshed", "Needs review"];
var CONNECTION_STATUS = ["connected", "pending", "not_connected", "unknown"];
var REPLY_STATUS = ["replied", "no_reply", "unknown"];

// [title, widthPx, type, group]
//
// type drives width, wrap and alignment, and is the ONE place to change them:
//   prose  long text, wraps, top-left      (reading a centred paragraph is work)
//   text   short text, wraps, top-left
//   link   a URL, clipped to one line so it stays a single clean click
//   short  a tiny enum, clipped, centred
//   num | check | date | outcome | source | status | connstatus | replystatus
//          all centred; the last five also get their dropdown
var LEADS_COLS = [
  ["Name", 159, "text", "agent"],
  ["Title / Company", 239, "text", "agent"],
  ["LinkedIn (or profile URL)", 223, "link", "agent"],
  ["Recent Post (verbatim + date)", 300, "prose", "agent"],
  ["Post Link", 210, "link", "agent"],
  ["Degree", 76, "short", "agent"],
  ["Score (1-10)", 86, "num", "agent"],
  ["Why Them", 330, "prose", "agent"],
  ["Suggested Comment", 320, "prose", "agent"],
  ["Suggested Intro DM", 430, "prose", "agent"],
  ["Reached Out", 111, "check", "human"],
  ["Replied", 95, "check", "human"],
  ["Outcome", 143, "outcome", "human"],
  ["Date Added", 111, "date", "human"],
  ["Source Type", 159, "source", "human"],
  ["Batch", 127, "text", "human"],
  ["Notes", 287, "prose", "human"],
  ["Activity Date", 110, "date", "system"],
  ["Activity Type", 110, "text", "system"],
  ["Fit Score", 90, "num", "system"],
  ["Last Verified", 110, "date", "system"],
  ["Canonical Key", 230, "link", "system"],
  ["Research Source", 140, "text", "system"],
  ["Research Status", 130, "status", "system"],
  ["Connection Status", 130, "connstatus", "system"],
  ["Reply Status", 110, "replystatus", "system"],
  ["Last Reply", 320, "prose", "system"],
  ["Follow-up Checked", 130, "date", "system"],
];

/** Columns whose values are short enough that centring them helps you scan. */
var CENTERED_TYPES = ["short", "num", "check", "date", "outcome", "source", "status", "connstatus", "replystatus"];
/** Columns that hold sentences. Centring these would be a readability bug. */
var WRAPPED_TYPES = ["prose", "text"];

var RUN_LOG_HEADERS = [
  "Run ID", "Timestamp", "Persona", "Requested Target", "Candidates Inspected",
  "New Leads", "Updated Leads", "Duplicates Skipped", "Rejected Candidates",
  "Blocker / Failure", "Duration (s)",
];

/**
 * The menu deliberately does NOT offer "Build / refresh all tabs".
 *
 * Almost everyone gets this sheet by copying the template, which arrives fully
 * built. For them a Build button does nothing useful and plenty that is
 * confusing: it rewrites the guidance tabs and, on an older copy, would repaint
 * the whole workbook. A one-click button that can only make things worse does
 * not belong in front of a non-technical person.
 *
 * buildAidgentOsSheet() is still here and still supported. It is for the person
 * who brought their OWN sheet, and it is run deliberately from
 * Extensions > Apps Script > Run, not from a menu they might click by accident.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚡ Aidgent OS")
    .addItem("Clear the Leads list…", "clearLeadsConfirm")
    .addSeparator()
    .addItem("About", "aboutAidgentOs")
    .addToUi();
}

/**
 * Run one build step without letting it take the other six down with it.
 *
 * The build used to be a straight sequence, so the FIRST thing that threw
 * aborted everything after it — one unhappy column in Leads meant no Feedback
 * tab, no Run Log, no banner. That failure mode is invisible to a non-technical
 * user: they see a red error naming a function they have never heard of, and a
 * workbook that is quietly half-built. Now every step runs, and whatever went
 * wrong is reported once at the end in plain language.
 */
function safeStep_(label, fn, problems) {
  try { fn(); } catch (e) { problems.push(label + ": " + explainGsError_(e)); }
}

/** Turn an Apps Script exception into something a human can act on. */
function explainGsError_(e) {
  var msg = (e && e.message) ? e.message : String(e);
  if (/table/i.test(msg)) {
    return msg + "  FIX: this tab was converted into a Google Table, and a table's " +
      "header row refuses checkboxes and dropdowns. Click any cell in the table, open " +
      "the table menu (the chip at its top-left), choose \"Revert to unformatted data\" " +
      "(that keeps every row — do NOT choose \"Delete table\", which deletes the data " +
      "with it), then run buildAidgentOsSheet again from Extensions > Apps Script.";
  }
  return msg;
}

function buildAidgentOsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var problems = [];
  safeStep_("Leads", function () { ensureLeads_(ss); }, problems);          // safe refresh, preserves data
  safeStep_("Start Here", function () { rebuildStartHere_(ss); }, problems); // static
  safeStep_("Feedback", function () { ensureFeedback_(ss); }, problems);     // preserves your notes
  safeStep_("ICP + Schedule", function () { ensureIcpSchedule_(ss); }, problems); // preserves your answers
  safeStep_("Prompt Library", function () { rebuildPromptLibrary_(ss); }, problems); // static
  safeStep_("Lists", function () { rebuildLists_(ss); }, problems);          // static
  safeStep_("Run Log", function () { ensureRunLog_(ss); }, problems);        // preserves history
  safeStep_("Tab order", function () {
    orderTabs_(ss, ["Start Here", "Leads", "Feedback", "ICP + Schedule", "Prompt Library", "Lists", "Run Log"]);
  }, problems);
  var start = ss.getSheetByName("Start Here"); if (start) ss.setActiveSheet(start);
  var def = ss.getSheetByName("Sheet1");
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) { try { ss.deleteSheet(def); } catch (e) {} }

  if (!problems.length) {
    SpreadsheetApp.getActive().toast("Aidgent OS workbook is ready (data preserved).", "⚡ Built", 5);
    return;
  }
  SpreadsheetApp.getActive().toast("Built, but " + problems.length + " step(s) need attention. See the details below.", "⚡ Built with warnings", 8);
  throw new Error("The workbook was built, but these steps did not finish:\n\n- " + problems.join("\n\n- "));
}

// --- Leads (SAFE refresh: never clears data) -------------------------------

/** 1-based row of an existing "Name" header in column A, or 0 if there is none. */
function findHeaderRow_(sh) {
  var depth = Math.min(sh.getMaxRows(), 30);
  var col = sh.getRange(1, 1, depth, 1).getValues();
  for (var i = 0; i < depth; i++) {
    if (String(col[i][0]).trim().toLowerCase() === "name") return i + 1;
  }
  return 0;
}

function ensureLeads_(ss) {
  var sh = ss.getSheetByName("Leads") || ss.insertSheet("Leads");
  var n = LEADS_COLS.length;
  sh.setHiddenGridlines(true);
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());

  // A sheet built before this layout may carry its headers on another row.
  // Writing row 3 on top of that leaves TWO header rows and a worker that
  // reads the wrong one, so realign first — and refuse rather than mangle a
  // sheet that already holds leads.
  var found = findHeaderRow_(sh);
  if (found && found !== HEADER_ROW) {
    if (sh.getLastRow() > found) {
      throw new Error("this tab has its headers on row " + found + " with data below them. " +
        "Rebuilding would leave two header rows. Either delete rows 1 to " + (found - HEADER_ROW) +
        " so the headers land on row " + HEADER_ROW + ", or move your leads into a fresh copy of the " +
        "template, then run buildAidgentOsSheet again from Extensions > Apps Script.");
    }
    if (found > HEADER_ROW) sh.deleteRows(1, found - HEADER_ROW);
    else sh.insertRowsBefore(1, HEADER_ROW - found);
  }

  // A tab whose headers are from an OLDER layout, with leads underneath them.
  //
  // Writing the new names over the old ones relabels the columns and moves
  // nothing: the tick in what used to be "Reached Out" ends up under a header
  // that now says something else, on every row, and the sheet still looks fine.
  // Silently mangling somebody's tracking is worse than any error message, and
  // it is worse precisely because the worker's own refusal sends people here.
  // So: relabel freely while the list is empty, refuse the moment it is not.
  assertRelabelIsSafe_(sh);

  banner_(sh, n, "LEADS",
    "Agent output A-J   ·   your tracking K-Q   ·   system research R-AB   ·   the worker never overwrites K-Q", 22);

  var headers = LEADS_COLS.map(function (c) { return c[0]; });
  sh.getRange(HEADER_ROW, 1, 1, n).setValues([headers])
    .setFontFamily(FACE).setFontWeight("bold").setFontSize(9)
    .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  // Three bands, so the ownership rule is visible without reading anything.
  // The spans are COUNTED from LEADS_COLS rather than written down, so adding a
  // column inside a band can never leave the paint half a column out of step.
  bandHeader_(sh, bandStart_("agent"), bandCount_("agent"), AGENT_HDR, AGENT_TXT,
    "Agent output. Refreshed on each run; safe to edit in your own copy.");
  bandHeader_(sh, bandStart_("human"), bandCount_("human"), HUMAN_HDR, HUMAN_TXT,
    "Human-managed. The research worker NEVER writes this column.");
  bandHeader_(sh, bandStart_("system"), bandCount_("system"), SYS_HDR, SYS_TXT,
    "System/agent-managed research field. Avoid hand-editing.");
  sh.setRowHeight(HEADER_ROW, 34);

  var maxRows = sh.getMaxRows();
  var dataRows = maxRows - HEADER_ROW;

  // Cosmetics are per-column and independent, so one column that refuses styling
  // must not cost the other twenty-four theirs. The known cause is a native
  // Google Table on this tab: its header row rejects checkboxes and dropdowns,
  // and the body range unavoidably overlaps it. Collect and re-report rather
  // than aborting — the data and headers are already correct by this point.
  var colProblems = [], colError = null;
  for (var c = 0; c < n; c++) {
    var col = c + 1, type = LEADS_COLS[c][2];
    sh.setColumnWidth(col, LEADS_COLS[c][1]);
    try {
      var body = sh.getRange(FIRST_DATA_ROW, col, dataRows, 1);
      var wraps = WRAPPED_TYPES.indexOf(type) !== -1;
      var centred = CENTERED_TYPES.indexOf(type) !== -1;
      body.setFontFamily(FACE).setFontColor(BODY).setFontSize(10);
      // Sentences read top-left and grow the row; short values sit centred on a
      // single line. Wrapping a permalink would turn one click into three lines.
      body.setVerticalAlignment(centred ? "middle" : "top");
      body.setHorizontalAlignment(centred ? "center" : "left");
      body.setWrapStrategy(wraps ? SpreadsheetApp.WrapStrategy.WRAP : SpreadsheetApp.WrapStrategy.CLIP);

      // CLEAR the old layout's validation and number format before applying this
      // column's own. Setting validation only where a type asks for it leaves
      // whatever the PREVIOUS layout put here untouched, and v4 moved every
      // column after D — so a rebuilt v3 sheet grew tickboxes down "Why Them"
      // and "Suggested Comment" (old Reached Out / Replied) and a stale Outcome
      // dropdown down "Suggested Intro DM". Harmless-looking, and it makes the
      // agent's own output columns look like something you are meant to tick.
      body.setDataValidation(null);
      body.setNumberFormat(type === "date" ? "yyyy-mm-dd" : type === "num" ? "0" : "@");

      // requireCheckbox(), NOT insertCheckboxes(). Both render a tickbox, but
      // insertCheckboxes() WRITES a literal FALSE into every data row. On a
      // 1000-row sheet that is ~997 non-empty cells in the two tick columns, which makes the
      // whole grid look like a populated table to the Sheets API: values.append
      // then lands the first real batch of leads below the last FALSE instead of
      // at row 4, and the person sees an empty sheet. A validation rule gives the
      // same tickbox with the cells genuinely empty.
      if (type === "check") {
        body.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      }
      else if (type === "outcome") setListValidation_(body, OUTCOMES);
      else if (type === "source") setListValidation_(body, SOURCE_TYPES);
      else if (type === "status") setListValidation_(body, RESEARCH_STATUS);
      else if (type === "connstatus") setListValidation_(body, CONNECTION_STATUS);
      else if (type === "replystatus") setListValidation_(body, REPLY_STATUS);
    } catch (e) {
      colProblems.push(LEADS_COLS[c][0]);
      colError = e;
    }
  }

  // A sheet built by the OLD script carries a literal FALSE in every H and I
  // cell. Clearing those is only safe while the list is genuinely empty — once
  // there are leads, an unticked box and a real "no" look identical.
  try { clearStrayCheckboxValues_(sh); } catch (e) { /* cosmetic only */ }

  // Freeze the header rows only. NOT the first column: the banner on rows 1-2 is
  // one cell merged across all of A:AB, and Sheets refuses to freeze a column that
  // would cut a merged cell in half ("you can't freeze columns which contain only
  // part of a merged cell"). Asking for it threw on every single build.
  try { sh.setFrozenRows(HEADER_ROW); } catch (e) {}

  // Conditional formatting: zebra + outcome colours + status colours. Rebuilt each run.
  var rng = sh.getRange(FIRST_DATA_ROW, 1, dataRows, n);
  var rules = [SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=ISEVEN(ROW())").setBackground(ZEBRA).setRanges([rng]).build()];
  var outRng = sh.getRange(FIRST_DATA_ROW, colOf_("Outcome"), dataRows, 1);
  [["Positive", "#DCFCE7", "#14532D"], ["Follow up", "#FEF3C7", "#78350F"],
   ["Neutral", "#F3F4F6", "#374151"], ["No response", WHITE, "#9CA3AF"],
   ["Not a fit", "#FEE2E2", "#991B1B"]]
    .forEach(function (m) { rules.push(cf_(m[0], m[1], m[2], outRng)); });
  var stRng = sh.getRange(FIRST_DATA_ROW, colOf_("Research Status"), dataRows, 1);
  [["New", PALE, "#1E40AF"], ["Refreshed", "#E0F2FE", "#075985"], ["Needs review", "#FEF3C7", "#78350F"]]
    .forEach(function (m) { rules.push(cf_(m[0], m[1], m[2], stRng)); });
  try {
    sh.setConditionalFormatRules(rules);
    rng.setBorder(null, null, true, null, false, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  } catch (e) { if (!colError) colError = e; colProblems.push("row colours"); }
  try {
    if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
  } catch (e) { if (!colError) colError = e; colProblems.push("trailing columns"); }

  // Headers and widths are done; only cosmetics could have failed. Report once,
  // with the real message, so the cause is visible instead of a silent gap.
  if (colProblems.length) {
    throw new Error("headers are correct, but formatting was skipped for " +
      colProblems.join(", ") + ". " + (colError ? colError.message : ""));
  }
}

/**
 * Refuse to rename columns out from under existing data.
 *
 * Safe cases, all of which pass: a brand-new tab, a tab with the current
 * headers, a tab whose headers are simply missing some columns, and any tab
 * with no lead rows at all.
 */
function assertRelabelIsSafe_(sh) {
  if (sh.getLastRow() <= HEADER_ROW) return;           // no data rows: relabel away
  var width = Math.min(sh.getMaxColumns(), LEADS_COLS.length);
  if (width < 1) return;
  var existing = sh.getRange(HEADER_ROW, 1, 1, width).getValues()[0];
  var names = sh.getRange(FIRST_DATA_ROW, 1, sh.getLastRow() - HEADER_ROW, 1).getValues();
  var hasLeads = false;
  for (var r = 0; r < names.length; r++) {
    if (String(names[r][0]).trim() !== "") { hasLeads = true; break; }
  }
  if (!hasLeads) return;                                // formatting only, no leads

  for (var i = 0; i < width; i++) {
    var found = String(existing[i] == null ? "" : existing[i]).trim();
    if (!found || found === LEADS_COLS[i][0]) continue;
    throw new Error(
      'this tab is on an older column layout (column ' + colLetter_(i + 1) + ' says "' + found +
      '", this version puts "' + LEADS_COLS[i][0] + '" there) and it already has leads in it. ' +
      "Renaming the headers would leave every value one or more columns away from the " +
      "header describing it, including your own Reached Out / Replied / Outcome / Notes, " +
      "and there is no undo. Nothing was changed.\n\n" +
      "To move to the new layout, either (a) copy your existing rows somewhere safe, use " +
      '"Clear the Leads list…" from the ⚡ Aidgent OS menu, run this again, and let the ' +
      "next run re-source those people with the new columns filled in, or (b) take a fresh " +
      "copy of the template and keep this sheet as your archive."
    );
  }
}

/** Paint one band of the Leads header row and note who owns it. */
function bandHeader_(sh, startCol, count, bg, fg, note) {
  var r = sh.getRange(HEADER_ROW, startCol, 1, count);
  r.setBackground(bg).setFontColor(fg);
  for (var i = 0; i < count; i++) sh.getRange(HEADER_ROW, startCol + i).setNote(note);
}

/** Remove the old script's literal FALSE values, but only while Leads is empty. */
function clearStrayCheckboxValues_(sh) {
  var last = sh.getLastRow();
  if (last < FIRST_DATA_ROW) return;
  var count = last - HEADER_ROW;
  var names = sh.getRange(FIRST_DATA_ROW, 1, count, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() !== "") return; // real leads present, leave the ticks alone
  }
  sh.getRange(FIRST_DATA_ROW, colOf_("Reached Out"), count, 2).clearContent();
}

// --- Start Here (static) ---------------------------------------------------
function rebuildStartHere_(ss) {
  var sh = ss.getSheetByName("Start Here") || ss.insertSheet("Start Here");
  resetSheet_(sh);
  var W = 8;
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
  sh.setColumnWidth(1, 31);
  for (var c = 2; c <= 7; c++) sh.setColumnWidth(c, 143);
  sh.setColumnWidth(8, 242);
  banner_(sh, W, "OUTREACH AIDGENT 🤖", "A human-approved prospecting system by Aidgentic", 30);

  // --- today at a glance
  sectionBar_(sh, 4, 2, 6, "TODAY AT A GLANCE");
  var labels = ["Prospects", "Ready to review", "Reached out", "Replies", "Positive", "Reply rate"];
  // Column letters are LOOKED UP, never typed. When v4 pushed the human band
  // three columns to the right, a hard-coded "Leads!H" would have kept counting
  // happily against the wrong column and shown everyone a dashboard of zeros.
  var OUT = letterOf_("Reached Out"), REP = letterOf_("Replied"), OUTC = letterOf_("Outcome");
  var col = function (L) { return "Leads!" + L + FIRST_DATA_ROW + ":" + L; };
  var formulas = [
    "=COUNTA(" + col("A") + ")",
    "=COUNTA(" + col("A") + ")-COUNTIF(" + col(OUT) + ",TRUE)",
    "=COUNTIF(" + col(OUT) + ",TRUE)",
    "=COUNTIF(" + col(REP) + ",TRUE)",
    '=COUNTIF(' + col(OUTC) + ',"Positive")',
    "=IFERROR(COUNTIF(" + col(REP) + ",TRUE)/COUNTIF(" + col(OUT) + ",TRUE),0)",
  ];
  sh.getRange(5, 2, 1, 6).setValues([labels])
    .setBackground(GRAYBG).setFontColor(MUTED).setFontFamily(FACE).setFontSize(10)
    .setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange(6, 2, 1, 6).setFormulas([formulas])
    .setBackground(WHITE).setFontColor(INK).setFontFamily(DISP).setFontSize(18)
    .setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange(6, 7).setNumberFormat("0.0%");
  sh.getRange(5, 2, 2, 6).setBorder(true, true, true, true, true, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(5, 32); sh.setRowHeight(6, 50); sh.setRowHeight(7, 20);

  // --- the daily loop
  sectionBar_(sh, 8, 2, 6, "THE DAILY LOOP");
  var loop = [
    ["1", "Open Leads", "Review the newest names and the evidence behind them."],
    ["2", "Check the fit", "Read Why Them, then open the profile and the post link."],
    ["3", "Make it yours", "Edit the Suggested Comment and the Suggested Intro DM."],
    ["4", "Reach out", "You send it yourself. Nothing auto-sends."],
    ["5", "Track reality", "Tick Reached Out and Replied, then pick an Outcome."],
    ["6", "Say what is off", "If the wrong people showed up, write it on the Feedback tab."],
  ];
  // Row numbers below are COMPUTED, never hard-coded. Adding a step to either
  // list used to silently overwrite the block underneath it.
  var loopTop = 9;
  var r = loopTop;
  loop.forEach(function (row) {
    sh.getRange(r, 2).setValue(row[0]).setBackground(PALE).setFontColor(BLUE)
      .setFontFamily(DISP).setFontSize(14).setFontWeight("bold")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    sh.getRange(r, 3).setValue(row[1]).setFontColor(BODY).setFontFamily(FACE)
      .setFontSize(10).setFontWeight("bold").setVerticalAlignment("middle");
    sh.getRange(r, 4, 1, 4).merge().setValue(row[2]).setFontColor(BODY).setFontFamily(FACE)
      .setFontSize(10).setWrap(true).setVerticalAlignment("middle");
    sh.setRowHeight(r, 34);
    r++;
  });
  sh.getRange(loopTop, 2, loop.length, 6)
    .setBorder(null, null, true, null, false, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(r, 20); r++;   // spacer

  // --- first-time setup
  var setupBar = r;
  sectionBar_(sh, setupBar, 2, 6, "FIRST-TIME SETUP");
  // Everything here is phrased as something to ASK FOR, not something to type.
  // Nobody using this sheet runs commands: they talk to their agent and the
  // agent runs them. A terminal command on this tab is a wall, not a help.
  var setup = [
    ["1. Ask where you are up to", "Your agent checks the setup and tells you the single next thing to do. Ask again after each step."],
    ["2. Fill in ICP + Schedule", "The yellow cells on that tab. Then ask your agent to turn them into your targeting."],
    ["3. Connect this sheet", "Share it with your service account address as an Editor, then ask your agent to connect this sheet."],
    ["4. Ask for a test run of ten", "Ten leads added, so you can read real rows here before there are fifty of them."],
    ["5. Ask for today's run", "It keeps going until 25 new leads are added, then checks who accepted and who replied. Nothing is sent."],
  ];
  r = setupBar + 1;
  var setupTop = r;
  setup.forEach(function (row) {
    sh.getRange(r, 2).setValue(row[0]).setFontColor(BODY).setFontFamily(FACE)
      .setFontSize(10).setFontWeight("bold").setWrap(true).setVerticalAlignment("middle");
    sh.getRange(r, 3, 1, 5).merge().setValue(row[1]).setFontColor(BODY).setFontFamily(FACE)
      .setFontSize(10).setWrap(true).setVerticalAlignment("middle");
    sh.setRowHeight(r, 42);
    r++;
  });
  sh.getRange(setupTop, 2, setup.length, 6)
    .setBorder(null, null, true, null, false, true, LINE, SpreadsheetApp.BorderStyle.SOLID);

  // --- safety rule + footer
  var safety = r;
  sh.getRange(safety, 2, 2, 6).merge()
    .setValue("SAFETY RULE  •  The agent reads and drafts. It never sends, connects, comments, or posts. " +
      "Every outward action is something you do yourself.")
    .setBackground(PALE).setFontColor(DEEP).setFontFamily(FACE).setFontSize(10)
    .setFontWeight("bold").setWrap(true).setVerticalAlignment("middle");
  sh.setRowHeight(safety, 26); sh.setRowHeight(safety + 1, 26); sh.setRowHeight(safety + 2, 20);
  var footer = safety + 3;
  sh.getRange(footer, 2, 1, 6).merge()
    .setValue("Outreach Aidgent  ·  a free tool by Aidgentic  ·  aidgentic.com")
    .setFontColor(MUTED).setFontFamily(FACE).setFontSize(9).setHorizontalAlignment("center");
  sh.setRowHeight(footer, 30);

  sh.setFrozenRows(2);
  trimCols_(sh, W);
  trimRows_(sh, footer + 6);
}

// --- ICP + Schedule (rebuilds the layout, keeps your answers) ---------------
function ensureIcpSchedule_(ss) {
  var rows = [
    ["sec", "BUSINESS SNAPSHOT", "", ""],
    ["input", "Business / offer", "What do you sell, in plain English?", ""],
    ["input", "Website URL", "https://", "Your agent reads this first when it drafts your ICP."],
    ["input", "Outcome you deliver", "What changes for the buyer after working with you?", ""],
    ["input", "Industries / company type", "Who is most likely to value this?", ""],
    ["input", "Company size", "Employees, revenue, stage, or another useful boundary", ""],
    ["gap", "", "", ""],
    ["sec", "LOCKED ICP  •  FIVE LINES", "", ""],
    ["input", "1. Who I sell to", "Industry + size + situation", ""],
    ["input", "2. Exact titles", "Exact job titles, not broad departments", "Titles drive the search. Vague titles give vague leads."],
    ["input", "3. Geography", "City, state, country, or time zone", ""],
    ["input", "4. Buying signal", "The observable fact that makes this person worth reaching", ""],
    ["input", "5. Opener voice", "Warm, concise, curious, no pitch", ""],
    ["gap", "", "", ""],
    ["sec", "SOURCING + SCHEDULE", "", ""],
    ["input", "Leads added per manual run", "25", "This many NEW rows get added. A test run adds ten."],
    ["input", "Leads added per scheduled run", "25", "New rows only. People already in Leads are refreshed, not counted again."],
    ["input", "Weekdays", "Monday to Friday", "Recommended while you build the review habit."],
    ["input", "Run time", "8:00 AM", "Your local time when you create the schedule."],
    ["input", "Timezone", "America/New_York", "Change this if needed."],
    ["fixed", "Recency preference", "Prefer the last 7 days", "Strong older matches are still accepted and marked as older."],
    ["fixed", "Mode", "Local LinkedIn (signed-in profile)", "The only mode. A run without a signed-in session refuses to start."],
    ["gap", "", "", ""],
    ["sec", "CHANGING ANY OF THIS", "", ""],
    ["fixed", "Where your targeting lives", "As a file on your computer, not in this sheet", "Your agent names it and keeps it up to date."],
    ["fixed", "To change it", "Write what you want on the Feedback tab, or just tell your agent", "Both work. Feedback keeps a record of what changed and when."],
    ["fixed", "Selling more than one thing?", "Ask your agent for a second set of targeting", "It can switch between them without you redoing any setup."],
    ["gap", "", "", ""],
    ["note", "Fresh means not already in Leads by name or canonical profile URL. Scheduled runs append new rows and " +
      "refresh existing ones. They never erase your tracking in K to Q.", "", ""],
  ];
  labeledTab_(ss, "ICP + Schedule", "ICP + SCHEDULE",
    "Yellow cells are yours. Keep the targeting specific enough that a stranger could apply it consistently.",
    rows, [31, 250, 470, 300]);
}

// --- Feedback (you write A-C, your agent writes D-F) -----------------------
//
// The point of this tab: the deterministic sourcing code must NOT read free
// text. If a language model sat inside the sourcing loop deciding who
// qualifies, the no-fabrication guarantee would be gone. So the person writes
// plain English here, the AGENT reads it and turns it into concrete targeting
// changes, and the unchanged code reads that targeting. This tab is the audit
// trail of why the targeting looks the way it does.
var FEEDBACK_COLS = [
  ["Date", 110, "date", "human"],
  ["What to change", 430, "text", "human"],
  ["Must / Prefer / Avoid", 150, "kind", "human"],
  ["Status", 140, "status", "agent"],
  ["Applied on", 110, "date", "agent"],
  ["What your agent changed", 380, "text", "agent"],
];
var FEEDBACK_KINDS = ["Must", "Prefer", "Avoid"];
var FEEDBACK_STATUS = ["New", "Applied", "Needs a decision"];

function ensureFeedback_(ss) {
  var sh = ss.getSheetByName("Feedback") || ss.insertSheet("Feedback");
  sh.setHiddenGridlines(true);
  var n = FEEDBACK_COLS.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());

  banner_(sh, n, "FEEDBACK",
    "Write what you want changed, in plain English. Your agent reads this before every run.", 22);

  sh.getRange(HEADER_ROW, 1, 1, n)
    .setValues([FEEDBACK_COLS.map(function (c) { return c[0]; })])
    .setFontFamily(FACE).setFontWeight("bold").setFontSize(9)
    .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  sh.getRange(HEADER_ROW, 1, 1, 3).setBackground(HUMAN_HDR).setFontColor(HUMAN_TXT);
  sh.getRange(HEADER_ROW, 4, 1, 3).setBackground(SYS_HDR).setFontColor(SYS_TXT);
  for (var i = 0; i < n; i++) {
    var note = FEEDBACK_COLS[i][3] === "human"
      ? "Yours. Write here any time."
      : "Your agent fills this in when it applies your note.";
    if (FEEDBACK_COLS[i][0] === "What to change") {
      note = "Plain English. Examples:\n" +
        "  No leads outside the US\n" +
        "  Prefer people who comment on posts often\n" +
        "  Only people with a PMP certification\n" +
        "  Stop showing me recruiters\n\n" +
        "Do not leave example rows in the table. Your agent reads every row as a real instruction.";
    }
    sh.getRange(HEADER_ROW, i + 1).setNote(note);
  }
  sh.setRowHeight(HEADER_ROW, 34);

  var dataRows = sh.getMaxRows() - HEADER_ROW;
  for (var c = 0; c < n; c++) {
    sh.setColumnWidth(c + 1, FEEDBACK_COLS[c][1]);
    var body = sh.getRange(FIRST_DATA_ROW, c + 1, dataRows, 1);
    body.setFontFamily(FACE).setFontColor(BODY).setFontSize(10).setVerticalAlignment("top");
    var type = FEEDBACK_COLS[c][2];
    body.setWrapStrategy(type === "text" ? SpreadsheetApp.WrapStrategy.WRAP : SpreadsheetApp.WrapStrategy.CLIP);
    if (type === "date") { body.setNumberFormat("yyyy-mm-dd"); body.setHorizontalAlignment("center"); }
    else if (type === "kind") setListValidation_(body, FEEDBACK_KINDS);
    else if (type === "status") setListValidation_(body, FEEDBACK_STATUS);
  }
  // The yours/theirs split, same idea as Leads.
  sh.getRange(FIRST_DATA_ROW, 1, dataRows, 3).setBackground("#FFFDF5");

  var rng = sh.getRange(FIRST_DATA_ROW, 1, dataRows, n);
  var rules = [];
  [["Applied", "#DCFCE7", "#14532D"], ["Needs a decision", "#FEF3C7", "#78350F"], ["New", PALE, "#1E40AF"]]
    .forEach(function (m) {
      rules.push(cf_(m[0], m[1], m[2], sh.getRange(FIRST_DATA_ROW, 4, dataRows, 1)));
    });
  sh.setConditionalFormatRules(rules);
  rng.setBorder(null, null, true, null, false, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  try { sh.setFrozenRows(HEADER_ROW); } catch (e) {}
  trimCols_(sh, n);
}

// --- Prompt Library (static) -----------------------------------------------
function rebuildPromptLibrary_(ss) {
  var sh = ss.getSheetByName("Prompt Library") || ss.insertSheet("Prompt Library");
  resetSheet_(sh);
  var W = 4;
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
  sh.setColumnWidth(1, 31); sh.setColumnWidth(2, 300); sh.setColumnWidth(3, 330); sh.setColumnWidth(4, 330);
  banner_(sh, W, "PROMPT LIBRARY",
    "Use 1 and 2 to build a persona. Sourcing and scheduling run through the skill and the npm commands, not by pasting.", 22);

  var items = [
    ["1  SCAN THE BUSINESS", "Understand the business and draft an ICP for you to correct.",
      "Scan this business and tell me who its best-fit prospects are. Website: {{URL}}. Read the homepage, the about " +
      "page, and the services or pricing pages. Then draft a tight ICP I can correct: what they sell, the outcome they " +
      "deliver, who buys it (industry, size, titles), where those buyers are, and the one signal that says someone is a " +
      "fit. Six short lines. Do not contact anyone.\n\nThen ask me five quick questions: did you get who I sell to right, " +
      "which exact titles, what geography, what signal means someone is worth reaching, and how should the opener sound?"],
    ["2  LOCK THE ICP INTO A PERSONA", "Turn your corrections into a private persona the worker can run.",
      "Here are my corrections: {{ANSWERS}}. Lock the ICP in five lines: who I sell to, the exact titles, the geography, " +
      "the buying signal, and my opener voice. Then create a private persona at private/personas/{{SLUG}}.yaml with " +
      "core topics (what a good prospect posts about), keywords, exclusions, and my Google Sheet id.\n\nBefore you save " +
      "it, read the exact buyer titles and exclusions back to me as a list and get a yes on the titles specifically. " +
      "Titles match as substrings, so a short one like Founder also matches most of LinkedIn. Do not source anything yet."],
    ["3  ASK FOR A RUN", "You do not paste anything for this one. You just ask.",
      "Do a test run that adds ten leads first, then draft the suggested comment and intro message for each new row from " +
      "the post in column D and put them through the validation command, then show me what landed in the sheet. " +
      "Read-only research only: prefer the last 7 days, never send, connect or comment on my behalf, never touch my " +
      "columns K to Q, and stop and tell me if you hit a login, CAPTCHA, checkpoint or rate-limit page. Finish by giving " +
      "me the link to my sheet."],
    ["4  SCHEDULE IT", "Same job, every weekday, still nothing auto-sent.",
      "Set up a scheduled task that does the daily run for me every weekday morning, adding 25 leads. Remind me what has " +
      "to be true for it to actually fire: this computer on, awake, and running the agent app at that hour."],
  ];
  var r = 4;
  items.forEach(function (it) {
    sectionBar_(sh, r, 2, W - 1, it[0]);
    sh.getRange(r + 1, 2, 1, W - 1).merge().setValue(it[1])
      .setBackground(GRAYBG).setFontColor(MUTED).setFontFamily(FACE).setFontSize(9)
      .setFontStyle("italic").setVerticalAlignment("middle");
    sh.setRowHeight(r + 1, 26);
    sh.getRange(r + 2, 2, 3, W - 1).merge().setValue(it[2])
      .setBackground(WHITE).setFontColor(BODY).setFontFamily(FACE).setFontSize(10)
      .setWrap(true).setVerticalAlignment("top")
      .setBorder(true, true, true, true, false, false, BOX, SpreadsheetApp.BorderStyle.SOLID);
    sh.setRowHeight(r + 2, 44); sh.setRowHeight(r + 3, 44); sh.setRowHeight(r + 4, 44);
    sh.setRowHeight(r + 5, 18);
    r += 6;
  });
  sh.setFrozenRows(2);
  trimCols_(sh, W);
  trimRows_(sh, r + 2);
}

// --- Lists (static) --------------------------------------------------------
function rebuildLists_(ss) {
  var sh = ss.getSheetByName("Lists") || ss.insertSheet("Lists");
  resetSheet_(sh);
  var W = 2;
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
  sh.setColumnWidth(1, 240); sh.setColumnWidth(2, 660);
  banner_(sh, W, "LISTS + FIELD GUIDE",
    "Dropdown values, outcome definitions, and the quality bar every sourced row has to clear.", 22);

  var blocks = [
    ["DROPDOWN VALUES", ["Column", "Allowed values"], [
      ["Outcome (" + letterOf_("Outcome") + ")", OUTCOMES.join(" · ")],
      ["Source Type (" + letterOf_("Source Type") + ")", SOURCE_TYPES.join(" · ")],
      ["Research Status (" + letterOf_("Research Status") + ")", RESEARCH_STATUS.join(" · ")],
      ["Connection Status (" + letterOf_("Connection Status") + ")", CONNECTION_STATUS.join(" · ")],
      ["Reply Status (" + letterOf_("Reply Status") + ")", REPLY_STATUS.join(" · ")]]],
    ["OUTCOME DEFINITIONS", ["Outcome", "Use when"], [
      ["No response", "Enough time has passed and there is no reply."],
      ["Neutral", "A reply without clear interest or rejection."],
      ["Positive", "A real conversation, referral, or next step opened."],
      ["Not a fit", "The targeting was wrong or they explicitly declined."],
      ["Follow up", "There is a concrete reason and a date to re-engage."]]],
    ["LEAD QUALITY BAR", ["Check", "Pass condition"], [
      ["Identity", "A real person with a current title and company."],
      ["ICP fit", "Title, company, geography and situation match the locked persona."],
      ["Evidence", "Prefer verifiable activity from the last 7 days. Strong older evidence is allowed."],
      ["Why Them", "Names the specific fit signal, not generic praise."],
      ["No fabrication", "Never invent activity, dates, quotes, geography, titles or URLs."]]],
    ["WHO WRITES WHAT", ["Columns", "Owner"], [
      ["A to J", "The agent. Refreshed on every run."],
      ["K to Q", "You. The worker never writes these."],
      ["R to AB", "System research and the read-only follow-up pass."]]],
  ];
  var r = 4;
  blocks.forEach(function (b) {
    sectionBar_(sh, r, 1, W, b[0]);
    sh.getRange(r + 1, 1, 1, W).setValues([b[1]])
      .setBackground(INK).setFontColor(WHITE).setFontFamily(FACE).setFontSize(10)
      .setFontWeight("bold").setVerticalAlignment("middle");
    sh.setRowHeight(r + 1, 29);
    sh.getRange(r + 2, 1, b[2].length, W).setValues(b[2])
      .setFontColor(BODY).setFontFamily(FACE).setFontSize(10).setWrap(true).setVerticalAlignment("middle");
    sh.getRange(r + 2, 1, b[2].length, 1).setFontWeight("bold");
    sh.getRange(r + 1, 1, b[2].length + 1, W)
      .setBorder(null, null, true, null, false, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
    for (var i = 0; i < b[2].length; i++) sh.setRowHeight(r + 2 + i, 38);
    sh.setRowHeight(r + 2 + b[2].length, 18);
    r += 3 + b[2].length;
  });
  sh.setFrozenRows(2);
  trimCols_(sh, W);
  trimRows_(sh, r + 2);
}

// --- Run Log (create if missing; preserve history) -------------------------
function ensureRunLog_(ss) {
  var sh = ss.getSheetByName("Run Log") || ss.insertSheet("Run Log");
  sh.setHiddenGridlines(true);
  var n = RUN_LOG_HEADERS.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  // Headers live on row 1 because the worker appends at "Run Log!A1"; a banner
  // above them would push every appended row into the wrong columns.
  sh.getRange(1, 1, 1, n).setValues([RUN_LOG_HEADERS])
    .setBackground(INK).setFontColor(WHITE).setFontFamily(FACE).setFontSize(9)
    .setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  sh.setRowHeight(1, 36);
  var rows = sh.getMaxRows() - 1;
  sh.getRange(2, 1, rows, n).setFontFamily(FACE).setFontColor(BODY).setFontSize(10)
    .setVerticalAlignment("middle");
  sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 170); sh.setColumnWidth(3, 150);
  for (var i = 4; i <= n; i++) sh.setColumnWidth(i, 120);
  var rng = sh.getRange(2, 1, rows, n);
  sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied("=ISEVEN(ROW())").setBackground(ZEBRA).setRanges([rng]).build()]);
  rng.setBorder(null, null, true, null, false, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  sh.setFrozenRows(1);
  trimCols_(sh, n);
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
    "Leads: A-J agent output, K-Q your tracking, R-AB system research.\n" +
    "The worker never writes K-Q and never sends, connects, or comments.\n\n" +
    "Rebuilding is safe: it preserves your data, tracking, ICP inputs, and Run Log.\n" +
    "Clearing leads is a separate, confirmed action.\n\nAn open, human-approved starter kit. MIT licensed.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// --- shared helpers --------------------------------------------------------

/** Rows 1-2 of every tab: title bar, subtitle strip, and a breathing row 3. */
function banner_(sh, W, title, subtitle, size) {
  sh.getRange(1, 1, 1, W).breakApart().merge().setValue(title)
    .setBackground(INK).setFontColor(WHITE).setFontFamily(DISP).setFontSize(size)
    .setFontWeight("bold").setVerticalAlignment("middle");
  sh.setRowHeight(1, 48);
  sh.getRange(2, 1, 1, W).breakApart().merge().setValue(subtitle)
    .setBackground(DEEP).setFontColor(SUBTLE).setFontFamily(FACE)
    .setFontSize(size >= 30 ? 12 : 10).setFontStyle(size >= 30 ? "italic" : "normal")
    .setVerticalAlignment("middle");
  sh.setRowHeight(2, 40);
  sh.setRowHeight(3, 20);
}

/** A blue full-width bar that opens a section. */
function sectionBar_(sh, row, startCol, count, label) {
  sh.getRange(row, startCol, 1, count).breakApart().merge().setValue(label)
    .setBackground(BLUE).setFontColor(WHITE).setFontFamily(DISP).setFontSize(13)
    .setFontWeight("bold").setVerticalAlignment("middle");
  sh.setRowHeight(row, 33);
}

/**
 * Build a label / value / note tab, keeping whatever the person already typed.
 *
 * The old version bailed out early when the tab existed, so a sheet built by an
 * earlier release kept that release's layout for ever and never picked up new
 * rows or a new look. Instead: remember the current values by their label,
 * rebuild the tab from scratch, then put the remembered values back. A label
 * that no longer exists is dropped; a label that is new starts on its hint.
 */
function labeledTab_(ss, name, title, subtitle, rows, widths) {
  var sh = ss.getSheetByName(name);
  var saved = sh ? readLabeledValues_(sh) : {};
  if (!sh) sh = ss.insertSheet(name);
  resetSheet_(sh);
  var W = widths.length;
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());
  for (var i = 0; i < W; i++) sh.setColumnWidth(i + 1, widths[i]);
  banner_(sh, W, title, subtitle, 22);

  var r = 4;
  rows.forEach(function (row) {
    var kind = row[0], label = row[1], value = row[2], note = row[3];
    if (kind === "sec") {
      sectionBar_(sh, r, 2, W - 1, label);
    } else if (kind === "gap") {
      sh.setRowHeight(r, 18);
    } else if (kind === "note") {
      sh.getRange(r, 2, 2, W - 1).merge().setValue(label)
        .setBackground(PALE).setFontColor(DEEP).setFontFamily(FACE).setFontSize(10)
        .setFontWeight("bold").setWrap(true).setVerticalAlignment("middle");
      sh.setRowHeight(r, 26); sh.setRowHeight(r + 1, 26);
      r++; // this block is two rows tall
    } else {
      var kept = Object.prototype.hasOwnProperty.call(saved, label) ? saved[label] : value;
      sh.getRange(r, 2).setValue(label)
        .setBackground(GRAYBG).setFontColor(BODY).setFontFamily(FACE).setFontSize(10)
        .setFontWeight("bold").setWrap(true).setVerticalAlignment("middle");
      var cell = sh.getRange(r, 3).setValue(kept)
        .setFontFamily(FACE).setFontSize(10).setWrap(true).setVerticalAlignment("middle");
      if (kind === "input") {
        // Untouched inputs still show their hint, so grey it; anything the
        // person actually typed gets normal ink.
        cell.setBackground(YEL).setFontColor(kept === value ? MUTED : BODY);
      } else {
        cell.setBackground(WHITE).setFontColor(MUTED);
      }
      sh.getRange(r, 4, 1, W - 3).setValue(note)
        .setBackground(WHITE).setFontColor(MUTED).setFontFamily(FACE).setFontSize(9)
        .setFontStyle("italic").setWrap(true).setVerticalAlignment("middle");
      sh.setRowHeight(r, 42);
    }
    r++;
  });
  sh.getRange(4, 2, r - 4, W - 1)
    .setBorder(null, null, null, null, false, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  sh.setFrozenRows(2);
  trimCols_(sh, W);
  trimRows_(sh, r + 2);
}

/** Snapshot a labeled tab as { label: value } so a rebuild can restore it. */
function readLabeledValues_(sh) {
  var out = {};
  var last = sh.getLastRow();
  if (last < 4 || sh.getMaxColumns() < 3) return out;
  var vals = sh.getRange(4, 2, last - 3, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    var k = String(vals[i][0]).trim();
    var v = vals[i][1];
    if (k && v !== "" && v !== null) out[k] = v;
  }
  return out;
}

/**
 * Wipe a static tab back to blank before rebuilding it.
 *
 * clear() drops values and formats but leaves MERGES behind, and a merge that
 * survives into a layout whose blocks moved makes the next merge() throw
 * "you can't merge across an existing merge" — which, thanks to safeStep_,
 * shows up as one tab silently missing rather than an obvious failure. So
 * break every merge on the sheet first.
 */
function resetSheet_(sh) {
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear();
  sh.clearNotes();
  sh.clearConditionalFormatRules();
  sh.setHiddenGridlines(true);
}

function setListValidation_(range, values) {
  range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build());
}
function cf_(text, bg, fg, range) {
  return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setFontColor(fg).setRanges([range]).build();
}
function colOf_(name) { for (var i = 0; i < LEADS_COLS.length; i++) if (LEADS_COLS[i][0] === name) return i + 1; return 1; }
/** 1-based first column of a band, counted from LEADS_COLS so it cannot drift. */
function bandStart_(group) { for (var i = 0; i < LEADS_COLS.length; i++) if (LEADS_COLS[i][3] === group) return i + 1; return 1; }
/** How many columns that band spans. */
function bandCount_(group) { var n = 0; for (var i = 0; i < LEADS_COLS.length; i++) if (LEADS_COLS[i][3] === group) n++; return n; }
/** Spreadsheet letter for a 1-based column index (handles AA/AB). */
function colLetter_(col) { var s = "", n = col; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
/** The letter of a named Leads column, so guidance text can never go stale. */
function letterOf_(name) { return colLetter_(colOf_(name)); }
function trimCols_(sh, W) { if (sh.getMaxColumns() > W) sh.deleteColumns(W + 1, sh.getMaxColumns() - W); }
function trimRows_(sh, R) { if (sh.getMaxRows() > R) sh.deleteRows(R + 1, sh.getMaxRows() - R); }
function orderTabs_(ss, order) {
  order.forEach(function (name, idx) {
    var sh = ss.getSheetByName(name);
    if (sh && !sh.isSheetHidden()) { ss.setActiveSheet(sh); ss.moveActiveSheet(idx + 1); }
  });
}
