import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isTruthyFlag, aliasesFor, indexObservations, connectionStatusFor,
  replyStatusFor, planFollowUp, assertOnlyFollowupFields, formatFollowUpReport,
} from "../src/followup.mjs";
import { FOLLOWUP_FIELDS, HUMAN_FIELDS, AGENT_FIELDS, COLS } from "../src/schema.mjs";
import { buildValueUpdates } from "../src/sheetPlan.mjs";

const URL_SAM = "https://www.linkedin.com/in/sam-rivera-fake";
const URL_DANA = "https://www.linkedin.com/in/dana-lopez-fake";
const URL_KIT = "https://www.linkedin.com/in/kit-obrien-fake";

const sheet = {
  rows: [
    // reached out, now connected, replied (messaging matches by NAME only)
    { rowNumber: 4, cells: { "Name": "Sam Rivera", "LinkedIn (or profile URL)": URL_SAM, "Reached Out": "TRUE" } },
    // reached out, invite still pending, no reply
    { rowNumber: 5, cells: { "Name": "Dana Lopez", "LinkedIn (or profile URL)": URL_DANA, "Reached Out": "yes" } },
    // NOT reached out — must be untouched
    { rowNumber: 6, cells: { "Name": "Kit O'Brien", "LinkedIn (or profile URL)": URL_KIT, "Reached Out": "" } },
  ],
};

const observations = {
  connections: [{ name: "Sam Rivera", url: "https://linkedin.com/in/sam-rivera-fake/" }],
  pendingInvites: [{ name: "Dana Lopez", url: URL_DANA }],
  threads: [
    // No profile URL here — this is the real messaging-list shape.
    { name: "Sam Rivera", url: "", lastMessageFromThem: true, lastMessageText: "Happy to chat next week.", lastMessageDate: "Jul 20" },
    { name: "Dana Lopez", url: "", lastMessageFromThem: false, lastMessageText: "quick intro", lastMessageDate: "Jul 19" },
  ],
};

test("isTruthyFlag accepts the ways a human writes yes", () => {
  for (const v of ["TRUE", "yes", "Y", "x", "1", "done", " Sent "]) assert.equal(isTruthyFlag(v), true, v);
  for (const v of ["", null, undefined, "no", "FALSE", "later", "n"]) assert.equal(isTruthyFlag(v), false, String(v));
});

test("aliasesFor yields a canonical url key and a bare name key", () => {
  assert.deepEqual(aliasesFor({ url: "linkedin.com/in/Sam-Rivera-Fake/", name: "Sam  Rivera" }), [URL_SAM, "name:sam rivera"]);
  assert.deepEqual(aliasesFor({ name: "Kit O'Brien" }), ["name:kit o brien"]);
  assert.deepEqual(aliasesFor({}), []);
});

test("name-only messaging threads still match a url-keyed sheet row", () => {
  const idx = indexObservations(observations);
  const aliases = aliasesFor({ url: URL_SAM, name: "Sam Rivera" });
  assert.equal(connectionStatusFor(aliases, idx), "connected");
  const { status, lastReply } = replyStatusFor(aliases, idx);
  assert.equal(status, "replied");
  assert.equal(lastReply, '"Happy to chat next week." (Jul 20)');
});

test("your own last message is not counted as their reply", () => {
  const idx = indexObservations(observations);
  const aliases = aliasesFor({ url: URL_DANA, name: "Dana Lopez" });
  assert.equal(connectionStatusFor(aliases, idx), "pending");
  assert.deepEqual(replyStatusFor(aliases, idx), { status: "no_reply", lastReply: "" });
});

test("an unread surface records unknown, never a guessed negative", () => {
  const idx = indexObservations({ observedConnections: false, observedInvites: false, observedMessages: false });
  const aliases = aliasesFor({ url: URL_KIT, name: "Kit O'Brien" });
  assert.equal(connectionStatusFor(aliases, idx), "unknown");
  assert.equal(replyStatusFor(aliases, idx).status, "unknown");

  // Invites read but connections not: still unknown, because "not connected"
  // cannot be concluded from half the evidence.
  const half = indexObservations({ pendingInvites: [], observedConnections: false });
  assert.equal(connectionStatusFor(aliases, half), "unknown");
});

test("planFollowUp only touches rows you marked Reached Out", () => {
  const { updates, counts, skipped } = planFollowUp(sheet, observations, { nowIso: "2026-07-23T12:00:00Z" });
  assert.equal(updates.length, 2);
  assert.equal(skipped, 1);
  assert.deepEqual(updates.map((u) => u.rowNumber), [4, 5]);

  assert.deepEqual(updates[0].set, {
    "Connection Status": "connected",
    "Reply Status": "replied",
    "Follow-up Checked": "2026-07-23",
    "Last Reply": '"Happy to chat next week." (Jul 20)',
  });
  assert.deepEqual(updates[1].set, {
    "Connection Status": "pending",
    "Reply Status": "no_reply",
    "Follow-up Checked": "2026-07-23",
  });
  assert.equal(counts.checked, 2);
  assert.equal(counts.connected, 1);
  assert.equal(counts.pending, 1);
  assert.equal(counts.replied, 1);
});

test("a recorded reply is never blanked out by a pass that could not read messaging", () => {
  const { updates } = planFollowUp(sheet, { connections: [], pendingInvites: [], observedMessages: false }, { nowIso: "2026-07-24T00:00:00Z" });
  for (const u of updates) {
    assert.equal(u.set["Reply Status"], "unknown");
    assert.ok(!("Last Reply" in u.set), "Last Reply must be omitted, not emptied");
  }
});

test("the follow-up pass can never write outside Y:AB", () => {
  assert.throws(() => assertOnlyFollowupFields({ "Reached Out": "TRUE" }), /may only write/);
  assert.throws(() => assertOnlyFollowupFields({ "Name": "x" }), /may only write/);
  for (const f of FOLLOWUP_FIELDS) assert.equal(assertOnlyFollowupFields({ [f]: "v" }), true);

  // And no follow-up field collides with a human or agent column.
  for (const f of FOLLOWUP_FIELDS) {
    assert.ok(!HUMAN_FIELDS.includes(f));
    assert.ok(!AGENT_FIELDS.includes(f));
  }
  assert.deepEqual(FOLLOWUP_FIELDS.map((f) => COLS[f].letter), ["Y", "Z", "AA", "AB"]);
});

test("planFollowUp output writes cleanly through the real sheet planner", () => {
  const { updates } = planFollowUp(sheet, observations, { nowIso: "2026-07-23T12:00:00Z" });
  const { appends, cellUpdates } = buildValueUpdates({ newRows: [], updates });
  assert.equal(appends.length, 0);
  const ranges = cellUpdates.map((u) => u.range);
  const allowed = new Set(FOLLOWUP_FIELDS.map((f) => COLS[f].letter));
  for (const r of ranges) {
    const col = r.match(/^Leads!([A-Z]+)/)[1];
    assert.ok(allowed.has(col), `${r} is outside the follow-up band`);
  }
  // Row 5 has no Last Reply (AA), so it must split into Y:Z and AB — never a
  // Y:AB block that would blank AA.
  assert.ok(ranges.includes("Leads!Y5:Z5"));
  assert.ok(ranges.includes("Leads!AB5"));
  assert.ok(!ranges.includes("Leads!Y5:AB5"));
});

test("rows with no name and no url are skipped rather than mismatched", () => {
  const { updates, skipped } = planFollowUp({ rows: [{ rowNumber: 9, cells: { "Reached Out": "TRUE" } }] }, observations);
  assert.equal(updates.length, 0);
  assert.equal(skipped, 1);
});

test("formatFollowUpReport is plain English", () => {
  const out = formatFollowUpReport({ checked: 2, connected: 1, pending: 1, notConnected: 0, unknown: 0, replied: 1 }, 1);
  assert.match(out, /checked 2 row\(s\) you marked Reached Out \(1 not marked/);
  assert.match(out, /replies detected: 1/);
});
