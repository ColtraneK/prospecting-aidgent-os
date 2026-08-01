// schema.mjs — the single source of truth for the Leads sheet columns.
// The Apps Script builder (sheet/BuildLeadSheet.gs), SHEET.md, and the worker
// all must agree with this. If you change columns, change them here and mirror
// them in the builder and docs.
//
// v4 layout (A-AB): the agent writes A-J and R-AB; you own K-Q.

export const AGENT_FIELDS = [
  "Name", // A
  "Title / Company", // B
  "LinkedIn (or profile URL)", // C
  "Recent Post (verbatim + date)", // D  verbatim recent post text then its date
  "Post Link", // E  the bare permalink, nothing else, so Sheets renders one link
  "Degree", // F  1st | 2nd | 3rd, blank when not observed. Never guessed
  "Score (1-10)", // G  the 0-100 Fit Score shown at reading scale
  "Why Them", // H
  "Suggested Comment", // I  a relevant reply to their recent post/comment
  "Suggested Intro DM", // J  a short no-pitch outreach message
];

export const HUMAN_FIELDS = [
  "Reached Out", // K
  "Replied", // L
  "Outcome", // M
  "Date Added", // N
  "Source Type", // O
  "Batch", // P
  "Notes", // Q
];

export const SYSTEM_FIELDS = [
  "Activity Date", // R
  "Activity Type", // S
  "Fit Score", // T  the raw 0-100 score; column G is its 1-10 display
  "Last Verified", // U
  "Canonical Key", // V
  "Research Source", // W
  "Research Status", // X
  // Y-AB: reserved for the follow-up loop. UNWRITTEN in v6 — the headers stay
  // so existing sheets keep their layout, and nothing here writes them.
  "Connection Status", // Y  reserved
  "Reply Status", // Z  reserved
  "Last Reply", // AA reserved
  "Follow-up Checked", // AB reserved
];

/** The reserved Y-AB subset. Nothing in v6 writes these. */
export const FOLLOWUP_FIELDS = [
  "Connection Status",
  "Reply Status",
  "Last Reply",
  "Follow-up Checked",
];

export const LEADS_HEADERS = [...AGENT_FIELDS, ...HUMAN_FIELDS, ...SYSTEM_FIELDS];

// 1-based rows (row 1 banner, row 2 subtitle, row 3 headers, row 4+ data)
export const HEADER_ROW = 3;
export const FIRST_DATA_ROW = 4;

export function colLetter(index0) {
  let n = index0;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export const COLS = LEADS_HEADERS.reduce((acc, name, i) => {
  acc[name] = { index0: i, letter: colLetter(i) };
  return acc;
}, {});

/**
 * Does this sheet's header row still match the layout the worker writes?
 *
 * v4 inserted three columns INSIDE the agent band, so every band after it
 * shifted. Writing v4 values into a v3 sheet would put the intro DM where the
 * person's "Reached Out" tick lives — silent, unrecoverable column corruption
 * across their whole list. So a full-layout mismatch is a refusal, not a patch.
 *
 * Deliberately lenient in one direction only: a header cell that is EMPTY is
 * treated as "not built yet" and left to ensureLeadsSchema, which is how an
 * older sheet gains the system columns. A header cell holding a DIFFERENT name
 * is the old layout, and that stops the run.
 *
 * Pure: takes the detected header row, returns { ok, mismatch, message }.
 */
export function checkLeadsLayout(headers = []) {
  const found = LEADS_HEADERS.map((_, i) => String(headers[i] || "").trim());
  if (found.every((h) => !h)) return { ok: true, mismatch: null, message: "" };
  for (let i = 0; i < LEADS_HEADERS.length; i++) {
    if (!found[i]) continue; // not built yet — ensureLeadsSchema fills it in
    if (found[i] === LEADS_HEADERS[i]) continue;
    return {
      ok: false,
      mismatch: { index0: i, letter: colLetter(i), expected: LEADS_HEADERS[i], found: found[i] },
      message:
        `your sheet has the old column layout — column ${colLetter(i)} says ` +
        `"${found[i]}" where this version writes "${LEADS_HEADERS[i]}". Writing to it ` +
        "would shift every value into the wrong column, including your own tracking, " +
        "so this run stopped instead and changed nothing.\n\n" +
        "If the Leads tab has NO rows yet: open it, then Extensions > Apps Script, and " +
        "run buildAidgentOsSheet. That rebuilds the headers in place.\n" +
        "If it already has leads: rebuilding would rename the columns without moving the " +
        "rows, so save a copy of them first, use \"Clear the Leads list…\" from the " +
        "⚡ Aidgent OS menu, then run buildAidgentOsSheet and let the next run re-source " +
        "those people. Taking a fresh copy of the template works too.",
    };
  }
  return { ok: true, mismatch: null, message: "" };
}

export const RANGE_AGENT = [0, AGENT_FIELDS.length - 1];
export const RANGE_HUMAN = [AGENT_FIELDS.length, AGENT_FIELDS.length + HUMAN_FIELDS.length - 1];
export const RANGE_SYSTEM = [
  AGENT_FIELDS.length + HUMAN_FIELDS.length,
  LEADS_HEADERS.length - 1,
];

export const TAB_NAMES = [
  "Start Here",
  "Leads",
  "Feedback",
  "ICP + Schedule",
  "Prompt Library",
  "Lists",
  "Run Log",
];

export const RUN_LOG_HEADERS = [
  "Run ID",
  "Timestamp",
  "Persona",
  "Requested Target",
  "Candidates Inspected",
  "New Leads",
  "Updated Leads",
  "Duplicates Skipped",
  "Rejected Candidates",
  "Blocker / Failure",
  "Duration (s)",
];
