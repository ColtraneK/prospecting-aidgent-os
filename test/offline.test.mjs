import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the normal install and test suite are browser-free", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts.test, "node --test test/*.test.mjs");
  assert.equal(pkg.dependencies.playwright, undefined);
  assert.equal(pkg.scripts["test:dom"], undefined);
  for (const file of fs.readdirSync(path.join(REPO_ROOT, "test"))) {
    if (!file.endsWith(".test.mjs") || file === "offline.test.mjs") continue;
    const source = fs.readFileSync(path.join(REPO_ROOT, "test", file), "utf8");
    assert.ok(!/from ["']playwright["']/.test(source), `${file} imports Playwright`);
  }
});
