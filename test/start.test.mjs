import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, formatStatus, toJson, SHEET_TEMPLATE_COPY_URL, SERVICE_ACCOUNT_WALKTHROUGH } from "../src/start.mjs";

function readyFacts(over = {}) {
  return {
    nodeMajor: 22,
    nodeOk: true,
    depsInstalled: true,
    envFileExists: true,
    credsPath: "C:/keys/service.json",
    credsExist: true,
    activeSlug: "acme",
    privatePersonaCount: 1,
    persona: { persona: "acme" },
    personaValid: true,
    personaErrors: [],
    sheetId: "1YourOwnSheetIdGoesHere0123456789abcdefgh",
    sheetUrl: "https://docs.google.com/spreadsheets/d/1YourOwnSheetIdGoesHere0123456789abcdefgh/edit",
    sheetBound: true,
    sheetReachable: true,
    sheetReachableReason: "verified",
    sheetReachableFix: "",
    apifyConfigured: true,
    browserVerified: true,
    browserVerifiedAt: "2026-07-30T12:00:00.000Z",
    ...over,
  };
}

test("the checklist is five workshop-friendly setup beats", () => {
  const list = buildChecklist(readyFacts());
  assert.equal(list.length, 5);
  assert.equal(list.every((item) => item.done), true);
  assert.match(list[2].label, /Apify/);
  assert.match(list[3].label, /Browser/);
});

test("READY appears only when Sheet, Apify, Browser, and persona are ready", () => {
  const out = formatStatus(readyFacts());
  assert.match(out, /READY/);
  assert.match(out, /Browser:\s+verified/);
  assert.match(out, /npm run source/);
  assert.match(out, /npm run qualify/);
  assert.ok(!out.includes("?"));
});

test("the first unmet item is the single next step", () => {
  const facts = readyFacts({ sheetReachable: false, sheetReachableReason: "not verified", sheetReachableFix: "Share with client_email as Editor." });
  const out = formatStatus(facts);
  assert.match(out, /NEXT STEP \(2 of 5\)/);
  assert.match(out, /client_email/);
  assert.doesNotMatch(out, /READY/);
});

test("a bound Sheet still requires an access proof", () => {
  const list = buildChecklist(readyFacts({ sheetReachable: false }));
  assert.equal(list[1].done, false);
  assert.match(list[1].agentRuns, /check-sheet/);
});

test("Apify and Browser are separate, explicit proofs", () => {
  const apify = buildChecklist(readyFacts({ apifyConfigured: false }));
  assert.equal(apify[2].done, false);
  assert.match(apify[2].next, /API token/);
  const browser = buildChecklist(readyFacts({ browserVerified: false, browserVerifiedAt: "" }));
  assert.equal(browser[3].done, false);
  assert.match(browser[3].agentRuns, /browser-verify -- --setup/);
  assert.match(browser[3].next, /sign in/i);
});

test("missing basics include the service-account walkthrough", () => {
  const list = buildChecklist(readyFacts({ credsExist: false, credsPath: "" }));
  assert.equal(list[0].done, false);
  assert.match(list[0].next, /client_email/);
  assert.match(SERVICE_ACCOUNT_WALKTHROUGH, /Editor/);
});

test("an unbound Sheet offers the canonical copy link", () => {
  const list = buildChecklist(readyFacts({ sheetBound: false, sheetReachable: false }));
  assert.ok(list[1].next.includes(SHEET_TEMPLATE_COPY_URL));
});

test("toJson mirrors setup state and next step", () => {
  const ready = toJson(readyFacts());
  assert.equal(ready.ready, true);
  assert.equal(ready.nextStep, null);
  assert.equal(ready.apifyConfigured, true);
  assert.equal(ready.browserVerified, true);
  const pending = toJson(readyFacts({ browserVerified: false, browserVerifiedAt: "" }));
  assert.equal(pending.ready, false);
  assert.equal(pending.nextStep.number, 4);
});
