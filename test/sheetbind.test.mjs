import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSheetId, isPlaceholderSheetId, personaSheetId } from "../src/persona.mjs";

test("extractSheetId handles raw id and full url", () => {
  assert.equal(extractSheetId("ABC_123-x"), "ABC_123-x");
  assert.equal(
    extractSheetId("https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/edit?usp=sharing"),
    "1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g",
  );
});

test("isPlaceholderSheetId flags empty and the shipped example", () => {
  assert.equal(isPlaceholderSheetId(""), true);
  assert.equal(isPlaceholderSheetId("EXAMPLE_SHEET_ID_replace_me"), true);
  assert.equal(isPlaceholderSheetId("replace_me"), true);
  assert.equal(isPlaceholderSheetId("1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g"), false);
});

test("personaSheetId reads id from url too", () => {
  assert.equal(personaSheetId({ sheet_url: "https://docs.google.com/spreadsheets/d/ID42/edit" }), "ID42");
  assert.equal(personaSheetId({ sheet_id: "https://docs.google.com/spreadsheets/d/ID99/edit" }), "ID99");
});
