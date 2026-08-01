import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePersona, personaSheetId, loadPersonaFile, isPlaceholderSheetId } from "../src/persona.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

const valid = {
  persona: "P",
  icp: "Owners and operations leads of small service businesses in the US who are drowning in recurring operational busywork and post about it.",
  hard_exclusions: ["recruiter", "student"],
  geography: { include: ["US"] },
  topics: ["automating onboarding", "hiring an ops manager"],
  voice: "Warm, concise, curious, no pitch.",
  sheet_id: "SHEET123",
};

test("a valid v6 persona passes", () => {
  const r = validatePersona(valid);
  assert.equal(r.valid, true, r.errors.join(","));
});

test("the icp must be prose, not a label", () => {
  const r = validatePersona({ ...valid, icp: "founders" });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("prose paragraph")));
});

test("hard_exclusions must be a list, and an empty list is allowed", () => {
  assert.equal(validatePersona({ ...valid, hard_exclusions: "recruiter" }).valid, false);
  assert.equal(validatePersona({ ...valid, hard_exclusions: [] }).valid, true,
    "a person with nothing to exclude is a valid person");
});

test("topics and voice are required — they are what the agent judges with", () => {
  assert.ok(validatePersona({ ...valid, topics: [] }).errors.some((e) => e.includes("topics")));
  assert.ok(validatePersona({ ...valid, voice: "" }).errors.some((e) => e.includes("voice")));
});

test("a persona without a sheet is still valid — bind-sheet comes after save-persona", () => {
  const noSheet = { ...valid };
  delete noSheet.sheet_id;
  assert.equal(validatePersona(noSheet).valid, true);
});

test("geography shapes: list, string, include/exclude — but not a number", () => {
  assert.equal(validatePersona({ ...valid, geography: ["US"] }).valid, true);
  assert.equal(validatePersona({ ...valid, geography: "US" }).valid, true);
  assert.equal(validatePersona({ ...valid, geography: 42 }).valid, false);
  const noGeo = { ...valid };
  delete noGeo.geography;
  assert.equal(validatePersona(noGeo).valid, true);
});

test("personaSheetId extracts from url", () => {
  assert.equal(personaSheetId({ sheet_url: "https://docs.google.com/spreadsheets/d/ABC_123/edit#gid=0" }), "ABC_123");
  assert.equal(personaSheetId({ sheet_id: "XYZ" }), "XYZ");
});

test("the public example persona file is valid YAML and schema", async () => {
  const p = await loadPersonaFile(path.join(REPO, "personas", "example-generic.yaml"));
  const r = validatePersona(p);
  assert.equal(r.valid, true, r.errors.join(","));
  assert.ok(isPlaceholderSheetId(personaSheetId(p)), "the shipped example must not bind a real sheet");
});
