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
import { LEADS_HEADERS, FOLLOWUP_FIELDS, colLetter } from "../src/schema.mjs";

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

test("the sheet script's own header matches the column bands it builds", () => {
  // BuildLeadSheet.gs is pasted into Apps Script and read by humans there, so a
  // banner claiming O-U while the worker writes through Y is a live lie.
  const gs = read("sheet/BuildLeadSheet.gs");
  assert.ok(!/O-U/.test(gs), "BuildLeadSheet.gs still describes the old O-U range");
  assert.match(gs, /O-Y/);
});

test("no file stops the system band short of the last column the schema defines", () => {
  // The follow-up columns were added at the end of SYSTEM_FIELDS, so every place
  // that already said "system = O:U" became wrong without changing a character.
  // A file may split the band (O-U research, V-Y follow-up) but it must not
  // describe a band starting at O and simply stop before the real last column —
  // an agent reading that treats V-Y as off-limits and silently stops recording
  // whether anyone replied.
  const last = colLetter(LEADS_HEADERS.length - 1);
  const BAND = new RegExp(`\\bO[-–:]([A-Z])\\b`, "g");
  const files = [...DOCS, "sheet/BuildLeadSheet.gs",
    ".agents/skills/research-outreach-prospects/SKILL.md"];
  for (const f of files) {
    const src = read(f);
    const ends = [...src.matchAll(BAND)].map((m) => m[1]);
    if (!ends.length || ends.includes(last)) continue;
    // Stopped short — only acceptable if the remainder is named separately.
    const after = colLetter(LEADS_HEADERS.length - FOLLOWUP_FIELDS.length);
    assert.match(src, new RegExp(`\\b${after}[-–:]${last}\\b`),
      `${f} says the system band is O-${ends[0]} and never accounts for ${after}-${last}`);
  }
});

test("the docs describe the column bands the schema actually has", () => {
  // A doc that says H–N while the code protects H–P would quietly mislead.
  const sheetDoc = read("sheet/SHEET.md");
  for (const col of ["Connection Status", "Reply Status", "Last Reply", "Follow-up Checked"]) {
    assert.ok(sheetDoc.includes(col), `SHEET.md does not document ${col}`);
  }
  assert.match(sheetDoc, /A–G and O–Y only/);
  assert.ok(!/O–U only/.test(sheetDoc), "SHEET.md still describes the old O–U range");
});
