// `npm test` must never launch a browser. A non-technical install runs it, and
// a browser download mid-suite is exactly the surprise it must not get. The
// DOM extractor tests live under `npm run test:dom` on purpose.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the plain suite stays browser-free; DOM tests stay in their own script", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts.test, "node --test test/*.test.mjs", "the test glob must not reach test/dom/");
  assert.match(pkg.scripts["test:dom"], /test\/dom/);

  for (const f of fs.readdirSync(path.join(REPO_ROOT, "test"))) {
    if (!f.endsWith(".test.mjs") || f === "offline.test.mjs") continue;
    const src = fs.readFileSync(path.join(REPO_ROOT, "test", f), "utf8");
    assert.ok(!/chromium|playwright/.test(src),
      `test/${f} touches a browser — that belongs under test/dom/`);
  }
});
