import { test } from "node:test";
import assert from "node:assert/strict";
import { recentPostCell, postLinkCell, scoreOutOf10, composeWhyThem, composeComment, composeIntroDM } from "../src/evidence.mjs";

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
  // The no-post fallback now takes its audience from the PERSONA, never from
  // the person's own headline. With neither, there is nothing true to say and
  // the cell stays empty.
  assert.match(composeIntroDM({ name: "Kim Lee", title: "COO" }, { buyer_titles: ["Fractional COO"] }), /^Hi Kim,/);
  assert.equal(composeIntroDM({ name: "Kim Lee", title: "COO" }, {}), "");
  assert.equal(composeIntroDM({}, {}), "");
});

// --- v5: the composed fallbacks are held to the validator they now share -----

test("why them says what actually scored, not what the headline says", () => {
  // "Fractional COO at Vale Partners" tells you what they call themselves. The
  // factor breakdown tells you why this system chose them, which is the thing a
  // person acting on a 6-out-of-10 needs and could not previously get.
  const factors = [
    { name: "title_match", points: 25, detail: 'title matches "Fractional COO"' },
    { name: "industry_match", points: 0, detail: "industry not confirmed" },
    { name: "geo_match", points: 12, detail: 'in target geography "United States"' },
    { name: "recent_topic_activity", points: 30, detail: 'recent (<=7d) activity about "capacity"' },
  ];
  const why = composeWhyThem({ title: "Fractional COO", company: "Vale Partners" }, factors);
  assert.match(why, /title matches "Fractional COO"/);
  assert.match(why, /in target geography "United States"/);
  assert.match(why, /recent \(<=7d\) activity about "capacity"/);
  assert.ok(!why.includes("industry not confirmed"), `a zero-point factor is not a reason: ${why}`);
  // Without factors it falls back to the old shape rather than emptying out.
  assert.match(composeWhyThem(withPost), /Founder at Bright Ops/);
});

test("no composed message is ever cut mid-word, pipe-souped, or over length", () => {
  // Every defect from the pilot's DM close-up, in one test.
  const longPost = {
    name: "Dara Okonjo",
    title: "Award-Winning Founder | 500+ Public Speaking Engagements | Advisor",
    activity: {
      type: "post",
      date: "2026-07-29",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:1",
      summary:
        "Startups often survive their initial proof-of-concept phase through sheer willpower and " +
        "manual data tracking and human-driven follow-ups, which works right up until the week it does not.",
    },
  };
  for (const text of [composeComment(longPost), composeIntroDM(longPost, { buyer_titles: ["Fractional COO"] })]) {
    assert.ok(text.length > 0);
    assert.ok(text.length <= 280, `${text.length} chars: ${text}`);
    assert.ok(!text.includes("|"), `pipe soup: ${text}`);
    assert.ok(!/\bhttps?:\/\//.test(text), `a URL got into a message: ${text}`);
    // An ellipsis may only follow a whole word.
    const cut = text.match(/([A-Za-z][\w'-]*)…/);
    if (cut) {
      assert.match(longPost.activity.summary, new RegExp(`\\b${cut[1]}\\b`),
        `"${cut[1]}…" cuts a word in half: ${text}`);
    }
  }
  // And the headline never reaches the message, with or without a post.
  const noPost = { name: "Dara Okonjo", title: longPost.title };
  const fallback = composeIntroDM(noPost, { buyer_titles: ["Fractional COO"] });
  assert.ok(!/Public Speaking/.test(fallback), fallback);
  assert.match(fallback, /people in Fractional COO roles/);
  // An explicit audience phrase in the persona wins.
  assert.match(composeIntroDM(noPost, { audience_phrase: "fractional operators" }), /fractional operators/);
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
