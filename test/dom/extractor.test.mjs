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
import { extractPeopleFromDom } from "../../src/worker.mjs";

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
