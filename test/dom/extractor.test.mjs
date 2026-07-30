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
import { extractPeopleFromDom, extractActivityFromDom } from "../../src/worker.mjs";

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
