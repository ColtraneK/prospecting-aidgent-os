// Structural doc checks only — five of them, deliberately. The old suite
// pinned prose across ten files, which made every doc edit a test failure and
// taught people to edit tests instead of docs. What stays load-bearing:
// commands must exist, the copy link must be the real template, and no doc may
// drift into claiming this system sends anything.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHEET_TEMPLATE_ID } from "../src/persona.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));

const DOCS = ["AGENTS.md", "START-HERE.md", "README.md", "SECURITY.md", "sheet/SHEET.md",
  ".agents/skills/research-outreach-prospects/SKILL.md",
  "references/linkedin-search-urls.md", "references/trigger-signals.md", "references/outreach-rules.md"];

test("AGENTS.md exists, stays lean, and carries the refusal core", () => {
  const a = read("AGENTS.md");
  const lines = a.split("\n").length;
  assert.ok(lines <= 250, `AGENTS.md is ${lines} lines — the manual has bloated past 250 again`);
  assert.match(a, /^## The refusal core$/m, "the refusal core heading is the anchor everything cites");
  assert.match(a, /never invent a lead/i);
  assert.match(a, /never forge/i);
  assert.match(a, /K–Q|K-Q/, "the human-columns rule must be stated");
});

test("every `npm run <x>` any doc names is a script that actually exists", () => {
  for (const doc of DOCS) {
    const named = [...read(doc).matchAll(/npm run ([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
    for (const script of named) {
      assert.ok(pkg.scripts[script], `${doc} tells the user to run "npm run ${script}", which is not in package.json`);
    }
  }
});

test("no doc claims a run sends anything; each entry doc states the opposite", () => {
  for (const doc of DOCS) {
    assert.ok(!/automatically sends|auto-sends|sends the (message|dm|connection)/i.test(read(doc)),
      `${doc} claims something gets sent`);
  }
  for (const doc of ["AGENTS.md", "START-HERE.md", "README.md", "sheet/SHEET.md"]) {
    assert.match(read(doc), /never sen[dt]|nothing is (ever )?(auto-)?sent/i,
      `${doc} must state that nothing is sent`);
  }
});

test("the sheet copy link is the real template everywhere it appears", () => {
  const COPY = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})\/copy/g;
  let found = 0;
  for (const doc of DOCS) {
    for (const m of read(doc).matchAll(COPY)) {
      found++;
      assert.equal(m[1], SHEET_TEMPLATE_ID, `${doc} points at a different template than src/persona.mjs`);
    }
  }
  assert.ok(found >= 2, "the copy link must be offered in the docs people actually read");
});

test("every repo file a doc points at exists", () => {
  const skip = /^(https?|mailto):|^[a-z]+:\/\//i;
  for (const doc of DOCS) {
    const refs = [...read(doc).matchAll(/`((?:references|sheet|src|test|personas)\/[A-Za-z0-9._/-]+)`/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (skip.test(ref)) continue;
      assert.ok(fs.existsSync(path.join(REPO_ROOT, ref)), `${doc} points at ${ref}, which does not exist`);
    }
  }
});
