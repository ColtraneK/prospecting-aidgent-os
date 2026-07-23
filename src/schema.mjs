// schema.mjs — the single source of truth for the Leads sheet columns.
// The Apps Script builder (sheet/BuildLeadSheet.gs), SHEET.md, and the worker
// all must agree with this. If you change columns, change them here and mirror
// them in the builder and docs.
//
// v2 layout (A-U): the agent writes A-G and O-U; you own H-N.

export const AGENT_FIELDS = [
  "Name", // A
  "Title / Company", // B
  "LinkedIn (or profile URL)", // C
  "Recent Post (verbatim + link)", // D  verbatim recent post text then its URL (if within 7 days)
  "Why Them", // E
  "Suggested Comment", // F  a relevant reply to their recent post/comment
  "Suggested Intro DM", // G  a short no-pitch outreach message
];

export const HUMAN_FIELDS = [
  "Reached Out", // H
  "Replied", // I
  "Outcome", // J
  "Date Added", // K
  "Source Type", // L
  "Batch", // M
  "Notes", // N
];

export const SYSTEM_FIELDS = [
  "Activity Date", // O
  "Activity Type", // P
  "Fit Score", // Q
  "Last Verified", // R
  "Canonical Key", // S
  "Research Source", // T
  "Research Status", // U
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

export const RANGE_AGENT = [0, AGENT_FIELDS.length - 1];
export const RANGE_HUMAN = [AGENT_FIELDS.length, AGENT_FIELDS.length + HUMAN_FIELDS.length - 1];
export const RANGE_SYSTEM = [
  AGENT_FIELDS.length + HUMAN_FIELDS.length,
  LEADS_HEADERS.length - 1,
];

export const TAB_NAMES = [
  "Start Here",
  "Leads",
  "ICP + Schedule",
  "Personas",
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
