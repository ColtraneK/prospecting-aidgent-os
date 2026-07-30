// The docs are the product here: a non-technical user pastes a block from
// START-HERE.md and an agent follows AGENTS.md verbatim. A command that appears
// in a doc but not in package.json is a dead end for someone who cannot debug
// it, so these tests treat the docs as code.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHEET_TEMPLATE_ID, SHEET_TEMPLATE_COPY_URL } from "../src/start.mjs";
import { LEADS_HEADERS, AGENT_FIELDS, HUMAN_FIELDS, FOLLOWUP_FIELDS, COLS, colLetter } from "../src/schema.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));

const DOCS = ["AGENTS.md", "START-HERE.md", "README.md", "PROMPTS.md", "SECURITY.md",
  "sheet/SHEET.md", "steps/1-scan-business.md", "steps/2-confirm-icp.md",
  "steps/3-source-leads.md", "steps/4-schedule.md"];

test("every `npm run <x>` in the docs is a script that actually exists", () => {
  for (const doc of DOCS) {
    const named = [...read(doc).matchAll(/npm run ([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
    for (const script of named) {
      assert.ok(pkg.scripts[script], `${doc} tells the user to run "npm run ${script}", which is not in package.json`);
    }
  }
});

test("the commands a new user is walked through are all reachable", () => {
  for (const s of ["start", "setup-login", "pilot", "source", "follow-up", "daily", "dry-run",
    "create-persona", "validate-persona", "select-persona", "bind-sheet", "check-sheet", "test"]) {
    assert.ok(pkg.scripts[s], `missing script: ${s}`);
  }
});

test("every command dispatched by the CLI is exposed as an npm script", () => {
  // Otherwise a user reading `npm run <x>` in one place and a bare command in
  // another gets two different vocabularies for the same system.
  const cli = read("src/cli.mjs");
  const cases = [...cli.matchAll(/^\s*case "([a-z][a-z0-9-]*)":/gm)].map((m) => m[1]);
  assert.ok(cases.length >= 13, `only found ${cases.length} CLI commands`);
  for (const c of cases) assert.ok(pkg.scripts[c], `CLI command "${c}" has no npm script`);
});

test("the two entry-point docs exist and point at each other", () => {
  const start = read("START-HERE.md");
  const agents = read("AGENTS.md");
  assert.match(start, /AGENTS\.md/, "START-HERE must send the agent to AGENTS.md");
  assert.match(start, /npm run start/, "START-HERE must name the checklist command");
  assert.match(read("README.md"), /START-HERE\.md/);
  // The paste block must not assume a GitHub account: clone must be anonymous
  // HTTPS, with a ZIP fallback for machines without git.
  assert.match(start, /git clone https:\/\/github\.com\//);
  assert.ok(!/git@github\.com/.test(start), "no SSH clone — that needs an account and keys");
  assert.match(start, /\.zip/i, "there must be a no-git fallback");
  assert.ok(!/aidgent-os\.git/.test(start.replace(/prospecting-aidgent-os\.git/g, "")),
    "the paste block must reference the public v3 repo name");
});

test("AGENTS.md states the refusal rules an agent must not talk itself out of", () => {
  const a = read("AGENTS.md");
  for (const rule of [/must not invent/i, /must not substitute your own tools/i,
    /must not assume whose business this is/i,
    /must not create a Google Sheet/i, /must not sign in for them/i,
    /must not send/i, /must not commit/i]) {
    assert.match(a, rule);
  }
});

test("anything AGENTS.md tells the agent to write about the business stays local", () => {
  // AGENTS.md has the agent write approved-icp.json in the repo root from the
  // person's own answers. That file describes their real business, so it must
  // never be publishable by accident.
  const agents = read("AGENTS.md");
  assert.match(agents, /approved-icp\.json/);
  const ignore = read(".gitignore");
  assert.match(ignore, /^approved-icp\.json$/m, "approved-icp.json must be git-ignored");
  assert.match(ignore, /^private\/$/m);
});

test("the sheet copy link is identical everywhere it appears", () => {
  // The link is the one thing a non-technical user clicks. A doc carrying a
  // stale spreadsheet id would silently hand someone an empty or wrong sheet,
  // so src/start.mjs is the source of truth and every doc must match it.
  const COPY = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})\/copy/g;
  const templateId = SHEET_TEMPLATE_ID;
  assert.match(SHEET_TEMPLATE_COPY_URL, new RegExp(`/d/${templateId}/copy$`));

  const carriers = ["AGENTS.md", "START-HERE.md", "README.md", "sheet/SHEET.md",
    "steps/2-confirm-icp.md", "steps/3-source-leads.md"];
  for (const doc of carriers) {
    const ids = [...read(doc).matchAll(COPY)].map((m) => m[1]);
    assert.ok(ids.length, `${doc} never offers the sheet copy link`);
    for (const id of ids) {
      assert.equal(id, templateId, `${doc} points at a different template than src/start.mjs`);
    }
  }
});

test("every CLI path that needs a sheet offers the copy link", () => {
  // "Bind your existing sheet" is a dead end for someone who has never had one,
  // and that is most people on their first run. Putting the offer in the code
  // means it cannot be lost when an agent paraphrases the docs.
  const cli = read("src/cli.mjs");
  const uses = [...cli.matchAll(/sheetSetupHelp\(\)/g)].length;
  assert.ok(uses >= 6, `cli.mjs offers the copy link on only ${uses} of its no-sheet paths`);
  assert.match(read("src/persona.mjs"), /SHEET_TEMPLATE_COPY_URL/);
});

test("the template is never used as a stand-in for someone's own bound sheet", () => {
  // The template is a thing you COPY. The moment a fixture binds to it
  // directly, the tests stop distinguishing "the sheet you own" from "the
  // sheet everyone copies" — which is the exact confusion the design exists to
  // prevent, and it would go unnoticed because every assertion still passes.
  for (const f of fs.readdirSync(path.join(REPO_ROOT, "test"))) {
    if (!f.endsWith(".mjs")) continue;
    const src = read(path.join("test", f));
    assert.ok(!src.includes(SHEET_TEMPLATE_ID),
      `test/${f} binds a fixture to the shared template id; use a sheet id of your own instead`);
  }
});

test("offering a copy link did not soften the rule that the agent creates nothing", () => {
  // The template exists so the HUMAN can click Make a copy. If the agent reads
  // this as permission to provision sheets, the copy lands in whatever account
  // the agent is authenticated as and vanishes with it.
  const a = read("AGENTS.md");
  assert.match(a, /must not create a Google Sheet/i);
  assert.match(a, /sheets\.new/i, "AGENTS.md must still name the shortcut it is refusing");
  assert.match(a, /Make a copy/, "AGENTS.md must give the human-clicks-it alternative");
  // start.mjs says the same thing at the moment of the step, not just in prose.
  assert.match(read("src/start.mjs"), /this tool never creates one/i);
});

// Band letters are DERIVED, never typed, so this file keeps guarding the docs
// after the next time a column is inserted mid-table.
const AGENT_FIRST = colLetter(0);
const AGENT_LAST = colLetter(AGENT_FIELDS.length - 1);
const HUMAN_FIRST = colLetter(AGENT_FIELDS.length);
const HUMAN_LAST = colLetter(AGENT_FIELDS.length + HUMAN_FIELDS.length - 1);
const SYS_FIRST = colLetter(AGENT_FIELDS.length + HUMAN_FIELDS.length);
const SYS_LAST = colLetter(LEADS_HEADERS.length - 1);
const FOLLOWUP_FIRST = colLetter(LEADS_HEADERS.length - FOLLOWUP_FIELDS.length);
const DASH = "[-–:]";

test("the sheet script's own header matches the column bands it builds", () => {
  // BuildLeadSheet.gs is pasted into Apps Script and read by humans there, so a
  // banner claiming R-X while the worker writes through AB is a live lie.
  const gs = read("sheet/BuildLeadSheet.gs");
  assert.ok(!/\bO-[UY]\b/.test(gs), "BuildLeadSheet.gs still describes a pre-v4 system range");
  assert.match(gs, new RegExp(`\\b${SYS_FIRST}-${SYS_LAST}\\b`));
  assert.match(gs, new RegExp(`\\b${AGENT_FIRST}-${AGENT_LAST}\\b`));
  assert.match(gs, new RegExp(`\\b${HUMAN_FIRST}-${HUMAN_LAST}\\b`));
});

test("no file stops the system band short of the last column the schema defines", () => {
  // The follow-up columns sit at the end of SYSTEM_FIELDS, so every place that
  // names the band from its first column must reach its real last one. A file
  // may split the band (R-X research, Y-AB follow-up) but it must not describe a
  // band starting at R and simply stop early — an agent reading that treats the
  // follow-up columns as off-limits and silently stops recording who replied.
  const BAND = new RegExp(`\\b${SYS_FIRST}${DASH}([A-Z]{1,2})\\b`, "g");
  const files = [...DOCS, "sheet/BuildLeadSheet.gs",
    ".agents/skills/research-outreach-prospects/SKILL.md"];
  for (const f of files) {
    const src = read(f);
    const ends = [...src.matchAll(BAND)].map((m) => m[1]);
    if (!ends.length || ends.includes(SYS_LAST)) continue;
    // Stopped short — only acceptable if the remainder is named separately.
    assert.match(src, new RegExp(`\\b${FOLLOWUP_FIRST}${DASH}${SYS_LAST}\\b`),
      `${f} says the system band is ${SYS_FIRST}-${ends[0]} and never accounts for ${FOLLOWUP_FIRST}-${SYS_LAST}`);
  }
});

test("no doc still describes the pre-v4 A-G / H-N / O-Y layout", () => {
  // v4 inserted three columns inside the agent band, so every band letter after
  // column D moved. A doc left on the old letters would send someone to protect
  // the wrong columns, which is worse than saying nothing at all.
  const stale = /\b(A[-–]G|H[-–]N|O[-–][UY]|V[-–]Y|A:G|H:N|O:Y|V:Y)\b/;
  const files = [...DOCS, "sheet/BuildLeadSheet.gs", "PROMPTS.md",
    ".agents/skills/research-outreach-prospects/SKILL.md"];
  for (const f of files) {
    const hit = read(f).match(stale);
    assert.ok(!hit, `${f} still names the pre-v4 band "${hit && hit[0]}"`);
  }
});

test("every '<Column Name> (X)' in the docs names the letter that column is on", () => {
  // The band-range check above cannot see `Reached Out (H)` or `Intro DM (G)`,
  // and those are the references a person actually acts on: a doc that says
  // "tick Reached Out (H)" sends someone to overwrite Why Them and leaves the
  // follow-up pass with nobody to watch. So check each one against the schema.
  const files = [...DOCS, "sheet/BuildLeadSheet.gs",
    ".agents/skills/research-outreach-prospects/SKILL.md"];
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Longest names first, so "Reply Status" is not matched as "Replied".
  const names = [...LEADS_HEADERS].sort((a, b) => b.length - a.length);

  for (const f of files) {
    const src = read(f);
    for (const name of names) {
      const re = new RegExp(`${escape(name)}\\*{0,2}\\s*\\(([A-Z]{1,2})\\)`, "g");
      for (const m of src.matchAll(re)) {
        assert.equal(m[1], COLS[name].letter,
          `${f} says "${name} (${m[1]})" but ${name} is column ${COLS[name].letter}`);
      }
    }
  }
});

test("the docs describe the column bands the schema actually has", () => {
  // A doc that says K–Q while the code protects K–S would quietly mislead.
  const sheetDoc = read("sheet/SHEET.md");
  for (const col of ["Connection Status", "Reply Status", "Last Reply", "Follow-up Checked",
    "Post Link", "Degree", "Score (1-10)"]) {
    assert.ok(sheetDoc.includes(col), `SHEET.md does not document ${col}`);
  }
  assert.match(sheetDoc, new RegExp(`${AGENT_FIRST}–${AGENT_LAST} and ${SYS_FIRST}–${SYS_LAST} only`));
});

test("every Leads column the schema defines is documented in SHEET.md's table", () => {
  // The table is what a person reads to find out what a column is for. A column
  // that exists in code and not there is a cell nobody can explain.
  const sheetDoc = read("sheet/SHEET.md");
  LEADS_HEADERS.forEach((h, i) => {
    const letter = colLetter(i);
    assert.match(sheetDoc, new RegExp(`^\\|\\s*${letter}\\s*\\|\\s*${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|`, "m"),
      `SHEET.md has no table row for ${letter} — ${h}`);
  });
});

test("AGENTS.md explains every empty-page verdict the worker can produce", () => {
  // The worker can now end a run with `no_results`, `parse_failed`,
  // `page_not_rendered` or `no_results_visible`. A kind that reaches the Run Log
  // but is not in AGENTS.md leaves the agent staring at a word it cannot explain
  // to the person in front of it.
  const a = read("AGENTS.md");
  for (const kind of ["no_results", "parse_failed", "page_not_rendered", "no_results_visible"]) {
    assert.ok(a.includes(kind), `AGENTS.md never explains the "${kind}" verdict`);
  }
  assert.match(a, /run that finds nobody is also a blocker/i,
    "AGENTS.md must state that a zero-result run is a failure, not a quiet success");
});

test("the Feedback tab's enforcement is stated where agents and users read", () => {
  // The tab used to be documentation only — a promise with no code behind it.
  // Now a run refuses to start over unapplied rows, and every surface that
  // describes the loop must say so, or an agent paraphrasing the docs will
  // describe the old, decorative version.
  const agents = read("AGENTS.md");
  assert.match(agents, /refuses to start/i, "AGENTS.md must state that unapplied feedback blocks a run");
  assert.match(agents, /npm run feedback/, "AGENTS.md must name the feedback command");
  assert.match(read("sheet/SHEET.md"), /refuses to start/i);
  assert.match(read(".agents/skills/research-outreach-prospects/SKILL.md"), /REFUSES to start/i);
});

test("a missing session is a refusal, not a license to source another way", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /must not source without a working linkedin session/i);
  assert.match(agents, /npm run check-login/, "AGENTS.md must name the preflight");
  // The public-web mode is gone: its description promised sources no code
  // implemented, which read as permission for an agent to browse the web
  // itself. No doc may resurrect it.
  for (const doc of DOCS) {
    assert.ok(!read(doc).includes("--public-web"), `${doc} still offers the removed --public-web mode`);
  }
});

test("the empty-page verdicts in the docs are the ones the code emits", () => {
  const src = read("src/blockers.mjs");
  const kinds = [...src.matchAll(/kind:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  for (const k of ["no_results", "parse_failed", "page_not_rendered", "no_results_visible"]) {
    assert.ok(kinds.includes(k), `src/blockers.mjs no longer emits "${k}" — the docs are now stale`);
  }
});
