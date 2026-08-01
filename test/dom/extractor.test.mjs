// dom/extractor.test.mjs — runs the real DOM extractor against saved pages in
// a real browser. NOT part of `npm test`, because a browser download is not
// something a non-technical user should hit on install: run `npm run test:dom`.
//
// This exists because the extractor is the one piece of this system that can
// break without anything failing — LinkedIn changes its markup, extraction
// matches nothing, and column D goes quietly blank. Pinning it to saved pages
// is how evidence capture stays honest between LinkedIn redesigns.
//
// To pin a NEW page shape: save the page from your browser (Ctrl+S, "Webpage,
// HTML only") into test/fixtures/ and add a case below.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractActivityFromDom, extractPostsFromDom } from "../../src/worker.mjs";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

let browser;
let page;

before(async () => {
  const { chromium } = await import("playwright");
  // CHROMIUM_PATH lets a machine with a Chromium already on disk skip the
  // download (e.g. a container that pins its own build).
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  page = await browser.newPage();
});

after(async () => {
  await browser?.close().catch(() => {});
});

const loadActivity = async (file) => {
  await page.goto(pathToFileURL(path.join(FIXTURES, file)).href, { waitUntil: "domcontentloaded" });
  return page.evaluate(extractActivityFromDom);
};

test("reads current activity markup, which carries no meaningful class names", async () => {
  const items = await loadActivity("activity-modern.html");
  assert.equal(items.length, 2, `expected 2 activity items, got ${JSON.stringify(items, null, 2)}`);

  // Newest first, exactly as the page lists them.
  const [post, comment] = items;
  assert.equal(post.type, "post");
  assert.match(post.summary, /client onboarding from nine days to two/);
  assert.match(post.url, /urn:li:activity:7355501234567890123/);
  assert.match(post.dateText, /2\s*d/i, `post date not captured: "${post.dateText}"`);

  assert.equal(comment.type, "comment");
  assert.match(comment.summary, /capacity is the real constraint/);
  assert.match(comment.dateText, /1\s*w/i, `comment date not captured: "${comment.dateText}"`);
});

test("activity summaries never contain feed chrome (buttons, counts, stamps)", async () => {
  const items = await loadActivity("activity-modern.html");
  for (const it of items) {
    assert.ok(!/^(like|comment|repost|send|reply)$/i.test(it.summary), `chrome captured as summary: "${it.summary}"`);
    assert.ok(!/^\d+(\s+comments?)?$/i.test(it.summary), `a count captured as summary: "${it.summary}"`);
    assert.ok(!/^\d+\s*(d|w|mo)\b/i.test(it.summary), `a timestamp captured as summary: "${it.summary}"`);
  }
});

test("the old 2023 activity markup still reads too", async () => {
  const items = await loadActivity("activity-legacy.html");
  assert.equal(items.length, 1);
  assert.match(items[0].summary, /On computable numbers/);
  assert.equal(items[0].type, "post");
  assert.match(items[0].dateText, /2023/);
});

// --- the wrong-node bug, and the two shapes that captured nothing ------------

test("a tag list of forty names is never mistaken for the post body", async () => {
  // The Leah Cone row from the 2026-08-01 pilot. The tag strip and the actor
  // headline are BOTH longer than the real post, so length alone cannot decide
  // this — the structure has to.
  const items = await loadActivity("activity-tag-strip.html");
  assert.equal(items.length, 1, JSON.stringify(items, null, 2));
  const [post] = items;

  assert.match(post.summary, /Twelve weeks, one room, no slides/,
    `captured the wrong node: "${post.summary}"`);
  // None of the tagged people may appear in what we quote back to someone.
  for (const name of ["Amara Diallo", "Benedikt Hoff", "Carla Mendes", "Jonah Brightwater"]) {
    assert.ok(!post.summary.includes(name), `a tagged name leaked into column D: "${post.summary}"`);
  }
  // And the actor header's headline is not the post either.
  assert.ok(!/largest peer network/i.test(post.summary), `the actor headline was captured as the post: "${post.summary}"`);
  assert.match(post.dateText, /4\s*d/i);
});

test("a post whose permalink anchor is gone is still captured, with no link", async () => {
  // Zero items used to be reported as "this person does not post". The posts
  // are right there; only their permalinks are missing.
  const items = await loadActivity("activity-no-permalink.html");
  assert.equal(items.length, 1, JSON.stringify(items, null, 2));
  const [post] = items;
  assert.match(post.summary, /replaced it with a written/);
  assert.equal(post.url, "", "a permalink we never saw must not be invented");
  assert.match(post.dateText, /2026-07-29/, `date not read from <time>: "${post.dateText}"`);
  // The actor headline must not win here either.
  assert.ok(!/Fractional Chief of Staff/i.test(post.summary), post.summary);
});

// --- content-search pages: the same walk, with authors ------------------------
// The agent reads these pages itself via `npm run open`, but the extractor's
// authorship rules are pinned here because they are the anti-fabrication rules:
// whose words a card carries must never depend on LinkedIn's DOM order.

const loadPosts = async (file) => {
  await page.goto(pathToFileURL(path.join(FIXTURES, file)).href, { waitUntil: "domcontentloaded" });
  return page.evaluate(extractPostsFromDom, { withAuthor: true });
};

test("a content-search result yields the author AND the post that found them", async () => {
  const posts = await loadPosts("content-search-modern.html");
  // Four cards with an author (two plain, one behind a social-context header,
  // one repost); the promoted card has no author and is dropped, not guessed.
  assert.equal(posts.length, 4, JSON.stringify(posts, null, 2));

  const [dara, marisol] = posts;
  assert.equal(dara.author.name, "Dara Okonjo");
  assert.match(dara.author.url, /\/in\/dara-okonjo/);
  assert.match(dara.summary, /Capacity is the constraint nobody budgets for/);
  assert.match(dara.url, /urn:li:activity:7360001111222233334/);
  assert.match(dara.dateText, /3\s*d/i, `post date not captured: "${dara.dateText}"`);
  assert.equal(dara.type, "post");

  assert.equal(marisol.author.name, "Marisol Vega");
  assert.match(marisol.summary, /the team knows/);
  assert.match(marisol.dateText, /6\s*d/i);

  // The screen-reader duplicate must not leak into the author's name, and the
  // actor header's headline must not be captured as the post.
  for (const p of posts) {
    assert.ok(!/view /i.test(p.author.name), `"${p.author.name}" carries the screen-reader label`);
    assert.ok(!/Fractional COO helping|Operations Consultant \|/i.test(p.summary),
      `the actor headline was captured as the post: "${p.summary}"`);
    assert.ok(!/^\d+(\s+comments?)?$/.test(p.summary), `a count captured as summary: "${p.summary}"`);
  }
});

test("a 'liked this' header does not make the liker the author", async () => {
  // LinkedIn puts social context ABOVE the actor, so the first /in/ link in the
  // card belongs to whoever boosted the post. Attributing the post to them is a
  // fabricated fact about two people at once.
  const posts = await loadPosts("content-search-modern.html");
  const tomas = posts.find((p) => /Nobody owns the handoff/.test(p.summary));
  assert.ok(tomas, "the socially-boosted post was not read at all");
  assert.equal(tomas.author.name, "Tomas Lindgren");
  assert.ok(!posts.some((p) => /Priya/.test(p.author.name)), "the liker was captured as an author");
});

test("the actor's headline is subtracted even when nothing else disqualifies it", async () => {
  // In the other fixtures the actor header renders as one glued line carrying
  // "visible to anyone" or a degree badge, so the chrome filter alone would hide
  // it. Here the headline sits on its own line and is LONGER than the post, so
  // only removing the header node's lines keeps it out of column D.
  const posts = await loadPosts("content-search-modern.html");
  const tomas = posts.find((p) => p.author.name === "Tomas Lindgren");
  assert.equal(tomas.summary, "Nobody owns the handoff. That is the whole bug.");
  assert.ok(!/Fractional Integrator/.test(tomas.summary),
    `the actor headline was captured as the post: "${tomas.summary}"`);
});

test("a repost is labelled as one, so nobody is credited with another person's words", async () => {
  const posts = await loadPosts("content-search-modern.html");
  const shared = posts.find((p) => /biggest lever in professional services/.test(p.summary));
  assert.ok(shared, "the reposted card was not read");
  assert.equal(shared.type, "repost", "a repost read as an original post would be quoted back as 'your post'");
  assert.equal(shared.author.name, "Original Author", "the resharer is not the author");
});

test("a promoted post with no author is dropped rather than attributed to anyone", async () => {
  const posts = await loadPosts("content-search-modern.html");
  assert.ok(!posts.some((p) => /benchmark report/i.test(p.summary)),
    "a company post with no /in/ link was turned into a candidate");
});

test("the same walk reads an activity page and a content page identically", async () => {
  // One function serves both surfaces. If they ever diverge, the body-picking
  // rules have been fixed in one place and not the other — which is exactly how
  // the wrong-node bug survived its first fix.
  await page.goto(pathToFileURL(path.join(FIXTURES, "activity-tag-strip.html")).href, { waitUntil: "domcontentloaded" });
  const asActivity = await page.evaluate(extractActivityFromDom);
  const asContent = await page.evaluate(extractPostsFromDom, { withAuthor: true });
  assert.equal(asActivity[0].summary, asContent[0].summary);
  assert.equal(asActivity[0].dateText, asContent[0].dateText);
  assert.equal(asContent[0].author.name, "Leah Cone");
  assert.equal(asActivity[0].author, undefined, "an activity read does not ask for the author");
});
