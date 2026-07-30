// `npm run start` is the only command a brand-new user is told to type, and an
// AI agent will be the one typing it. Two things must hold forever: it never
// asks a question (an interactive prompt would hang the agent's harness), and
// the first unmet item in the checklist is the single next step it names.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectSetup, buildChecklist, formatStatus, SHEET_TEMPLATE_COPY_URL, SERVICE_ACCOUNT_WALKTHROUGH } from "../src/start.mjs";

/** Facts for a setup where everything is done. */
function readyFacts(over = {}) {
  const f = baseFacts(over);
  // Keep the flipped state COHERENT. Setting envReproduces:false while leaving
  // the happy-path reason in place renders "Right now .env names a signed-in
  // profile." above an empty fix — a next step no real run can produce and
  // nobody could act on, which would let the item pass review untested.
  if (f.envReproduces === false && over.envReproducesReason === undefined) {
    f.envReproducesReason = ".env has a fill-this-in placeholder where the profile path goes (/absolute/path/outside/repo/aidgent-chrome-profile), not a real folder.";
    f.envReproducesFix = "Replace it with AIDGENT_CHROME_PROFILE=/home/me/aidgent-chrome-profile.";
  }
  return f;
}

function baseFacts(over = {}) {
  return {
    nodeMajor: 22, nodeOk: true,
    depsInstalled: true,
    envFileExists: true,
    chromeProfile: "/home/me/aidgent-chrome-profile", profileExists: true, signedIn: true,
    profilePlaceholder: false, profileFrom: "env-file", sessionFrom: "env-file",
    envReproduces: true,
    envReproducesReason: ".env names a signed-in profile (/home/me/aidgent-chrome-profile).",
    envReproducesFix: "",
    credsPath: "/home/me/keys/svc.json", credsExist: true,
    activeSlug: "acme", privatePersonaCount: 1,
    persona: { persona: "acme" }, personaValid: true, personaErrors: [],
    sheetId: "1YourOwnSheetIdGoesHere0123456789abcdefgh", sheetBound: true,
    includeConnections: false,
    ...over,
  };
}

test("the checklist is in dependency order — you never install Node after binding a sheet", () => {
  const items = buildChecklist(readyFacts()).map((i) => i.label);
  assert.equal(items.length, 10);
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
  assert.match(out, /NEXT STEP \(3 of 10\)/);
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

  for (const key of ["nodeOk", "depsInstalled", "envFileExists", "profileExists", "signedIn", "envReproduces", "credsExist", "personaValid", "sheetBound"]) {
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
  // Every reachable state, not a sample of two: the two longest hints (the
  // service-account walkthrough and the sheet copy link) are exactly where a
  // stray question mark would creep in.
  const states = ["nodeOk", "depsInstalled", "envFileExists", "profileExists", "signedIn",
    "envReproduces", "credsExist", "personaValid", "sheetBound"];
  const samples = [formatStatus(readyFacts()),
    formatStatus(readyFacts({ credsExist: false, credsPath: "" })),
    ...states.map((k) => formatStatus(readyFacts({ [k]: false })))];
  for (const out of samples) assert.ok(!out.includes("?"), out);
});

test("a numbered procedure stays readable after wrapping", () => {
  // The long hints are things a non-developer follows with their hands. If a
  // wrapped continuation line starts flush left, step 4 and step 5 read as one
  // paragraph and people lose their place — which is how setup stalls.
  const out = formatStatus(readyFacts({ credsExist: false, credsPath: "" }));
  const body = out.split("NEXT STEP")[1].split("\n");
  const numbered = body.filter((l) => /^\s+\d\. /.test(l));
  assert.equal(numbered.length, 7, "all seven steps must each start their own line");
  for (const l of body) assert.ok(l.length <= 90, `line too long to read: ${l}`);
  for (const l of body) assert.equal(l, l.trimEnd(), "no trailing whitespace");
  assert.ok(body.includes(""), "the hint keeps its blank separator lines");
});

test("the paused output carries the whole service-account procedure, not a pointer", () => {
  // Codex relays this verbatim to someone who is not a developer. If it says
  // "see README.md" they have to go find it, and setup stalls right here.
  const out = formatStatus(readyFacts({ credsExist: false, credsPath: "" }));
  assert.match(out, /NEXT STEP \(7 of 10\)/);
  for (const beat of [/console\.cloud\.google\.com/, /Google Sheets API/,
    /Service account/i, /JSON/, /GOOGLE_APPLICATION_CREDENTIALS/,
    /client_email/, /Editor/]) {
    assert.match(out, beat, `the walkthrough never mentions ${beat}`);
  }
  // Sharing the sheet with the service account is the step everyone skips, and
  // skipping it fails in a way that looks like a bug in this tool. Say so.
  assert.match(out, /different identity/i);
});

test("a wrong credentials path is a path problem, not a fresh walkthrough", () => {
  // The hint is word-wrapped, so compare on whitespace-normalized text.
  const out = formatStatus(readyFacts({ credsExist: false })).replace(/\s+/g, " ");
  assert.match(out, /which is not there/);
  assert.ok(!out.includes("console.cloud.google.com"), out);
});

test("someone with no sheet is given a copy link, not told to make one", () => {
  const out = formatStatus(readyFacts({ sheetBound: false }));
  assert.match(out, /NEXT STEP \(10 of 10\)/);
  assert.ok(out.includes(SHEET_TEMPLATE_COPY_URL), out);
  assert.match(out, /Make a copy/);
  assert.match(out, /bind-sheet/);
  // The label must keep saying this tool creates nothing — the copy is an act
  // the human performs in their own Drive, which is the whole point.
  assert.match(out, /never creates one/);
});

test("the copy link is a Google /copy URL, so the copy lands in the clicker's Drive", () => {
  assert.match(SHEET_TEMPLATE_COPY_URL,
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}\/copy$/);
  // /edit would hand everyone the same shared document instead of their own.
  assert.ok(!SHEET_TEMPLATE_COPY_URL.includes("/edit"), SHEET_TEMPLATE_COPY_URL);
  assert.ok(!SERVICE_ACCOUNT_WALKTHROUGH.includes("?"), "no questions in the walkthrough");
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

test("a session that lives only in this terminal never reports READY", async () => {
  // The exact field failure, driven through the real inspectSetup rather than
  // hand-built facts: .env untouched, the working profile exported in the
  // shell. Every earlier step goes green — the merged environment really does
  // have a signed-in profile — and the run in the NEXT shell reads .env, finds
  // the placeholder, and stops at a LinkedIn login page.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aidgent-start-"));
  const profile = path.join(tmp, "real-profile");
  fs.mkdirSync(path.join(profile, "Default"), { recursive: true });
  fs.writeFileSync(path.join(profile, "Default", "Cookies"), "");

  const s = await inspectSetup({
    repoRoot: tmp,
    fileEnv: { AIDGENT_CHROME_PROFILE: "/absolute/path/outside/repo/aidgent-chrome-profile" },
    shellEnv: { AIDGENT_CHROME_PROFILE: profile },
  });
  assert.equal(s.profileExists, true, "the shell value is genuinely usable right now");
  assert.equal(s.signedIn, true);
  assert.equal(s.envReproduces, false, "but .env cannot reproduce it, and that must be visible");

  assert.ok(!formatStatus(s).includes("READY."), "a shell-only session is not READY");
  // Assert on the item itself: this tmp repo is missing node_modules and .env
  // too, so the single next step the status prints is an earlier one.
  const item = buildChecklist(s).find((i) => i.label.includes("written in .env"));
  assert.equal(item.done, false);
  assert.match(item.next, /placeholder/);
  assert.ok(item.next.includes(profile), "the fix must name the path to write into .env");
  assert.ok(!item.next.includes("?"), item.next);

  // And once .env names it, this step stops complaining.
  const fixed = await inspectSetup({
    repoRoot: tmp,
    fileEnv: { AIDGENT_CHROME_PROFILE: profile },
    shellEnv: { AIDGENT_CHROME_PROFILE: profile },
  });
  assert.equal(fixed.envReproduces, true);
  assert.equal(fixed.sessionFrom, "env-file",
    "a value present in .env must not be reported as terminal-only just because the shell also has it");

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
  fs.writeFileSync(path.join(dir, "acme.yaml"), "persona: acme\nsheet_id: 1YourOwnSheetIdGoesHere0123456789abcdefgh\n");
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
  const real = await inspectSetup({ repoRoot: tmp, env: { GOOGLE_SHEET_ID: "1YourOwnSheetIdGoesHere0123456789abcdefgh" } });
  assert.equal(real.sheetBound, true);
  fs.rmSync(tmp, { recursive: true, force: true });
});
