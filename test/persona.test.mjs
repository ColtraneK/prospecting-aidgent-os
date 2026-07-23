import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePersona, personaSheetId, loadPersonaFile, personaTemplate } from "../src/persona.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

const valid = {
  persona: "P", version: 1,
  business: { name: "Acme", website: "https://x" },
  offer: "o", customer_outcome: "c",
  target_industries: ["A"], company_sizes: ["1-10"], buyer_titles: ["Founder"],
  geography: { include: ["US"] }, buying_signals: ["s"], exclusions: ["Students"],
  opener_voice: "warm", search_keywords: ["ops"], research_sources: ["linkedin_profile"],
  sheet_id: "SHEET123", created: "2026-07-23", last_updated: "2026-07-23",
};

test("valid persona passes", () => {
  const r = validatePersona(valid);
  assert.equal(r.valid, true, r.errors.join(","));
});

test("missing fields are reported", () => {
  const bad = { ...valid };
  delete bad.buyer_titles;
  delete bad.business;
  const r = validatePersona(bad);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("buyer_titles")));
  assert.ok(r.errors.some((e) => e.includes("business")));
});

test("empty array field is rejected", () => {
  const r = validatePersona({ ...valid, buyer_titles: [] });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("buyer_titles")));
});

test("requires a sheet id or url", () => {
  const noSheet = { ...valid };
  delete noSheet.sheet_id;
  const r = validatePersona(noSheet);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes("sheet_id or sheet_url")));
});

test("personaSheetId extracts from url", () => {
  assert.equal(personaSheetId({ sheet_url: "https://docs.google.com/spreadsheets/d/ABC_123/edit#gid=0" }), "ABC_123");
  assert.equal(personaSheetId({ sheet_id: "XYZ" }), "XYZ");
});

test("the public example persona file is valid YAML and schema", async () => {
  const p = await loadPersonaFile(path.join(REPO, "personas", "example-generic.yaml"));
  const r = validatePersona(p);
  assert.equal(r.valid, true, r.errors.join(","));
});

test("personaTemplate produces a schema-shaped object", () => {
  const t = personaTemplate({ businessName: "Acme", website: "https://x", titles: ["Founder"], sheetId: "S" }, { nowIso: "2026-07-23T00:00:00Z" });
  assert.equal(t.business.name, "Acme");
  assert.equal(t.created, "2026-07-23");
  assert.ok(Array.isArray(t.buyer_titles));
});
