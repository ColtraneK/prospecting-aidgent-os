// What a content-search hit is allowed to keep when the worker then opens that
// person's profile. The post is the reason they are a candidate at all, so a
// later profile visit must not silently swap it for something else.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeProfile, contentRowsFromPosts } from "../src/worker.mjs";
import { buildSources } from "../src/searchTerms.mjs";
import { runPipeline } from "../src/pipeline.mjs";

const contentHit = {
  name: "Dara Okonjo",
  url: "https://www.linkedin.com/in/dara-okonjo",
  title: "",
  degree: "",
  activityStatus: "captured",
  activity: {
    summary: "Capacity is the constraint nobody budgets for.",
    date: "2026-07-29",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7360001111222233334",
    type: "post",
  },
};

test("the post that found someone survives the profile visit", () => {
  const merged = mergeProfile(contentHit, {
    headline: "Fractional COO helping founder-led firms",
    location: "Austin, United States",
    degree: "2nd",
    activity: {
      summary: "Congratulations to the team on the award!",
      date: "2026-07-31",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:9999",
      type: "post",
    },
    activityStatus: "captured",
  });

  // First-hand profile facts fill in what the search card did not carry.
  assert.equal(merged.location, "Austin, United States");
  assert.equal(merged.degree, "2nd");
  assert.equal(merged.title, "Fractional COO helping founder-led firms", "a blank title takes the headline");

  // But the on-topic, in-window post is the one the comment and DM refer to.
  assert.equal(merged.activity.summary, contentHit.activity.summary);
  assert.equal(merged.activity.url, contentHit.activity.url);
});

test("a people-search row still takes whatever the activity page yields", () => {
  // No content-search activity on the base, so nothing changes for the old path.
  const merged = mergeProfile(
    { name: "Lee Park", title: "Head of Ops", degree: "1st" },
    { headline: "Head of Ops at Northwind", activity: { summary: "s", date: "2026-07-30", url: "u", type: "post" }, activityStatus: "captured" },
  );
  assert.equal(merged.activity.summary, "s");
  assert.equal(merged.degree, "1st", "an observed badge still beats the profile top card");
});

test("an unreadable activity page never erases the post that found them", () => {
  const merged = mergeProfile(contentHit, { headline: "h", activity: null, activityStatus: "unreadable" });
  assert.equal(merged.activity.summary, contentHit.activity.summary);
  assert.equal(merged.activityStatus, "captured");
});

test("a content-sourced candidate reaches the sheet with column D and E filled", () => {
  // The end-to-end point of Job 1: post-first sourcing means the evidence
  // columns are never an afterthought.
  const persona = {
    buyer_titles: ["Fractional COO"],
    core_topics: ["capacity"],
    geography: { include: ["United States"], exclude: [] },
    exclusions: [], search_keywords: [], buying_signals: [],
  };
  const candidate = mergeProfile(contentHit, {
    headline: "Fractional COO helping founder-led firms",
    location: "Austin, United States",
  });
  const { plan } = runPipeline({
    persona,
    existingSheet: { rows: [] },
    candidates: [candidate],
    nowMs: Date.parse("2026-08-01T12:00:00Z"),
    nowIso: "2026-08-01T12:00:00Z",
  });
  assert.equal(plan.newRows.length, 1, JSON.stringify(plan.rejected, null, 2));
  const cells = plan.newRows[0].cells;
  assert.match(cells["Recent Post (verbatim + date)"], /Capacity is the constraint/);
  assert.equal(cells["Post Link"], contentHit.activity.url);
  assert.equal(cells["Activity Date"], "2026-07-29");
});

test("a repost never becomes a candidate, because the words are not theirs", () => {
  // Sourcing someone off a repost and then writing "your post on <someone
  // else's words>" attributes a stranger's writing to them — and it would sail
  // through the grounding check, because those words really are in column D.
  const rows = contentRowsFromPosts([
    { author: { name: "Wes Abbott", url: "https://www.linkedin.com/in/wes-abbott" },
      summary: "The biggest lever is deciding what you will not do.", dateText: "2d", url: "u1", type: "repost" },
    { author: { name: "Dara Okonjo", url: "https://www.linkedin.com/in/dara-okonjo" },
      summary: "Capacity is the constraint nobody budgets for.", dateText: "3d", url: "u2", type: "post" },
    { summary: "Download our benchmark report.", dateText: "1w", url: "u3", type: "post" }, // no author
  ]);
  assert.deepEqual(rows.map((r) => r.name), ["Dara Okonjo"]);
  assert.equal(rows[0].activity.type, "post");
  assert.equal(rows[0].activityStatus, "captured");
});

test("the same author found twice in one search is one candidate", () => {
  const rows = contentRowsFromPosts([
    { author: { name: "Dara Okonjo", url: "https://www.linkedin.com/in/dara-okonjo/" }, summary: "First.", dateText: "1d", url: "a", type: "post" },
    { author: { name: "Dara Okonjo", url: "https://www.linkedin.com/in/dara-okonjo" }, summary: "Second.", dateText: "2d", url: "b", type: "post" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].activity.summary, "First.", "the newest post the page listed wins");
});

test("a persona with topics puts a dated content search at the top of the run", () => {
  const sources = buildSources(
    { buyer_titles: ["Fractional COO"], core_topics: ["capacity"], geography: { include: ["United States"] } },
    { target: 10 },
  );
  assert.equal(sources[0].kind, "content");
  assert.ok(sources[0].url.includes("datePosted"), sources[0].url);
});
