// worker.mjs — the local Playwright worker.
//
// It drives a DEDICATED PERSISTENT Chrome profile that YOU sign into manually.
// It NEVER automates login, MFA, or CAPTCHA, NEVER bypasses access controls, and
// NEVER performs any outward action (no Connect, Message, Follow, Like, React,
// Celebrate, Comment, Share, Repost, Post). Navigation and extraction are
// read-only. On any blocker page it stops safely and exits nonzero.
//
// playwright is imported lazily so the pure logic modules and tests do not
// require it to be installed.

import { detectBlocker, diagnoseEmptyResults } from "./blockers.mjs";
import { preflightSession, PROFILE_MISSING, PROFILE_NEVER_SIGNED_IN } from "./session.mjs";
import { parseActivityDate } from "./recency.mjs";
import { createPacer } from "./pacing.mjs";
import { canonicalizeLinkedInUrl, canonicalKey } from "./url.mjs";
import { buildSources, SENT_INVITES_URL, CONNECTIONS_URL, MESSAGING_URL } from "./searchTerms.mjs";

export const FORBIDDEN_ACTION_LABELS = [
  "Connect", "Message", "Follow", "Like", "Celebrate", "Support",
  "Love", "Insightful", "Funny", "React", "Comment", "Share", "Repost", "Post", "Send",
];

export class BlockerError extends Error {
  constructor(kind, reason) {
    super(reason || kind);
    this.name = "BlockerError";
    this.kind = kind;
  }
}

/**
 * Launch a browser context that carries the person's LinkedIn session.
 *
 * Two ways to have a session, either is enough:
 *  - a persistent profile dir they signed into once (`npm run setup-login`), or
 *  - an AIDGENT_LI_AT cookie pasted into .env — injected here, headless from
 *    the first run, no headed window ever needed.
 * With neither, this refuses: a run without a session must never quietly
 * degrade into some other way of finding people.
 *
 * If the installed Chrome channel is missing, fall back to Playwright's own
 * Chromium rather than erroring — a launch error here is exactly the kind of
 * friction that sends an agent looking for a workaround.
 */
async function launch({ profilePath, liAt = "", channel = "chrome", headless = true, allowNewProfile = false }) {
  if (!profilePath && !liAt) {
    throw new Error("No LinkedIn session: set AIDGENT_CHROME_PROFILE (and run `npm run setup-login`) or paste your li_at cookie into AIDGENT_LI_AT in .env.");
  }
  // Last line of defence, below the CLI preflight. launchPersistentContext
  // CREATES whatever directory it is handed, so an unreal profile path is not
  // an error here — it is a brand-new signed-out Chrome, and the run only
  // finds out at the login wall. Refuse instead of manufacturing a profile.
  //
  // setup-login is the one caller that legitimately makes a profile that does
  // not exist yet, so it passes allowNewProfile. Even then the placeholder is
  // refused: signing into it would leave a real session at a path nobody meant.
  //
  // With an li_at cookie the profile line is optional, and .env.example ships
  // the placeholder — so a perfectly valid cookie-only setup routinely carries
  // a junk path. That must not be fatal, and it must not be persisted to disk
  // either: drop the profile and run the cookie through a plain context, so
  // nothing gets created at a path nobody chose.
  let usableProfile = "";
  if (profilePath) {
    const v = preflightSession({ chromeProfile: profilePath });
    const creating = allowNewProfile &&
      (v.kind === PROFILE_MISSING || v.kind === PROFILE_NEVER_SIGNED_IN);
    if (v.ok || creating) {
      usableProfile = profilePath;
    } else if (liAt) {
      console.error(`Ignoring AIDGENT_CHROME_PROFILE: ${v.reason}`);
      console.error("Running on the li_at cookie instead. No profile folder was created.");
    } else {
      throw new Error(`${v.reason}\n${v.fix}`);
    }
  }
  const { chromium } = await import("playwright");
  const opts = { headless, viewport: { width: 1280, height: 900 } };
  // Never load automation-evasion tricks; we do not bypass bot detection.
  let context;
  if (usableProfile) {
    context = await chromium
      .launchPersistentContext(usableProfile, { ...opts, channel })
      .catch(() => chromium.launchPersistentContext(usableProfile, opts)); // bundled Chromium fallback
  } else {
    const browser = await chromium
      .launch({ headless, channel })
      .catch(() => chromium.launch({ headless }));
    context = await browser.newContext({ viewport: opts.viewport });
  }
  if (liAt) {
    await context.addCookies([{
      name: "li_at", value: liAt, domain: ".linkedin.com", path: "/",
      httpOnly: true, secure: true, sameSite: "None",
    }]);
  }
  return context;
}

/**
 * Preflight: is there a working signed-in LinkedIn session? Opens the feed,
 * runs the same blocker detection as a real run, and reports a named verdict
 * instead of letting the first sourcing run be the discovery mechanism.
 * Returns { ok, kind, reason }.
 */
export async function checkLogin({ config }) {
  let context;
  try {
    context = await launch({
      profilePath: config.chromeProfile,
      liAt: config.liAt,
      channel: config.chromeChannel,
      headless: true,
    });
  } catch (err) {
    return { ok: false, kind: "no_session", reason: err.message };
  }
  try {
    const page = context.pages()[0] || (await context.newPage());
    const resp = await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" }).catch(() => null);
    await page.waitForTimeout(2500);
    await guard(page, resp ? resp.status() : 0);
    // A signed-in feed links to real profiles; a signed-out page does not.
    const signedIn = await page.evaluate(() =>
      !!document.querySelector("a[href*='/in/'], a[href*='/mynetwork'], a[href*='/messaging']"),
    ).catch(() => false);
    if (!signedIn) return { ok: false, kind: "signed_out", reason: "the feed loaded without any signed-in navigation — the session cookie is missing or expired." };
    return { ok: true, kind: "signed_in", reason: "LinkedIn feed loads with a live session." };
  } catch (err) {
    if (err instanceof BlockerError) return { ok: false, kind: err.kind, reason: err.message };
    return { ok: false, kind: "error", reason: err.message };
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Diagnostic: open ONE LinkedIn URL with the signed-in session, read-only, and
 * save its rendered HTML + a screenshot to run-artifacts. This exists so that
 * when extraction misses something on the live DOM, a copy of that DOM can be
 * captured once and turned into a fixture — instead of anyone hand-editing
 * selectors against a page only they can see.
 */
export async function savePageCopy({ config, url, label = "page" }) {
  const context = await launch({
    profilePath: config.chromeProfile,
    liAt: config.liAt,
    channel: config.chromeChannel,
    headless: true,
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    const resp = await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => null);
    await page.waitForTimeout(4000); // let lazy content render
    await guard(page, resp ? resp.status() : 0);
    const shot = await saveSnapshot(page, config.outDir, `copy-${label}`);
    return { ok: true, snapshot: shot };
  } catch (err) {
    if (err instanceof BlockerError) return { ok: false, kind: err.kind, reason: err.message };
    return { ok: false, kind: "error", reason: err.message };
  } finally {
    await context.close().catch(() => {});
  }
}

/** Read the current page state and throw BlockerError if we must stop. */
async function guard(page, status = 0) {
  const [url, title, bodyTextSample] = await Promise.all([
    Promise.resolve(page.url()),
    page.title().catch(() => ""),
    page.evaluate(() => document.body ? document.body.innerText.slice(0, 4000) : "").catch(() => ""),
  ]);
  const b = detectBlocker({ url, title, bodyTextSample, httpStatus: status });
  if (b.blocked) throw new BlockerError(b.kind, b.reason);
}

/**
 * HEADED setup: open LinkedIn so the user can sign in manually. We never type
 * credentials or complete login. We wait until the user has a session, then exit.
 */
export async function setupLogin({ profilePath, channel = "chrome", waitMs = 0 }) {
  const context = await launch({ profilePath, channel, headless: false, allowNewProfile: true });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" }).catch(() => {});
  console.log("A Chrome window is open. Sign in to LinkedIn manually (including any MFA).");
  console.log("When your feed loads, come back here and press Ctrl+C, or close the window.");
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  else await new Promise(() => {}); // wait indefinitely for manual login; user ends it
  await context.close();
}

/**
 * Count how many NEW rows a run has earned so far.
 *
 * The target used to cap people INSPECTED, which meant "pilot 10" delivered ten
 * profiles opened and, after scoring, often two rows in the sheet. What anyone
 * actually asks for is ten LEADS. So acceptance is decided inside the collection
 * loop — `accept` is the same pure scorer the pipeline runs, called on facts
 * this browser observed, so nothing about "no model decides who qualifies"
 * changes — and only a candidate that both scores accepted AND is not already in
 * the sheet moves the counter.
 *
 * Duplicates still get their row refreshed downstream; they just do not count as
 * added, because refreshing a row you already had is not a new lead.
 */
export function makeAddedCounter({ accept, existingKeys }) {
  const keys = existingKeys instanceof Set ? existingKeys : new Set(existingKeys || []);
  const addedKeys = new Set();
  return {
    /** Register one inspected candidate; returns true if it counts as added. */
    consider(candidate) {
      let ok = false;
      try {
        ok = accept ? !!accept(candidate) : false;
      } catch {
        ok = false; // a scorer that throws must never stop the run
      }
      if (!ok) return false;
      const key = canonicalKey({ url: candidate.url, name: candidate.name, company: candidate.company }).key;
      if (!key || keys.has(key) || addedKeys.has(key)) return false;
      addedKeys.add(key);
      return true;
    },
    get added() {
      return addedKeys.size;
    },
  };
}

/**
 * Why a run stopped short of its target. Never a failure — a short day is the
 * correct outcome when the cap or the sources run out — but always said out
 * loud, because "10 of 25" read as "25" is how someone talks themselves into
 * raising the cap.
 */
export function shortfallFor({ added, target, capReached, inspected, sourcesWalked, sourcesTotal }) {
  if (added >= target) return null;
  if (capReached) {
    return {
      kind: "daily_cap",
      text: `${added} of ${target} added; stopped at the daily inspection cap after ${inspected} profile(s).`,
    };
  }
  return {
    kind: "sources_exhausted",
    text: `${added} of ${target} added; walked all ${sourcesWalked} of ${sourcesTotal} source(s) and ran out of people to inspect (${inspected} inspected).`,
  };
}

/**
 * HEADLESS research run. Returns { candidates, blocker, inspected, added }.
 * candidates carry only VERIFIED, captured fields, and include the ones that did
 * NOT qualify, so every rejection still reaches the report with its reason.
 * Why-Them/opener composition happens in the pipeline (cli.mjs), not here.
 *
 * `accept` and `existingKeys` are what make `--target` mean ADDED rows. Without
 * them the run falls back to the old inspected-count behaviour rather than
 * looping forever.
 */
export async function runResearch({ persona, config, accept = null, existingKeys = null }) {
  const pacer = createPacer({
    minDelayMs: config.minDelayMs,
    maxDelayMs: config.maxDelayMs,
    dailyCap: config.dailyCap,
  });
  const sources = buildSources(persona, config);
  const context = await launch({ profilePath: config.chromeProfile, liAt: config.liAt, channel: config.chromeChannel, headless: config.headless });
  const page = context.pages()[0] || (await context.newPage());
  const candidates = [];
  const seen = new Set();
  const sourceReports = [];
  const counter = makeAddedCounter({ accept, existingKeys });
  // With no scorer supplied there is nothing to count, so the inspected count
  // stands in for it and the run behaves exactly as it did before.
  const reached = () => (accept ? counter.added >= config.target : candidates.length >= config.target);
  let blocker = null;
  let unreadableInARow = 0;

  try {
    for (const source of sources) {
      if (reached() || pacer.capReached) break;
      const resp = await page.goto(source.url, { waitUntil: "domcontentloaded" }).catch(() => null);
      await guard(page, resp ? resp.status() : 0);
      await pacer.wait();

      const results = source.kind === "connections"
        ? await collectConnections(page)
        : await collectSearchResults(page);

      // A source that yields nothing is either an empty search (fine) or a page
      // we can no longer read (a defect). Never let the second look like the
      // first: find out which, and stop early if the page is unreadable rather
      // than repeating the same failure across every remaining search.
      if (!results.length) {
        const ev = await pageEvidence(page);
        const d = diagnoseEmptyResults(ev);
        sourceReports.push({ url: source.url, kind: d.kind, reason: d.reason, profileLinks: ev.profileLinkCount });
        if (d.benign) { unreadableInARow = 0; continue; }
        unreadableInARow++;
        const shot = unreadableInARow === 1 ? await saveSnapshot(page, config.outDir, d.kind) : null;
        if (unreadableInARow >= 2) {
          throw new BlockerError(
            d.kind,
            `${d.reason} Two sources in a row came back unreadable, so the run stopped instead of ` +
            `walking the rest.${shot ? ` Snapshot: ${shot}` : ""}`,
          );
        }
        continue;
      }
      unreadableInARow = 0;
      sourceReports.push({ url: source.url, kind: "ok", found: results.length });
      let fromThisSource = 0;
      for (const r of results) {
        if (reached()) break;
        if (source.limit && fromThisSource >= source.limit) break;
        const canon = canonicalizeLinkedInUrl(r.url);
        if (!canon || seen.has(canon)) continue;
        seen.add(canon);
        if (!pacer.tick()) break; // daily cap — the hard stop, never negotiated
        const profile = await inspectProfile(page, canon, pacer);
        const candidate = { ...mergeProfile(r, profile), url: canon, fromConnection: source.kind === "connections" };
        candidates.push(candidate);
        counter.consider(candidate);
        fromThisSource++;
      }
    }
  } catch (err) {
    if (err instanceof BlockerError) {
      blocker = { kind: err.kind, reason: err.message };
    } else {
      blocker = { kind: "error", reason: err.message };
    }
  } finally {
    await context.close().catch(() => {});
  }

  // A run that walked every source, found nobody, and reported no reason is the
  // worst outcome this system can produce: it looks like a clean run. Give it a
  // reason, so it reaches the Run Log, the console, and the exit code.
  if (!candidates.length && !blocker) {
    const benign = sourceReports.filter((r) => r.kind === "no_results").length;
    blocker = {
      kind: benign === sourceReports.length && benign > 0 ? "no_results" : "no_candidates",
      reason:
        `walked ${sourceReports.length} of ${sources.length} source(s) and extracted nobody. ` +
        (benign === sourceReports.length && benign > 0
          ? "Every search legitimately returned no results — the persona's titles/keywords are too narrow."
          : `Breakdown: ${summarize(sourceReports)}.`),
    };
  }

  const shortfall = blocker || !accept
    ? null
    : shortfallFor({
        added: counter.added, target: config.target, capReached: pacer.capReached,
        inspected: pacer.inspected, sourcesWalked: sourceReports.length, sourcesTotal: sources.length,
      });

  return { candidates, blocker, inspected: pacer.inspected, added: counter.added, shortfall, sourceReports };
}

/**
 * AGENT-READ run. The agent opened LinkedIn in its own browser tab, read the
 * search results, and handed back rows. We do not trust those rows — we trust
 * that the profile URLs were on a page — so this opens each one with the
 * signed-in profile and captures the evidence itself, exactly as a search-driven
 * run would. Scoring still happens in the pipeline, on facts this code observed.
 *
 * This exists because LinkedIn's search markup changes and a hardcoded parser
 * goes to zero when it does. Reading the page is the part an agent is good at.
 * Deciding who qualifies is the part it must never do.
 */
export async function runAgentRead({ observed, config, accept = null, existingKeys = null }) {
  const pacer = createPacer({
    minDelayMs: config.minDelayMs,
    maxDelayMs: config.maxDelayMs,
    dailyCap: config.dailyCap,
  });
  const context = await launch({
    profilePath: config.chromeProfile,
    liAt: config.liAt,
    channel: config.chromeChannel,
    headless: config.headless,
  });
  const page = context.pages()[0] || (await context.newPage());
  const candidates = [];
  const unreachable = [];
  const counter = makeAddedCounter({ accept, existingKeys });
  const reached = () => (accept ? counter.added >= config.target : candidates.length >= config.target);
  let blocker = null;

  try {
    for (const row of observed) {
      if (reached() || pacer.capReached) break;
      if (!pacer.tick()) break; // daily cap
      try {
        const profile = await inspectProfile(page, row.url, pacer);
        const candidate = { ...mergeProfile(row, profile), url: row.url };
        candidates.push(candidate);
        counter.consider(candidate);
      } catch (err) {
        if (err instanceof BlockerError) throw err;
        // One dead profile is not a dead run: record it and keep going.
        unreachable.push({ url: row.url, reason: err.message });
      }
    }
  } catch (err) {
    blocker = err instanceof BlockerError
      ? { kind: err.kind, reason: err.message }
      : { kind: "error", reason: err.message };
  } finally {
    await context.close().catch(() => {});
  }

  if (!candidates.length && !blocker) {
    blocker = {
      kind: "no_candidates",
      reason:
        `the agent supplied ${observed.length} row(s) and none of them opened. ` +
        (unreachable.length
          ? `First failure: ${unreachable[0].reason}`
          : "Nothing was attempted — check the target and the daily cap."),
    };
  }

  const shortfall = blocker || !accept
    ? null
    : shortfallFor({
        added: counter.added, target: config.target, capReached: pacer.capReached,
        inspected: pacer.inspected, sourcesWalked: observed.length, sourcesTotal: observed.length,
      });

  return { candidates, blocker, inspected: pacer.inspected, added: counter.added, shortfall, unreachable };
}

/**
 * Fold first-hand profile observations into a search/observed row WITHOUT
 * letting an empty field erase a captured one. The old spread ({...row,
 * ...profile}) quietly wiped the search card's location with the profile
 * page's "" whenever the profile parse missed — which zeroed everyone's
 * geography points. A blank never overwrites a fact.
 */
function mergeProfile(base, profile) {
  const merged = { ...base };
  for (const [k, v] of Object.entries(profile || {})) {
    if (v !== "" && v !== null && v !== undefined) merged[k] = v;
  }
  // A search card sometimes carries no title line; the profile headline is the
  // same fact observed first-hand, so it may stand in. Never the reverse.
  if (!merged.title && merged.headline) merged.title = merged.headline;
  // Degree is the one field where the BASE is the better witness: the search
  // card and the connections list put the badge in a known place, while the
  // profile top card is a wall of text a headline can imitate. So a captured
  // base degree wins, and the profile may only fill a blank.
  if (base && base.degree) merged.degree = base.degree;
  return merged;
}

function summarize(reports) {
  const counts = {};
  for (const r of reports) counts[r.kind] = (counts[r.kind] || 0) + 1;
  return Object.entries(counts).map(([k, n]) => `${n}× ${k}`).join(", ") || "no sources walked";
}

/**
 * Read-only extraction of people-search result cards.
 *
 * This deliberately does NOT key on LinkedIn's class names. Those are generated
 * and they change; a collector built on `.entity-result` returns zero the day
 * they rename it, and zero is indistinguishable from "nobody matched". The one
 * thing a people-search result page cannot stop doing is linking to profiles,
 * so we anchor on `a[href*='/in/']` inside <main> and read the card around it.
 */
async function collectSearchResults(page) {
  // Results render after domcontentloaded. Wait for the anchor rather than
  // trusting the pacing delay to be long enough.
  await page.waitForSelector("main a[href*='/in/']", { timeout: 12000 }).catch(() => {});
  return page.evaluate(extractPeopleFromDom).catch(() => []);
}

/**
 * The DOM walk itself, as a standalone function so it can be run against a
 * saved page in `npm run test:dom` instead of only against live LinkedIn.
 * It must close over nothing: Playwright ships its source into the page.
 */
export function extractPeopleFromDom() {
  {
    const root = document.querySelector("main") || document.body;
    if (!root) return [];
    // A line that is a degree badge and NOTHING else. LinkedIn renders it as
    // "2nd", "• 2nd", "3rd+" and, for screen readers, "2nd degree connection".
    // All of those are noise in a title; "1st Officer at Coastal Air" is not.
    const isDegreeBadgeLine = (s) =>
      /^\d+(st|nd|rd|th)\+?(\s*degree)?(\s*connection)?\s*([•·|]|$)/i.test(s);
    const out = new Map();
    for (const a of root.querySelectorAll("a[href*='/in/']")) {
      const href = a.href || "";
      const m = href.match(/\/in\/([^/?#]+)/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      if (out.has(key)) continue;

      // The visible name sits in an aria-hidden span (the anchor's own text
      // repeats it and appends "View X's profile" for screen readers).
      const hidden = a.querySelector("span[aria-hidden='true']");
      let name = (hidden?.textContent || a.textContent || "").replace(/\s+/g, " ").trim();
      name = name.split(/\bView\b|['’]s profile/)[0].trim();
      // Degree badges ("• 2nd") and empty/CTA anchors are not people.
      if (!name || name.length > 120) continue;
      if (/^(\d+(st|nd|rd|th)|view|message|connect|follow|see more)\b/i.test(name)) continue;

      // Title and location are simply the first two lines of the card that are
      // not the person's own name, a screen-reader label, a degree badge, or a
      // button. innerText renders the anchor as one inline run — "Ada Lovelace
      // View Ada Lovelace's profile • 2nd" — so leading-name is the real filter.
      const card = a.closest("li") || a.parentElement?.parentElement || a;
      const lower = name.toLowerCase();
      const rawLines = (card.innerText || "")
        .split("\n")
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      // The degree badge is noise for the title, but it is a FACT about the
      // person, so capture it before throwing it away. Anchored on the shape
      // LinkedIn actually renders — a bullet-prefixed badge, or a line that is
      // nothing but the badge — rather than a bare /\b1st\b/, which would read
      // "1st Officer" in someone's headline as a first-degree connection.
      // "3rd+" collapses to "3rd". Blank when not seen; never inferred.
      let degree = "";
      const badge = (card.innerText || "").match(/[•·]\s*(1st|2nd|3rd)\+?/i);
      if (badge) degree = badge[1].toLowerCase();
      else {
        const own = rawLines.find((s) => /^(1st|2nd|3rd)\+?(\s*degree)?(\s*connection)?\s*$/i.test(s));
        if (own) degree = own.slice(0, 3).toLowerCase();
      }

      const lines = rawLines
        .filter((s) => {
          if (!s || s.toLowerCase().startsWith(lower)) return false;
          if (/\bview\b[\s\S]*\bprofile\b/i.test(s)) return false;
          // A degree badge and NOTHING else — bare ("2nd"), spelled out
          // ("2nd degree connection", which LinkedIn also renders for screen
          // readers), or followed by a separator. A headline that opens
          // "1st Officer at Coastal Air" is a title, not a degree, and dropping
          // it used to cost that person their title entirely.
          if (isDegreeBadgeLine(s)) return false;
          if (/^(view|message|connect|follow|see more|status is)\b/i.test(s)) return false;
          if (/^[•·|]/.test(s)) return false;
          if (/mutual connection/i.test(s)) return false; // social proof, not a title
          return true;
        });

      out.set(key, {
        name,
        url: href,
        title: lines[0] || "",
        location: lines[1] || "",
        degree,
      });
    }
    return [...out.values()];
  }
}

/**
 * What is actually on this page? Used only when a source produced nothing, to
 * tell "nobody matched" apart from "we cannot read this page any more".
 */
async function pageEvidence(page) {
  return page.evaluate(() => {
    const root = document.querySelector("main") || document.body;
    return {
      url: location.href,
      profileLinkCount: root ? root.querySelectorAll("a[href*='/in/']").length : 0,
      bodyTextSample: (root && root.innerText ? root.innerText : "").slice(0, 3000),
    };
  }).catch(() => ({ url: "", profileLinkCount: 0, bodyTextSample: "" }));
}

/**
 * Did we really observe this surface, or did we just fail to read it?
 *
 * Rows came back — we observed it. Nothing came back — believe that only when
 * the page itself says the list is empty. Anything else is an unread page, and
 * an unread page is not evidence that nobody replied.
 */
async function trustEmpty(page, rows) {
  if (Array.isArray(rows) && rows.length) return true;
  const d = diagnoseEmptyResults(await pageEvidence(page));
  return d.benign;
}

/**
 * Save a screenshot + the rendered HTML of a page we could not read, so the
 * next person does not have to reproduce the failure to see it.
 * Best-effort: a failure to write a diagnostic must never mask the real problem.
 */
async function saveSnapshot(page, outDir, label) {
  if (!outDir) return null;
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    fs.mkdirSync(outDir, { recursive: true });
    const base = path.join(outDir, `diagnostic-${label}`);
    await page.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => {});
    const html = await page.content().catch(() => "");
    if (html) fs.writeFileSync(`${base}.html`, html.slice(0, 2_000_000));
    return `${base}.png`;
  } catch {
    return null;
  }
}

/**
 * Read-only extraction of the user's own existing connections (opt-in mode).
 * Tries LinkedIn's named connection-card classes first, then falls back to the
 * same structural walk the search collector uses — a connections list is also
 * just a list of links to profiles, so a class rename cannot empty it.
 */
async function collectConnections(page) {
  await page.waitForSelector("main a[href*='/in/']", { timeout: 12000 }).catch(() => {});
  const carded = await page.$$eval("li.mn-connection-card, div.mn-connection-card", (nodes) =>
    nodes.map((n) => {
      const nameEl = n.querySelector(".mn-connection-card__name");
      const titleEl = n.querySelector(".mn-connection-card__occupation");
      const linkEl = n.querySelector("a[href*='/in/']");
      return {
        name: nameEl?.textContent?.trim() || "",
        title: titleEl?.textContent?.trim() || "",
        url: linkEl?.href || "",
        location: "",
      };
    }).filter((r) => r.name && r.url),
  ).catch(() => []);
  const rows = carded.length ? carded : await page.evaluate(extractPeopleFromDom).catch(() => []);
  // Everyone on your own connections page is a first-degree connection. That is
  // an observation about the page we opened, not an inference about the person.
  return rows.map((r) => ({ ...r, degree: "1st" }));
}

/**
 * The activity-feed DOM walk, exported standalone so `npm run test:dom` can run
 * it against a saved page. It must close over nothing: Playwright ships its
 * source into the page.
 *
 * Like the search extractor, it deliberately keys on NOTHING LinkedIn can
 * rename. An activity feed cannot stop doing two things: linking each update to
 * its permalink (`/feed/update/` or `/posts/`), and showing the update's text
 * near that link. So each permalink anchors an item; the card is the ancestor
 * with real text; the summary is the card's longest text run that is not
 * chrome (name, timestamp, reaction counts, buttons); the date comes from a
 * <time> element or the "2d •"-style stamp in the card's first lines; and
 * "commented" in the card's header text marks a comment rather than a post.
 * Returns items newest-first as the page lists them.
 */
export function extractActivityFromDom() {
  {
    const root = document.querySelector("main") || document.body;
    if (!root) return [];
    const seen = new Set();
    const items = [];
    for (const a of root.querySelectorAll("a[href*='/feed/update/'], a[href*='/posts/'], a[href*='/pulse/']")) {
      const href = a.href || "";
      if (!href || seen.has(href)) continue;
      // Walk up to the card: the LARGEST ancestor that still contains only this
      // one update. The moment a parent holds a second update's permalink, we
      // have left the card and entered the feed — that boundary is structural
      // and survives any redesign, unlike text-length guesses (which stopped
      // short of the timestamp on the live page and cost every candidate
      // their recency points).
      let card = a;
      while (card.parentElement && card.parentElement !== root) {
        const next = card.parentElement;
        const links = new Set(
          [...next.querySelectorAll("a[href*='/feed/update/'], a[href*='/posts/'], a[href*='/pulse/']")]
            .map((x) => (x.href || "").split("?")[0]),
        );
        if (links.size > 1) break; // next level holds a second update
        card = next;
        if (card.tagName === "LI" || card.tagName === "ARTICLE") break;
      }
      const cardText = (card.innerText || "").trim();
      if (!cardText) continue;
      seen.add(href);

      const lines = cardText.split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      const isChrome = (s) =>
        /^(like|comment|repost|send|share|follow|connect|celebrate|love|insightful|funny|support|\+ follow|see more|…more|show more|report|copy link)/i.test(s) ||
        /^\d[\d,.]*\s*(likes?|comments?|reposts?|reactions?|impressions?)?$/i.test(s) ||
        /followers?$|connections?$/i.test(s) ||
        /^\d+(st|nd|rd|th)\+?(\s*degree)?(\s*connection)?\s*([•·|]|$)/i.test(s) ||
        (/^\d+\s*(m|h|d|w|mo|yr?)\b/i.test(s) && s.length < 12) ||
        // The actor header renders as ONE glued innerText line — name, badge,
        // headline, timestamp, audience — so any of its unmistakable fragments
        // disqualifies the whole line from being the post body.
        /visible to anyone|•\s*(1st|2nd|3rd)\b|\b\d+\s*(minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/i.test(s);
      const summary = lines
        .filter((s) => !isChrome(s))
        .sort((x, y) => y.length - x.length)[0] || "";

      const timeEl = card.querySelector("time");
      let dateText = timeEl?.getAttribute("datetime") || timeEl?.textContent?.trim() || "";
      if (!dateText) {
        // The stamp can sit anywhere in the card ("2d •", "1w • Edited", "3d ago"),
        // including glued into the actor line — scan the whole card text.
        const m = (card.innerText || "").match(/(?:^|\s|•|·)(\d+\s*(?:mo|m|h|d|w|yr?))(?=\s*(?:•|·|ago|Edited|\s|$))/i);
        if (m) dateText = m[1];
      }
      const header = lines.slice(0, 3).join(" ").toLowerCase();
      const type = /comment/.test(header) ? "comment"
        : /repost|shared this/.test(header) ? "repost" : "post";

      items.push({ summary: summary.slice(0, 400), dateText, url: href, type });
    }
    return items;
  }
}

/** Visit a profile + its recent activity, read-only, and capture evidence. */
async function inspectProfile(page, profileUrl, pacer) {
  const out = { headline: "", company: "", location: "", degree: "", activity: null, activityStatus: "none" };
  const resp = await page.goto(profileUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
  await guard(page, resp ? resp.status() : 0);
  await pacer.wait();

  const info = await page.evaluate(() => {
    const text = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
    // Known class names first, then structure. The structural anchor is the
    // top card's "Contact info" link — a profile cannot stop offering it, and
    // the lines directly above it are exactly headline (long), company
    // (short, optional) and location (has a comma), in that order, after
    // pronouns and degree badges are dropped. This survives profile videos,
    // which flood the top of <main> with media-player chrome.
    let headline = text("div.text-body-medium.break-words") || text(".pv-text-details__left-panel .text-body-medium");
    let location = text("span.text-body-small.inline.t-black--light.break-words");
    let company = "";
    let degree = "";
    {
      // The top card carries the same degree badge the search card does. This is
      // only ever a FALLBACK: mergeProfile refuses to let a blank overwrite a
      // value the search card already captured.
      const main = document.querySelector("main") || document.body;
      // Anchored per LINE, never across a 1500-character blob: "Owner · 3rd
      // generation aviator" is a headline, and reading "3rd" out of it would
      // write a fabricated relationship into column F.
      const lines = (main.innerText || "").split("\n").map((s) => s.replace(/\s+/g, " ").trim());
      for (const line of lines.slice(0, 40)) {
        const m = line.match(/^(?:[•·]\s*)?(1st|2nd|3rd)\+?(?:\s*degree)?(?:\s*connection)?\s*(?:[•·|]|$)/i)
          || line.match(/[•·]\s*(1st|2nd|3rd)\+?\s*(?:[•·|]|$)/i);
        if (m) { degree = m[1].toLowerCase(); break; }
      }
    }
    if (!headline || !location) {
      const main = document.querySelector("main") || document.body;
      const lines = (main.innerText || "").split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      const ci = lines.findIndex((s) => /^contact info$/i.test(s));
      if (ci > 0) {
        const win = lines.slice(Math.max(0, ci - 6), ci).filter((s) =>
          !/^[·•]/.test(s) &&
          !/^(she\/her|he\/him|they\/them)$/i.test(s) &&
          !/^\d+(st|nd|rd|th)\+?(\s*degree)?(\s*connection)?\s*([•·|]|$)/i.test(s) &&
          !/^(visit website|message|connect|follow|more|pending)$/i.test(s) &&
          !/\b(followers|connections|mutual)\b/i.test(s) &&
          s.length > 1);
        if (win.length) {
          if (!location) location = win[win.length - 1] || "";
          const above = win.slice(0, -1);
          if (!headline && above.length) {
            headline = above.reduce((a, b) => (b.length > a.length ? b : a), "");
            company = above.find((s) => s !== headline) || "";
          }
        }
      }
    }
    return { headline, location, company, degree };
  }).catch(() => ({}));
  out.headline = info.headline || "";
  out.location = info.location || out.location;
  out.company = info.company || out.company;
  out.degree = info.degree || out.degree;

  // Recent activity (posts + comments). Read-only; capture date/type/summary/url.
  const activityUrl = profileUrl.replace(/\/$/, "") + "/recent-activity/all/";
  const aresp = await page.goto(activityUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
  await guard(page, aresp ? aresp.status() : 0);
  await pacer.wait();
  const items = await page.evaluate(extractActivityFromDom).catch(() => []);
  const activity = (items || [])[0] || null;

  if (activity && (activity.summary || activity.url)) {
    out.activity = {
      summary: activity.summary || "",
      date: normalizeDate(activity.dateText),
      url: activity.url || "",
      type: activity.type === "comment" ? "comment" : "post",
    };
    out.activityStatus = "captured";
  } else {
    // Nothing extracted. Was there really nothing, or can we not read the page?
    // The difference matters: an unreadable page must never quietly cost this
    // person their recency points.
    const ev = await page.evaluate(() => {
      const root = document.querySelector("main") || document.body;
      return {
        updateLinks: root ? root.querySelectorAll("a[href*='/feed/update/'], a[href*='/posts/']").length : 0,
        bodyTextSample: (root && root.innerText ? root.innerText : "").slice(0, 2000),
      };
    }).catch(() => ({ updateLinks: 0, bodyTextSample: "" }));
    if (ev.updateLinks > 0) out.activityStatus = "unreadable";
    else if (/hasn.?t posted|no (recent )?activity|nothing to see/i.test(ev.bodyTextSample)) out.activityStatus = "none";
    else out.activityStatus = ev.bodyTextSample.trim() ? "none" : "unreadable";
  }
  return out;
}

/**
 * READ-ONLY follow-up pass.
 *
 * Opens three of your own LinkedIn pages — sent invitations, connections, and
 * the messaging list — and reports what it saw. It clicks nothing that sends,
 * withdraws, accepts or replies. Nothing here changes anything on LinkedIn.
 *
 * Returns the plain observation object planFollowUp() consumes:
 *   { connections, pendingInvites, threads,
 *     observedConnections, observedInvites, observedMessages, blocker }
 * Each observed* flag is false when that surface could not be read, so the
 * planner records "unknown" instead of guessing a negative.
 */
export async function runFollowUp({ config }) {
  const pacer = createPacer({
    minDelayMs: config.minDelayMs,
    maxDelayMs: config.maxDelayMs,
    dailyCap: config.dailyCap,
  });
  const context = await launch({
    profilePath: config.chromeProfile,
    liAt: config.liAt,
    channel: config.chromeChannel,
    headless: config.headless,
  });
  const page = context.pages()[0] || (await context.newPage());

  const out = {
    connections: [],
    pendingInvites: [],
    threads: [],
    observedConnections: false,
    observedInvites: false,
    observedMessages: false,
    blocker: null,
  };

  try {
    // 1) Invitations you SENT that are still outstanding -> "pending".
    const iresp = await page.goto(SENT_INVITES_URL, { waitUntil: "domcontentloaded" }).catch(() => null);
    await guard(page, iresp ? iresp.status() : 0);
    await pacer.wait();
    out.pendingInvites = await collectSentInvites(page);
    out.observedInvites = await trustEmpty(page, out.pendingInvites);

    // 2) People already in your network -> "connected".
    const cresp = await page.goto(CONNECTIONS_URL, { waitUntil: "domcontentloaded" }).catch(() => null);
    await guard(page, cresp ? cresp.status() : 0);
    await pacer.wait();
    out.connections = await collectConnections(page);
    out.observedConnections = await trustEmpty(page, out.connections);

    // 3) Message threads -> did they reply, and what did they say.
    const mresp = await page.goto(MESSAGING_URL, { waitUntil: "domcontentloaded" }).catch(() => null);
    await guard(page, mresp ? mresp.status() : 0);
    await pacer.wait();
    out.threads = await collectThreads(page);
    out.observedMessages = await trustEmpty(page, out.threads);
  } catch (err) {
    out.blocker = err instanceof BlockerError
      ? { kind: err.kind, reason: err.message }
      : { kind: "error", reason: err.message };
  } finally {
    await context.close().catch(() => {});
  }

  return out;
}

/** Read-only extraction of your outstanding SENT invitations. */
async function collectSentInvites(page) {
  const carded = await page.$$eval(
    "li.invitation-card, div.invitation-card, li[class*='invitation-card']",
    (nodes) =>
      nodes.map((n) => {
        const linkEl = n.querySelector("a[href*='/in/']");
        const nameEl = n.querySelector(
          ".invitation-card__title, .artdeco-entity-lockup__title, span[aria-hidden='true']",
        );
        return {
          name: nameEl?.textContent?.trim() || "",
          url: linkEl?.href || "",
        };
      }).filter((r) => r.name || r.url),
  ).catch(() => []);
  if (carded.length) return carded;
  return page.evaluate(extractPeopleFromDom).catch(() => []);
}

/**
 * Read-only extraction of the messaging conversation list.
 *
 * LinkedIn's list view shows the participant's name, a snippet of the most
 * recent message, and a timestamp. When the newest message is yours the snippet
 * is prefixed "You: " — so the absence of that prefix is how we tell that THEY
 * spoke last. Threads carry no profile URL here, which is why the planner also
 * matches on a normalized name key.
 */
async function collectThreads(page) {
  return page.$$eval(
    "li.msg-conversation-listitem, li[class*='msg-conversation-listitem'], div.msg-conversation-card",
    (nodes) =>
      nodes.map((n) => {
        const t = (sel) => n.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim() || "";
        const name = t(".msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names");
        const raw = t(".msg-conversation-card__message-snippet, .msg-conversation-listitem__message-snippet");
        const date = t("time, .msg-conversation-listitem__time-stamp, .msg-conversation-card__time-stamp");
        const linkEl = n.querySelector("a[href*='/in/']");
        const mine = /^you\s*:/i.test(raw);
        return {
          name,
          url: linkEl?.href || "",
          lastMessageFromThem: !!raw && !mine,
          lastMessageText: mine ? raw.replace(/^you\s*:\s*/i, "") : raw,
          lastMessageDate: date,
        };
      }).filter((r) => r.name),
  ).catch(() => []);
}

/**
 * Best-effort ISO date; returns "" if not confidently parseable (no fabrication).
 * Relative stamps ("2d", "1w") ARE confidently parseable — they are the only
 * dates LinkedIn's activity feed shows, and leaving them blank silently costs
 * every candidate their recency points.
 */
function normalizeDate(text) {
  return parseActivityDate(text, Date.now());
}
