import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSheetId, isPlaceholderSheetId, personaSheetId, isSharedTemplateId, SHEET_TEMPLATE_ID } from "../src/persona.mjs";
import { SHEET_TEMPLATE_ID as TEMPLATE_FROM_START } from "../src/start.mjs";
import { explainSheetsError } from "../src/sheet.mjs";

test("extractSheetId handles raw id and full url", () => {
  assert.equal(extractSheetId("ABC_123-x"), "ABC_123-x");
  assert.equal(
    extractSheetId("https://docs.google.com/spreadsheets/d/1YourOwnSheetIdGoesHere0123456789abcdefgh/edit?usp=sharing"),
    "1YourOwnSheetIdGoesHere0123456789abcdefgh",
  );
});

test("isPlaceholderSheetId flags empty and the shipped example", () => {
  assert.equal(isPlaceholderSheetId(""), true);
  assert.equal(isPlaceholderSheetId("EXAMPLE_SHEET_ID_replace_me"), true);
  assert.equal(isPlaceholderSheetId("replace_me"), true);
  assert.equal(isPlaceholderSheetId("1YourOwnSheetIdGoesHere0123456789abcdefgh"), false);
});

test("personaSheetId reads id from url too", () => {
  assert.equal(personaSheetId({ sheet_url: "https://docs.google.com/spreadsheets/d/ID42/edit" }), "ID42");
  assert.equal(personaSheetId({ sheet_id: "https://docs.google.com/spreadsheets/d/ID99/edit" }), "ID99");
});

test("binding the shared template is caught, whether pasted as an id or a url", () => {
  // Everyone is handed this link during setup, so pasting it into bind-sheet
  // instead of their own copy is the likeliest single mistake in the flow. It
  // is not detectable later without a network call, and when it does surface it
  // looks like the service-account sharing step failed — the wrong rabbit hole.
  assert.equal(isSharedTemplateId(SHEET_TEMPLATE_ID), true);
  assert.equal(isSharedTemplateId(`https://docs.google.com/spreadsheets/d/${SHEET_TEMPLATE_ID}/copy`), true);
  assert.equal(isSharedTemplateId(`https://docs.google.com/spreadsheets/d/${SHEET_TEMPLATE_ID}/edit?usp=sharing`), true);
  assert.equal(isSharedTemplateId("1YourOwnSheetIdGoesHere0123456789abcdefgh"), false);
  assert.equal(isSharedTemplateId(""), false);
});

test("there is one template id, not two that can drift apart", () => {
  assert.equal(TEMPLATE_FROM_START, SHEET_TEMPLATE_ID);
});

test("a 403 from Google is explained as the unshared-sheet mistake, not a stack trace", () => {
  const out = explainSheetsError({ code: 403, message: "The caller does not have permission" },
    { sheetId: "1abc", credentialsPath: "/home/me/key.json" });
  assert.match(out, /not shared with the service account/i);
  assert.match(out, /client_email/);
  assert.match(out, /Editor/);
  assert.match(out, /SEPARATE Google identity/i, "it must say why their own access proves nothing");
  assert.match(out, /1abc/, "name the sheet it actually failed on");
  assert.match(out, /home\/me\/key\.json/, "point at their real key file, not a generic one");
});

test("a 404 sends you to re-check the id instead of the sharing step", () => {
  const out = explainSheetsError({ status: 404, message: "Requested entity was not found." }, { sheetId: "1abc" });
  assert.match(out, /no sheet with that id/i);
  assert.match(out, /bind-sheet/);
  assert.ok(!/client_email/.test(out), "a wrong id is not a sharing problem");
});

test("an unrelated failure is not dressed up as a setup mistake", () => {
  // Guessing wrong here is worse than saying nothing: it would send someone to
  // re-do the service-account steps over a network blip.
  assert.equal(explainSheetsError(new Error("socket hang up")), null);
  assert.equal(explainSheetsError({ code: 500, message: "Internal error" }), null);
});
