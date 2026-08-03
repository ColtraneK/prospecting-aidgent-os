import { test } from "node:test";
import assert from "node:assert/strict";
import { nextActionFor, planNextActions } from "../src/followup.mjs";

const NOW = new Date("2026-08-10T12:00:00Z");

test("reply, connected, pending, and unreplied states map to distinct actions", () => {
  assert.equal(nextActionFor({ Replied: true }, { now: NOW }).action, "Review reply");
  assert.equal(nextActionFor({ "Connected/Req Sent": "Connected" }, { now: NOW }).action, "Send first message");
  assert.equal(nextActionFor({ "Connected/Req Sent": "Request sent", "Connection Checked On": "2026-08-09" }, { now: NOW }).action, "Recheck connection");
  const follow = nextActionFor({ "Reached Out On": "2026-08-01", Replied: false }, { now: NOW, followUpDays: 5 });
  assert.equal(follow.action, "Follow up");
  assert.equal(follow.due, "2026-08-06");
});

test("2nd and 3rd degree people require a human connection request", () => {
  assert.equal(nextActionFor({ "Browser Connection Status": "2nd" }, { now: NOW }).action, "Send connection request");
  assert.equal(nextActionFor({ "Browser Connection Status": "3rd+" }, { now: NOW }).action, "Send connection request");
});

test("terminal outcomes suppress further outreach", () => {
  const next = nextActionFor({ Outcome: "Not interested", "Connected/Req Sent": "Connected" }, { now: NOW });
  assert.equal(next.action, "No action");
  assert.equal(next.due, "");
});

test("the planner writes only Next Action system fields", () => {
  const plan = planNextActions({ rows: [{ rowNumber: 4, cells: { Name: "Ada", "Connected/Req Sent": "Connected" } }] }, { now: NOW });
  assert.deepEqual(Object.keys(plan.updates[0].set), ["Next Action", "Next Action Due"]);
  assert.equal(plan.queue[0].action, "Send first message");
});
