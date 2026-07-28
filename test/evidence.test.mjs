import { test } from "node:test";
import assert from "node:assert/strict";
import { recentPostCell, composeWhyThem, composeComment, composeIntroDM } from "../src/evidence.mjs";

const withPost = {
  name: "Sam Rivera",
  title: "Founder",
  company: "Bright Ops",
  activity: {
    type: "post",
    date: "2026-07-20",
    summary: "Sharing how we cut our weekly ops busywork in half.",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:1111",
  },
};

test("a recent post is quoted verbatim, dated, and linked", () => {
  const cell = recentPostCell(withPost, true);
  assert.match(cell, /^"Sharing how we cut our weekly ops busywork in half\."/);
  assert.ok(cell.includes("(2026-07-20)"));
  assert.ok(cell.includes(withPost.activity.url));
  assert.ok(!cell.includes("older than 7 days"));
});

test("an OLDER post is still shown, explicitly marked — column D is never mysteriously blank", () => {
  // This was the reported bug: a lead was accepted, a comment was suggested,
  // but the post and link the comment referred to were missing from the sheet.
  const cell = recentPostCell(withPost, false);
  assert.ok(cell.includes("Sharing how we cut our weekly ops busywork in half."), cell);
  assert.ok(cell.includes(withPost.activity.url), cell);
  assert.match(cell, /older than 7 days/);
});

test("an older post with no captured date says so rather than guessing", () => {
  const cell = recentPostCell({ activity: { summary: "text", url: "https://x.test/p" } }, false);
  assert.match(cell, /\(date unknown — older than 7 days\)/);
});

test("nothing captured yields an empty cell — never an invented post", () => {
  assert.equal(recentPostCell({}, true), "");
  assert.equal(recentPostCell({ activity: null }, true), "");
  assert.equal(recentPostCell({ activity: { summary: "", url: "" } }, true), "");
});

test("a post with a link but no text still gives you the link", () => {
  const cell = recentPostCell({ activity: { url: "https://x.test/p", date: "2026-07-20" } }, true);
  assert.equal(cell, "(2026-07-20)\nhttps://x.test/p");
});

test("whenever a comment is suggested, there is a post to comment on", () => {
  // The two must stay in lockstep: any candidate that produces column F must
  // also produce column D.
  for (const recent of [true, false]) {
    const comment = composeComment(withPost);
    if (comment) assert.ok(recentPostCell(withPost, recent).length > 0, `recent=${recent}`);
  }
  assert.equal(composeComment({ name: "No Activity" }), "");
});

test("why-them and intro DM cite only verified facts", () => {
  assert.match(composeWhyThem(withPost), /Founder at Bright Ops/);
  assert.match(composeWhyThem(withPost), /\(2026-07-20\)/);
  assert.equal(composeWhyThem({}), "");

  assert.match(composeIntroDM(withPost, {}), /^Hi Sam,/);
  assert.match(composeIntroDM({ name: "Kim Lee", title: "COO" }, {}), /^Hi Kim,/);
  assert.equal(composeIntroDM({}, {}), "");
});
