import { test } from "node:test";
import assert from "node:assert/strict";
import { recentPostCell, postLinkCell, scoreOutOf10 } from "../src/evidence.mjs";

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

test("a recent post is quoted verbatim and dated, with its link alongside", () => {
  const cell = recentPostCell(withPost, true);
  assert.match(cell, /^"Sharing how we cut our weekly ops busywork in half\."/);
  assert.ok(cell.includes("(2026-07-20)"));
  assert.equal(postLinkCell(withPost), withPost.activity.url);
  assert.ok(!cell.includes("older than 7 days"));
});

test("an OLDER post is still shown, explicitly marked — column D is never mysteriously blank", () => {
  // This was the reported bug: a lead was accepted, a comment was suggested,
  // but the post and link the comment referred to were missing from the sheet.
  const cell = recentPostCell(withPost, false);
  assert.ok(cell.includes("Sharing how we cut our weekly ops busywork in half."), cell);
  assert.equal(postLinkCell(withPost), withPost.activity.url);
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

test("a post with a link but no text still gives you the link, in E", () => {
  const cand = { activity: { url: "https://x.test/p", date: "2026-07-20" } };
  assert.equal(recentPostCell(cand, true), "(2026-07-20)");
  assert.equal(postLinkCell(cand), "https://x.test/p");
});

test("the post link is its own cell, and column D no longer carries a URL", () => {
  // A permalink buried under 500 characters of quoted post is not a link
  // anyone clicks. E holds the URL and NOTHING else, so Sheets renders it.
  assert.equal(postLinkCell(withPost), withPost.activity.url);
  assert.ok(!recentPostCell(withPost, true).includes("http"), recentPostCell(withPost, true));
  assert.ok(!recentPostCell(withPost, false).includes("http"));
  assert.equal(postLinkCell({}), "");
  assert.equal(postLinkCell({ activity: null }), "");
  assert.equal(postLinkCell({ activity: { summary: "x" } }), "");
});

test("a long post is clipped at a word boundary, never mid-word", () => {
  const long = {
    activity: {
      date: "2026-07-20",
      summary: ("Startups often survive their initial proof-of-concept phase through sheer willpower and manual tracking. ").repeat(8),
    },
  };
  const cell = recentPostCell(long, true);
  const quoted = cell.match(/^"([\s\S]*)"/)[1];
  assert.ok(quoted.length <= 501);
  const beforeEllipsis = quoted.match(/(\S+)…$/);
  if (beforeEllipsis) {
    assert.match(long.activity.summary, new RegExp(`\\b${beforeEllipsis[1]}\\b`),
      `"${beforeEllipsis[1]}…" cuts a word in half`);
  }
});

test("the 1-10 score is arithmetic on the fit score, and blank stays blank", () => {
  assert.equal(scoreOutOf10(0), 1, "a scored-zero person is a 1, not a blank");
  assert.equal(scoreOutOf10(4), 1, "rounds to 0, floored to 1");
  assert.equal(scoreOutOf10(57), 6);
  assert.equal(scoreOutOf10(65), 7);
  assert.equal(scoreOutOf10(100), 10);
  assert.equal(scoreOutOf10(140), 10, "clamped, never 14");
  // Not scored is not the same fact as scored badly.
  for (const v of ["", null, undefined, "n/a", NaN]) assert.equal(scoreOutOf10(v), "", String(v));
});
