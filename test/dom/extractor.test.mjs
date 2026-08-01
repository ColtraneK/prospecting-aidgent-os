// dom.test.mjs — runs the real DOM extractor against saved result pages in a
// real browser. NOT part of `npm test`, because a browser download is not
// something a non-technical user should hit on install: run `npm run test:dom`.
//
// This exists because the extractor is the one piece of this system that can
// break without anything failing — LinkedIn changes its markup, the collector
// matches nothing, and a run reports "0 candidates" as if that were an answer.
// Pinning it to a saved page is how that stays honest between LinkedIn redesigns.
//
// To pin a NEW page shape: save the results page from your browser
// (Ctrl+S, "Webpage, HTML only") into test/fixtures/ and add a case below.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractPeopleFromDom, extractActivityFromDom, extractPostsFromDom } from "../../src/worker.mjs";

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

const load = async (file) => {
  await page.goto(pathToFileURL(path.join(FIXTURES, file)).href, { waitUntil: "domcontentloaded" });
  return page.evaluate(extractPeopleFromDom);
};

test("reads current LinkedIn markup, which carries no meaningful class names", async () => {
  const people = await load("search-results-modern.html");
  assert.equal(people.length, 3, `expected 3 people, got ${JSON.stringify(people, null, 2)}`);

  const ada = people.find((p) => p.name === "Ada Lovelace");
  assert.ok(ada, "did not find Ada Lovelace");
  assert.match(ada.url, /\/in\/ada-lovelace-7b21/);
  assert.equal(ada.title, "Head of Operations at Analytical Engines");
  assert.equal(ada.location, "London, United Kingdom");

  // The screen-reader duplicate of the name must not leak into the name.
  for (const p of people) {
    assert.ok(!/view /i.test(p.name), `"${p.name}" contains the screen-reader label`);
    assert.ok(!/profile/i.test(p.name), `"${p.name}" contains the screen-reader label`);
  }
});

test("the same person linked twice in one card is one person", async () => {
  const people = await load("search-results-modern.html");
  const karen = people.filter((p) => /karen/i.test(p.name));
  assert.equal(karen.length, 1);
  assert.equal(karen[0].title, "Director of Research at Retrieval Ltd");
});

test("degree badges and buttons are never mistaken for people", async () => {
  const people = await load("search-results-modern.html");
  for (const p of people) {
    assert.ok(!/^\d+(st|nd|rd|th)/.test(p.name), `degree badge captured as a name: ${p.name}`);
    assert.ok(!/^(connect|message|see more)$/i.test(p.name), `a button captured as a name: ${p.name}`);
    assert.ok(!/^(connect|message)$/i.test(p.title), `a button captured as a title: ${p.title}`);
  }
});

test("nothing outside <main> is collected", async () => {
  const people = await load("search-results-modern.html");
  assert.ok(!people.some((p) => /my-own-account/.test(p.url)),
    "collected a link from the nav bar — that is the signed-in user, not a lead");
});

test("the old 2023 markup still reads, so this is a superset not a swap", async () => {
  const people = await load("search-results-legacy.html");
  assert.equal(people.length, 1);
  assert.equal(people[0].name, "Alan Turing");
  assert.equal(people[0].title, "Chief Scientist at Bletchley Systems");
  assert.equal(people[0].location, "Manchester, United Kingdom");
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

test("the degree badge is captured as a fact, not just filtered out as noise", async () => {
  // "• 2nd" is noise for the title and a fact about the relationship. The
  // extractor has to do both things with it, which is why this is pinned.
  const people = await load("search-results-modern.html");
  const by = Object.fromEntries(people.map((p) => [p.name, p]));

  assert.equal(by["Ada Lovelace"].degree, "2nd");
  assert.equal(by["Grace Hopper"].degree, "3rd", "3rd+ collapses to 3rd");
  // No badge on Karen's card, so no degree. Never inferred from anything else.
  assert.equal(by["Karen Spärck Jones"].degree, "");

  // And the badge still never leaks into the title or the location.
  for (const p of people) {
    assert.ok(!/\b(1st|2nd|3rd)\b/.test(p.title), `degree leaked into title: "${p.title}"`);
    assert.ok(!/\b(1st|2nd|3rd)\b/.test(p.location), `degree leaked into location: "${p.location}"`);
  }
});

test("a degree-shaped word inside a headline is not read as a connection degree", async () => {
  // "1st Officer" and "3rd Generation Owner" are real headlines. A bare
  // /\b1st\b/ would turn either into a first-degree connection, which is a
  // fabricated fact about the person — the one thing this repo must not do.
  await page.setContent(`
    <main><ul><li>
      <a href="https://www.linkedin.com/in/robin-vale/">
        <span aria-hidden="true">Robin Vale</span>
        <span class="visually-hidden">View Robin Vale's profile</span>
      </a>
      <div>1st Officer at Coastal Air, 3rd generation aviator</div>
      <div>Seattle, Washington, United States</div>
    </li></ul></main>`);
  const [robin] = await page.evaluate(extractPeopleFromDom);
  assert.equal(robin.name, "Robin Vale");
  assert.equal(robin.degree, "", `read "${robin.degree}" from a headline that only mentions ranks`);
  assert.match(robin.title, /1st Officer at Coastal Air/);
});

test("a badge on its own line is still captured", async () => {
  await page.setContent(`
    <main><ul><li>
      <a href="https://www.linkedin.com/in/lee-park/">
        <span aria-hidden="true">Lee Park</span>
      </a>
      <div>1st</div>
      <div>Head of Ops at Northwind</div>
      <div>Denver, Colorado, United States</div>
    </li></ul></main>`);
  const [lee] = await page.evaluate(extractPeopleFromDom);
  assert.equal(lee.degree, "1st");
  assert.equal(lee.title, "Head of Ops at Northwind");
});

// --- v5: the wrong-node bug, and the two shapes that captured nothing --------

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

// --- v5: content search, the surface a run now sources from first ------------

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
