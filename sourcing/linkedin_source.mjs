// linkedin_source.mjs
// Assisted LinkedIn sourcing through YOUR own logged-in Chrome, over CDP.
// Playwright never logs in for you and never stores credentials: it attaches
// to a Chrome you started with --remote-debugging-port=9222 and signed into.
//
// This is a SCAFFOLD. LinkedIn's DOM changes often, so let Codex read the live
// page and adjust the selectors marked TODO. Keep volumes low and paced.
//
// Setup:
//   1. Start Chrome:  chrome --remote-debugging-port=9222 --user-data-dir=~/.aidgent-chrome
//   2. Log into LinkedIn in that window.
//   3. npm i -D playwright   (Chromium is driven via CDP; no download needed)
//   4. node linkedin_source.mjs
//
// It writes leads.csv with: Name, Title / Company, LinkedIn, Latest Post, Why Them, Suggested Opener
// (the last two are left blank here for you or the model to fill on review).

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

// ---- config (edit to your locked ICP) --------------------------------------
const CDP_URL = "http://localhost:9222";
const TARGET = 25;                      // stop after this many verified people
const KEYWORDS = "founder";             // TODO: build from your ICP titles
const GEO = "";                         // optional: a LinkedIn geoUrn or leave blank
const SEARCH_URL =
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(KEYWORDS)}`;
const MIN_DELAY_MS = 2500, MAX_DELAY_MS = 6000;   // polite pacing

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_DELAY_MS + Math.floor((MAX_DELAY_MS - MIN_DELAY_MS) * ((Date.now() % 1000) / 1000));

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Name", "Title / Company", "LinkedIn (or profile URL)", "Latest Post (or relevant link)", "Why Them", "Suggested Opener"];
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const page = context.pages()[0] ?? (await context.newPage());

const leads = [];
let pageNum = 1;

try {
  while (leads.length < TARGET && pageNum <= 10) {
    await page.goto(`${SEARCH_URL}&page=${pageNum}`, { waitUntil: "domcontentloaded" });
    await sleep(jitter());

    // TODO: verify these selectors against the live page; Codex should adapt them.
    const cards = await page.$$eval(
      "li.reusable-search__result-container",
      (nodes) =>
        nodes.map((n) => {
          const nameEl = n.querySelector("span[aria-hidden='true']");
          const linkEl = n.querySelector("a.app-aware-link[href*='/in/']");
          const titleEl = n.querySelector(".entity-result__primary-subtitle");
          return {
            name: nameEl?.textContent?.trim() || "",
            url: linkEl?.href?.split("?")[0] || "",
            title: titleEl?.textContent?.trim() || "",
          };
        })
    );

    for (const c of cards) {
      if (!c.name || !c.url) continue;
      if (leads.some((l) => l[2] === c.url)) continue;   // dedupe by URL
      // Why Them and Suggested Opener are intentionally left blank for human/AI review.
      leads.push([c.name, c.title, c.url, "", "", ""]);
      if (leads.length >= TARGET) break;
    }
    pageNum += 1;
    await sleep(jitter());
  }
} finally {
  writeFileSync("leads.csv", toCsv(leads));
  console.log(`Wrote ${leads.length} rows to leads.csv`);
  await browser.close();   // detaches from your Chrome; it stays open
}
