import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATE_HEADERS, checkLeadsLayout, resolveLeadsLayout } from "../src/schema.mjs";
import { readLeads, applyPlan, LeadsLayoutError } from "../src/sheet.mjs";

test("the copied workshop template resolves every visible field by meaning", () => {
  const layout = resolveLeadsLayout(TEMPLATE_HEADERS);
  assert.equal(layout.ok, true);
  assert.equal(layout.byCanonical["Recent Post (verbatim + date)"].header, "Recent Signal");
  assert.equal(layout.byCanonical["Suggested Intro DM"].header, "Suggested Opener");
  assert.equal(layout.byCanonical["Connected/Req Sent"].header, "Connection Status");
});

test("moved columns, common renames, and extra attendee columns remain safe", () => {
  const headers = ["Notes", "Profile URL", "Why this person", "Name", "My CRM id", "Draft Opener", "Connection Status"];
  const layout = resolveLeadsLayout(headers);
  assert.equal(layout.ok, true);
  assert.equal(layout.byCanonical.Name.index0, 3);
  assert.equal(layout.byCanonical["LinkedIn (or profile URL)"].index0, 1);
  assert.equal(layout.byCanonical["Suggested Intro DM"].index0, 5);
  assert.deepEqual(layout.unmappedHeaders.map((x) => x.header), ["My CRM id"]);
});

test("Codex can supply a local mapping for an unusual custom header", () => {
  const layout = resolveLeadsLayout(["Who", "Their page"], {
    Name: "Who", "LinkedIn (or profile URL)": "Their page",
  });
  assert.equal(layout.ok, true);
  assert.equal(layout.byCanonical.Name.source, "override");
});

test("a missing identity field stops safely without asking the user to rebuild", () => {
  const checked = checkLeadsLayout(["Name", "Why Them"]);
  assert.equal(checked.ok, false);
  assert.match(checked.message, /profile url/i);
  assert.match(checked.message, /do not rebuild/i);
});

function stubSheets(headers, dataRows = []) {
  const writes = [];
  return {
    writes,
    spreadsheets: {
      values: {
        get: async () => ({ data: { values: [headers, ...dataRows] } }),
        append: async (request) => { writes.push(request); return { data: {} }; },
        batchUpdate: async (request) => { writes.push(request); return { data: {} }; },
      },
    },
  };
}

test("readLeads returns canonical values from reordered headers", async () => {
  const headers = ["Notes", "Profile URL", "Name", "Draft Opener"];
  const sheets = stubSheets(headers, [["human note", "https://linkedin.com/in/dana", "Dana", "Hello Dana"]]);
  const result = await readLeads(sheets, "sheet-id");
  assert.equal(result.headerRow, 1);
  assert.equal(result.rows[0].cells.Name, "Dana");
  assert.equal(result.rows[0].cells["LinkedIn (or profile URL)"], "https://linkedin.com/in/dana");
  assert.equal(result.rows[0].cells.Notes, "human note");
});

test("readLeads finds the next logical lead row despite checkbox placeholders", async () => {
  const headers = ["Name", "Profile URL", "Connection Status", "Replied"];
  const sheets = stubSheets(headers, [
    ["Dana", "https://linkedin.com/in/dana", "", ""],
    ["", "", false, false],
    ["", "", false, false],
  ]);
  const result = await readLeads(sheets, "sheet-id");
  assert.equal(result.lastLeadRow, 2);
  assert.equal(result.nextAppendRow, 3);
});

test("applyPlan writes an agent field to its actual moved column and never writes Notes", async () => {
  const headers = ["Notes", "Profile URL", "Name", "Why this person"];
  const sheets = stubSheets(headers);
  const layout = resolveLeadsLayout(headers);
  await applyPlan(sheets, "sheet-id", {
    newRows: [], updates: [{ rowNumber: 2, set: { "Why Them": "Relevant launch" } }],
  }, { layout, headerRow: 1, firstDataRow: 2 });
  assert.equal(sheets.writes.length, 1);
  assert.equal(sheets.writes[0].requestBody.data[0].range, "Leads!D2");
  assert.equal(sheets.writes[0].requestBody.data[0].values[0][0], "Relevant launch");
});

test("new rows use sparse updates at the logical row and do not touch checkbox placeholders", async () => {
  const headers = ["Name", "Profile URL", "Connection Status", "Replied", "Date Added", "Source"];
  const sheets = stubSheets(headers);
  const layout = resolveLeadsLayout(headers);
  await applyPlan(sheets, "sheet-id", {
    newRows: [{ cells: {
      Name: "Dana", "LinkedIn (or profile URL)": "https://linkedin.com/in/dana",
      "Date Added": "2026-08-03", "Source Type": "Public Web",
      "Connected/Req Sent": "", Replied: "",
    } }], updates: [],
  }, { layout, appendRow: 3 });
  const ranges = sheets.writes[0].requestBody.data.map((entry) => entry.range);
  assert.deepEqual(ranges, ["Leads!A3", "Leads!B3", "Leads!E3", "Leads!F3"]);
  assert.ok(!ranges.includes("Leads!C3"));
  assert.ok(!ranges.includes("Leads!D3"));
});

test("applyPlan still refuses when the live headers cannot identify a person", async () => {
  const sheets = stubSheets(["Contact link"]);
  await assert.rejects(
    () => applyPlan(sheets, "sheet-id", { newRows: [{ cells: {} }], updates: [] }, { headers: ["Contact link"] }),
    (err) => err instanceof LeadsLayoutError,
  );
});
