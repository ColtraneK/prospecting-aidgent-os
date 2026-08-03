import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHEET_TEMPLATE_ID } from "../src/persona.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));
const DOCS = [
  "AGENTS.md", "START-HERE.md", "README.md", "SECURITY.md", "sheet/SHEET.md",
  "references/public-web-sourcing.md", "references/browser-verification.md",
  "references/scheduled-task-prompt.md", "references/trigger-signals.md",
  "references/outreach-rules.md",
];

test("AGENTS.md stays lean and carries the combined-workflow refusal core", () => {
  const a = read("AGENTS.md");
  assert.ok(a.split("\n").length <= 250);
  assert.match(a, /^## Refusal core$/m);
  assert.match(a, /never invent a person/i);
  assert.match(a, /public sources/i);
  assert.match(a, /human fields/i);
});

test("every documented npm command exists", () => {
  for (const doc of DOCS) {
    for (const match of read(doc).matchAll(/npm run ([a-z][a-z0-9-]*)/g)) {
      assert.ok(pkg.scripts[match[1]], `${doc} names missing script npm run ${match[1]}`);
    }
  }
});

test("entry docs state that outreach is never sent", () => {
  for (const doc of ["AGENTS.md", "START-HERE.md", "README.md", "sheet/SHEET.md"]) {
    assert.match(read(doc), /never sen[dt]|nothing is (ever )?(auto-)?sent/i, `${doc} must state nothing is sent`);
  }
});

test("the Sheet copy link uses the one template id", () => {
  const copy = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})\/copy/g;
  let found = 0;
  for (const doc of DOCS) {
    for (const match of read(doc).matchAll(copy)) {
      found++;
      assert.equal(match[1], SHEET_TEMPLATE_ID, `${doc} uses a different Sheet template`);
    }
  }
  assert.ok(found >= 2);
});

test("documented repo paths exist", () => {
  for (const doc of DOCS) {
    for (const match of read(doc).matchAll(/`((?:references|sheet|src|test|personas)\/[A-Za-z0-9._/-]+)`/g)) {
      assert.ok(fs.existsSync(path.join(REPO_ROOT, match[1])), `${doc} points at missing ${match[1]}`);
    }
  }
});
