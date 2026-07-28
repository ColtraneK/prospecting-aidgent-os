// `npm run start` is the only command a brand-new user is told to type, and an
// AI agent will be the one typing it. Two things must hold forever: it never
// asks a question (an interactive prompt would hang the agent's harness), and
// the first unmet item in the checklist is the single next step it names.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectSetup, buildChecklist, formatStatus } from "../src/start.mjs";

/** Facts for a setup where everything is done. */
function readyFacts(over = {}) {
  return {
    nodeMajor: 22, nodeOk: true,
    depsInstalled: true,
    envFileExists: true,
    chromeProfile: "/home/me/aidgent-chrome-profile", profileExists: true, signedIn: true,
    credsPath: "/home/me/keys/svc.json", credsExist: true,
    activeSlug: "acme", privatePersonaCount: 1,
    persona: { persona: "acme" }, personaValid: true, personaErrors: [],
    sheetId: "1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g", sheetBound: true,
    includeConnections: false,
    ...over,
  };
}

test("the checklist is in dependency order — you never install Node after binding a sheet", () => {
  const items = buildChecklist(readyFacts()).map((i) => i.label);
  assert.equal(items.length, 9);
  const idx = (needle) => items.findIndex((l) => l.includes(needle));
  assert.ok(idx("Node 20") < idx("dependencies"));
  assert.ok(idx("dependencies") < idx(".env"));
  assert.ok(idx("Chrome profile") < idx("signed into LinkedIn"));
  assert.ok(idx("persona exists") < idx("complete and valid"));
  assert.ok(idx("complete and valid") < idx("Google Sheet is bound"));
});

test("the FIRST unmet item is the one named as the next step", () => {
  // Two things are missing; only the earlier one is offered, so the user is
  // never sent to do something that depends on an earlier missing piece.
  const facts = readyFacts({ envFileExists: false, credsExist: false, credsPath: "" });
  const out = formatStatus(facts);
  assert.match(out, /NEXT STEP \(3 of 9\)/);
  assert.match(out, /Copy \.env\.example to \.env/);
  assert.ok(!out.includes("service account"), out);
});

test("READY appears only when every single item is done", () => {
  const checklist = buildChecklist(readyFacts());
  assert.ok(checklist.every((i) => i.done));
  const out = formatStatus(readyFacts(), checklist);
  assert.match(out, /READY\./);
  assert.match(out, /npm run pilot/);
  assert.match(out, /npm run daily/);
  assert.ok(!out.includes("NEXT STEP"));

  for (const key of ["nodeOk", "depsInstalled", "envFileExists", "profileExists", "signedIn", "credsExist", "personaValid", "sheetBound"]) {
    const broken = formatStatus(readyFacts({ [key]: false }));
    assert.ok(!broken.includes("READY."), `READY leaked when ${key} was false`);
    assert.match(broken, /NEXT STEP/);
  }
});

test("a persona that exists but is missing fields names the missing fields", () => {
  const out = formatStatus(readyFacts({ personaValid: false, personaErrors: ["missing required field: offer"] }));
  assert.match(out, /missing required field: offer/);
});

test("a persona folder with files but nothing selected sends you to select-persona", () => {
  const out = formatStatus(readyFacts({ activeSlug: "", persona: null, personaValid: false, privatePersonaCount: 2 }));
  assert.match(out, /select-persona/);
  const none = formatStatus(readyFacts({ activeSlug: "", persona: null, personaValid: false, privatePersonaCount: 0 }));
  assert.match(none, /AGENTS\.md/);
  assert.ok(!none.includes("select-persona"), none);
});

test("a wrong path is reported as wrong, not as unset — different fix, different wording", () => {
  const missing = formatStatus(readyFacts({ profileExists: false, signedIn: false }));
  assert.match(missing, /does not exist yet/);
  const unset = formatStatus(readyFacts({ chromeProfile: "", profileExists: false, signedIn: false }));
  assert.match(unset, /Set AIDGENT_CHROME_PROFILE/);
});

test("READY reports whether warm connections are being mined", () => {
  assert.match(formatStatus(readyFacts({ includeConnections: true })), /your existing connections are mined too/);
  assert.match(formatStatus(readyFacts()), /net-new people only/);
});

test("the status text never asks the user a question", () => {
  // A question mark here would mean the command is waiting for an answer it can
  // never receive. Every line must be a statement or an instruction.
  const samples = [formatStatus(readyFacts()), formatStatus(readyFacts({ envFileExists: false }))];
  for (const out of samples) assert.ok(!out.includes("?"), out);
});

test("inspectSetup only reads the filesystem — an empty folder is simply not ready", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aidgent-start-"));
  const s = await inspectSetup({ repoRoot: tmp, env: {} });
  assert.equal(s.envFileExists, false);
  assert.equal(s.depsInstalled, false);
  assert.equal(s.profileExists, false);
  assert.equal(s.signedIn, false);
  assert.equal(s.credsExist, false);
  assert.equal(s.sheetBound, false);
  assert.ok(buildChecklist(s).some((i) => !i.done));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("a Chrome profile that exists but was never signed into is caught", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aidgent-start-"));
  const profile = path.join(tmp, "chrome-profile");
  fs.mkdirSync(path.join(profile, "Default"), { recursive: true });

  const before = await inspectSetup({ repoRoot: tmp, env: { AIDGENT_CHROME_PROFILE: profile } });
  assert.equal(before.profileExists, true);
  assert.equal(before.signedIn, false, "an empty profile has no cookie store");

  fs.writeFileSync(path.join(profile, "Default", "Cookies"), "");
  const after = await inspectSetup({ repoRoot: tmp, env: { AIDGENT_CHROME_PROFILE: profile } });
  assert.equal(after.signedIn, true);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("personas are read from the repo you point at, not from wherever the code lives", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aidgent-start-"));
  const dir = path.join(tmp, "private", "personas");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "acme.yaml"), "persona: acme\nsheet_id: 1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g\n");
  fs.writeFileSync(path.join(tmp, "private", "selected-persona.txt"), "acme\n");

  const s = await inspectSetup({ repoRoot: tmp, env: {} });
  assert.equal(s.activeSlug, "acme");
  assert.equal(s.privatePersonaCount, 1);
  assert.equal(s.sheetBound, true, "the sheet id comes from the persona, not the environment");
  assert.equal(s.personaValid, false, "a stub persona is incomplete, and start says so rather than pretending");
  assert.ok(s.personaErrors.length);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("a placeholder sheet id does not count as bound", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aidgent-start-"));
  const placeholder = await inspectSetup({ repoRoot: tmp, env: { GOOGLE_SHEET_ID: "YOUR_EXAMPLE_SHEET_ID_HERE" } });
  assert.equal(placeholder.sheetBound, false);
  const real = await inspectSetup({ repoRoot: tmp, env: { GOOGLE_SHEET_ID: "1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g" } });
  assert.equal(real.sheetBound, true);
  fs.rmSync(tmp, { recursive: true, force: true });
});
