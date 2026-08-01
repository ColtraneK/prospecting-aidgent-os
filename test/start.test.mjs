// `npm run start` is the only command a brand-new user is told to type, and an
// AI agent will be the one typing it. Three things must hold: it never asks a
// question, the first unmet item is the single next step, and READY means
// PROVED — the sheet and session steps read proof files, never guesses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, formatStatus, toJson, SHEET_TEMPLATE_COPY_URL, SERVICE_ACCOUNT_WALKTHROUGH } from "../src/start.mjs";

/** Facts for a setup where everything is done and proven. */
function readyFacts(over = {}) {
  return {
    nodeMajor: 22, nodeOk: true,
    depsInstalled: true,
    envFileExists: true,
    credsPath: "/home/me/keys/svc.json", credsExist: true,
    chromeProfile: "/home/me/aidgent-chrome-profile", liAt: "",
    profilePlaceholder: false,
    sessionConfigured: true,
    sessionVerified: true,
    sessionVerifiedReason: "verified 2026-07-30T12:00:00.000Z via chrome profile.",
    sessionVerifiedFix: "",
    sessionVerifiedAt: "2026-07-30T12:00:00.000Z",
    activeSlug: "acme", privatePersonaCount: 1,
    persona: { persona: "acme" }, personaValid: true, personaErrors: [],
    sheetId: "1YourOwnSheetIdGoesHere0123456789abcdefgh",
    sheetUrl: "https://docs.google.com/spreadsheets/d/1YourOwnSheetIdGoesHere0123456789abcdefgh/edit",
    sheetBound: true,
    sheetReachable: true,
    sheetReachableReason: "the service account opened this sheet on 2026-07-30T12:00:00.000Z.",
    sheetReachableFix: "",
    ...over,
  };
}

test("the checklist is ~5 beats: basics, sheet proven, login proven, persona", () => {
  const list = buildChecklist(readyFacts());
  assert.ok(list.length <= 5, `checklist grew back to ${list.length} steps`);
  assert.equal(list.every((i) => i.done), true);
});

test("READY appears only when everything is done, and shows the proof", () => {
  const out = formatStatus(readyFacts());
  assert.match(out, /READY/);
  assert.match(out, /proved against LinkedIn, not inferred/);
  assert.match(out, /FOR THE AGENT, not for the person to type/);
  assert.match(out, /npm run open/);
  assert.match(out, /npm run qualify/);
  assert.ok(!out.includes("?"), "start never asks a question");
});

test("the first unmet item is the single next step", () => {
  const s = readyFacts({ sheetReachable: false, sheetReachableReason: "nothing has confirmed the service account can open this sheet.", sheetReachableFix: "Share your sheet with the service account: copy the client_email from the .json key, Share, Editor, Send." });
  const out = formatStatus(s);
  assert.match(out, /NEXT STEP \(2 of \d\)/);
  assert.match(out, /client_email/);
  assert.match(out, /Nothing has been changed or sent/);
  // The later unmet-looking steps are not named as the next step.
  assert.ok(!out.includes("READY"));
});

test("a bound sheet is not enough — the proof file decides the sheet step", () => {
  const list = buildChecklist(readyFacts({ sheetReachable: false, sheetReachableReason: "r", sheetReachableFix: "f" }));
  assert.equal(list[1].done, false);
  assert.match(list[1].agentRuns, /check-sheet/);
});

test("a configured session is not enough — the session step reads the proof", () => {
  const list = buildChecklist(readyFacts({ sessionVerified: false, sessionVerifiedReason: "no run has ever proved this session works.", sessionVerifiedFix: "Sign in yourself in the window that opens." }));
  assert.equal(list[2].done, false);
  assert.match(list[2].agentRuns, /check-login/);
  const hint = list[2].next;
  assert.match(hint, /check-login writes the proven value into \.env itself/);
});

test("missing basics fold into one step with the service-account walkthrough", () => {
  const s = readyFacts({ credsExist: false, credsPath: "" });
  const list = buildChecklist(s);
  assert.equal(list[0].done, false);
  assert.match(list[0].next, /client_email/);
  assert.match(list[0].next, /Editor/);
  assert.match(SERVICE_ACCOUNT_WALKTHROUGH, /client_email/);
  assert.ok(!/\?/.test(SERVICE_ACCOUNT_WALKTHROUGH), "no question marks — a question invites the agent to answer it");
});

test("the no-sheet hint offers the copy link, and it is the template constant", () => {
  const s = readyFacts({ sheetBound: false, sheetReachable: false });
  const list = buildChecklist(s);
  assert.ok(list[1].next.includes(SHEET_TEMPLATE_COPY_URL));
  assert.match(list[1].next, /never creates one/i);
});

test("toJson gives the agent the same facts as data", () => {
  const ready = toJson(readyFacts());
  assert.equal(ready.ready, true);
  assert.equal(ready.nextStep, null);
  assert.match(ready.sheetUrl, /^https:\/\/docs\.google\.com\/spreadsheets\//);

  const pending = toJson(readyFacts({ sessionVerified: false, sessionVerifiedReason: "r", sessionVerifiedFix: "f" }));
  assert.equal(pending.ready, false);
  assert.equal(pending.nextStep.number, 3);
  assert.ok(pending.checklist.every((i) => typeof i.label === "string" && typeof i.done === "boolean"));
});
