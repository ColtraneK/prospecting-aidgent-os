// The lead model is semantic, not positional.  A copied template is the
// pleasant default, but people are allowed to move columns, add their own, or
// use ordinary alternate names.  The code resolves those changes by meaning
// before it writes a cell.

export const AGENT_FIELDS = [
  "Name",
  "Title / Company",
  "LinkedIn (or profile URL)",
  "Recent Post (verbatim + date)",
  "Post Link",
  "Degree",
  "Score (1-10)",
  "Why Them",
  "Suggested Comment",
  "Suggested Intro DM",
];

// These are semantic ownership rules, not spreadsheet positions.  The writer
// never changes them on an existing row, even after someone reorders columns.
export const HUMAN_FIELDS = [
  "Reached Out On",
  "Connected/Req Sent",
  "Replied",
  "Outcome",
  "Date Added",
  "Source Type",
  "Batch",
  "Notes",
];

export const SYSTEM_FIELDS = [
  "Activity Date", "Activity Type", "Fit Score", "Last Verified",
  "Canonical Key", "Research Source", "Research Status",
  "Browser Connection Status", "Connection Checked On",
  "Next Action", "Next Action Due",
];

export const FOLLOWUP_FIELDS = [
  "Browser Connection Status", "Connection Checked On", "Next Action", "Next Action Due",
];

// Internal names are retained for stable run artifacts and old Sheets.  They
// are deliberately not the required visible workshop layout.
export const LEADS_HEADERS = [...AGENT_FIELDS, ...HUMAN_FIELDS, ...SYSTEM_FIELDS];

// The only Sheet people are asked to copy.  It contains the information they
// need to use, while run metadata stays in git-ignored local artifacts.
export const TEMPLATE_HEADERS = [
  "Name", "Title / Company", "LinkedIn (or profile URL)",
  "Recent Signal", "Evidence Link", "Why Them", "Suggested Opener", "Fit Score",
  "Verification / Connection", "Verified On", "Next Step", "Next Follow-up",
  "Connection Status", "Reached Out On", "Replied", "Outcome", "Date Added", "Notes",
];

export const REQUIRED_LEAD_FIELDS = ["Name", "LinkedIn (or profile URL)"];
export const HEADER_ROW = 1;
export const FIRST_DATA_ROW = 2;

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
export const RANGE_SYSTEM = [AGENT_FIELDS.length + HUMAN_FIELDS.length, LEADS_HEADERS.length - 1];

export function normalizeHeader(value) {
  return String(value == null ? "" : value)
    .trim().toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Common, harmless wording changes.  For a truly custom label Codex can put a
// local override in private/sheet-map.json; the Sheet itself is never rebuilt.
export const FIELD_ALIASES = {
  "Name": ["contact", "person", "prospect name", "full name"],
  "Title / Company": ["title company", "role company", "role and company", "job title company"],
  "LinkedIn (or profile URL)": ["linkedin", "linkedin url", "profile", "profile url", "linkedin profile"],
  "Recent Post (verbatim + date)": ["recent signal", "latest post", "recent post", "activity", "recent activity"],
  "Post Link": ["evidence link", "signal link", "source link", "post url", "evidence"],
  "Degree": ["linkedin degree", "connection degree"],
  "Score (1-10)": ["score", "lead score"],
  "Why Them": ["why this person", "why they fit", "reason", "why now"],
  "Suggested Comment": ["draft comment", "comment draft"],
  "Suggested Intro DM": ["suggested opener", "draft opener", "opener", "intro", "draft message"],
  "Reached Out On": ["reached out", "contacted on", "first outreach"],
  "Connected/Req Sent": ["connection status", "connected", "request status"],
  "Replied": ["reply", "has replied", "response received"],
  "Outcome": ["result", "status outcome"],
  "Date Added": ["added on", "date created"],
  "Source Type": ["source"],
  "Batch": ["list", "campaign"],
  "Notes": ["note", "human notes"],
  "Activity Date": ["signal date", "post date"],
  "Activity Type": ["signal type"],
  "Fit Score": ["fit", "fit score", "score 100"],
  "Last Verified": ["last checked", "verified on"],
  "Canonical Key": ["dedupe key", "record key"],
  "Research Source": ["research link", "research source"],
  "Research Status": ["research state"],
  "Browser Connection Status": ["verification connection", "verification status", "verification connection status"],
  "Connection Checked On": ["connection checked", "connection verified on"],
  "Next Action": ["next step", "next action"],
  "Next Action Due": ["next follow up", "next followup", "follow up due", "next action due"],
};

/**
 * Resolve physical Sheet headers to the stable internal field names.  `overrides`
 * is a local object of { "Internal field": "The attendee's custom header" }.
 */
export function resolveLeadsLayout(headers = [], overrides = {}) {
  const actualHeaders = headers.map((h) => String(h == null ? "" : h));
  const byCanonical = {};
  const canonicalByIndex = {};
  const used = new Set();
  const assign = (canonical, index0, source) => {
    if (index0 < 0 || used.has(index0) || byCanonical[canonical]) return;
    const header = actualHeaders[index0];
    if (!normalizeHeader(header)) return;
    byCanonical[canonical] = { index0, header, source };
    canonicalByIndex[index0] = canonical;
    used.add(index0);
  };

  for (const canonical of LEADS_HEADERS) {
    const wanted = overrides && overrides[canonical];
    if (!wanted) continue;
    const index0 = actualHeaders.findIndex((h) => normalizeHeader(h) === normalizeHeader(wanted));
    assign(canonical, index0, "override");
  }
  // Exact internal names always win before aliases such as the two score fields.
  for (const canonical of LEADS_HEADERS) {
    const index0 = actualHeaders.findIndex((h, i) => !used.has(i) && normalizeHeader(h) === normalizeHeader(canonical));
    assign(canonical, index0, "exact");
  }
  for (const canonical of LEADS_HEADERS) {
    const aliases = new Set((FIELD_ALIASES[canonical] || []).map(normalizeHeader));
    const index0 = actualHeaders.findIndex((h, i) => !used.has(i) && aliases.has(normalizeHeader(h)));
    assign(canonical, index0, "alias");
  }

  const missingRequired = REQUIRED_LEAD_FIELDS.filter((field) => !byCanonical[field]);
  const unmappedHeaders = actualHeaders
    .map((header, index0) => ({ header, index0 }))
    .filter(({ header, index0 }) => normalizeHeader(header) && !canonicalByIndex[index0]);
  return {
    headers: actualHeaders, byCanonical, canonicalByIndex, missingRequired, unmappedHeaders,
    ok: missingRequired.length === 0,
  };
}

export function checkLeadsLayout(headers = [], overrides = {}) {
  const layout = resolveLeadsLayout(headers, overrides);
  if (layout.ok) return { ok: true, mismatch: null, message: "", layout };
  const field = layout.missingRequired[0];
  return {
    ok: false,
    mismatch: { expected: field },
    layout,
    message: [
      `Codex could not identify the required "${field}" column in this Leads tab.`,
      "It changed nothing. Restore that header, or add a local mapping in private/sheet-map.json.",
      "Do not rebuild or relabel a live Sheet; Codex can use reordered columns and common names automatically.",
    ].join("\n"),
  };
}

export const TAB_NAMES = ["Start Here", "Leads", "Feedback", "ICP + Schedule", "Prompt Library", "Lists", "Run Log"];
export const RUN_LOG_HEADERS = [
  "Run ID", "Timestamp", "Persona", "Requested Target", "Candidates Inspected",
  "New Leads", "Updated Leads", "Duplicates Skipped", "Rejected Candidates",
  "Blocker / Failure", "Duration (s)",
];
