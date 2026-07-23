import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHeaderRow } from "../src/sheet.mjs";

test("detectHeaderRow finds the row whose column A is 'Name' (row 5 layout)", () => {
  const values = [
    ["LEADS"],
    ["instructions"],
    [],
    ["note"],
    ["Name", "Title / Company", "LinkedIn (or profile URL)"],
    ["Dana", "Owner @ X", "https://linkedin.com/in/dana"],
  ];
  assert.equal(detectHeaderRow(values), 5);
});

test("detectHeaderRow handles the builder's row 3 layout", () => {
  const values = [["AIDGENT OS"], ["subtitle"], ["Name", "Title / Company"], ["Sam", "Founder"]];
  assert.equal(detectHeaderRow(values), 3);
});

test("detectHeaderRow defaults to 3 when not found", () => {
  assert.equal(detectHeaderRow([["x"], ["y"]]), 3);
});
