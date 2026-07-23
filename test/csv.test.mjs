import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeCsvField, toCsv } from "../src/csv.mjs";

test("escapes quotes, commas, and newlines by quoting", () => {
  assert.equal(escapeCsvField('he said "hi"'), '"he said ""hi"""');
  assert.equal(escapeCsvField("a,b"), '"a,b"');
  assert.equal(escapeCsvField("line1\nline2"), '"line1\nline2"');
  assert.equal(escapeCsvField(null), '""');
  assert.equal(escapeCsvField(undefined), '""');
  assert.equal(escapeCsvField(42), '"42"');
});

test("toCsv writes header + rows", () => {
  const out = toCsv(["A", "B"], [["1", "2"], ['x,y', 'q"q']]);
  assert.equal(out, '"A","B"\n"1","2"\n"x,y","q""q"\n');
});
