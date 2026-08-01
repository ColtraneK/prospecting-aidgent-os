// worker.mjs — the local Playwright worker.
//
// It drives a DEDICATED PERSISTENT Chrome profile that YOU sign into manually.
// It NEVER automates login, MFA, or CAPTCHA, NEVER bypasses access controls, and
// NEVER performs any outward action (no Connect, Message, Follow, Like, React,
// Celebrate, Comment, Share, Repost, Post). Navigation and extraction are
// read-only. On any blocker page it stops safely and exits nonzero.
//
// v6 shape: there is no search parser here. The agent crafts search URLs and
// reads the pages `openPage` saves; the worker's own extraction runs only on
// the surfaces it opens to VERIFY a nomination — the profile and its activity
// page — via the structural extractor `extractUpdatesFromDom`.
//
// playwright is imported lazily so the pure logic modules and tests do not
// require it to be installed.

import { detectBlocker, diagnoseActivity } from "./blockers.mjs";
import { preflightSession, PROFILE_MISSING, PROFILE_NEVER_SIGNED_IN } from "./session.mjs";
import { parseActivityDate } from "./recency.mjs";
import { createPacer } from "./pacing.mjs";
import { disqualify } from "./disqualify.mjs";

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
  // an error here — it is a brand-new signed-out Chrome. Refuse instead of
  // manufacturing a profile. setup-login is the one caller that legitimately
  // makes a profile that does not exist yet (allowNewProfile). With an li_at
  // cookie a junk profile path is dropped rather than persisted to disk.
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
 * instead of letting the first run be the discovery mechanism.
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

// --- v6: the two commands a run touches LinkedIn with -----------------------

/**
 * May `npm run open` navigate to this URL at all?
 *
 * The agent crafts its own search URLs now, so the allowlist is the guard rail:
 * linkedin.com only, https only, and never a surface whose purpose is an
 * outward action. Opening a messaging or connect URL cannot "just look" — the
 * page exists to send — and a checkpoint/login URL is a wall the person clears
 * by hand, never a page this tool walks into on purpose.
 *
 * Pure, so the refusal is testable without a browser.
 */
export function checkOpenUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return { ok: false, reason: "no URL given" };
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: `not a valid URL: ${s}` };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "only https:// URLs are opened" };
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) {
    return { ok: false, reason: `only linkedin.com is opened — refusing ${u.hostname}` };
  }
  const path = u.pathname.toLowerCase();
  const BLOCKED = [
    [/^\/messaging\b|\/compose\b/, "a messaging/compose page exists to send, and this tool never sends"],
    [/^\/checkpoint\b|^\/uas\b|^\/login\b|^\/signup\b/, "login and checkpoint pages are cleared by the person, never automated"],
    [/invitation|invite/, "invitation pages exist to connect, and this tool never connects"],
  ];
  for (const [re, why] of BLOCKED) {
    if (re.test(path)) return { ok: false, reason: `refusing ${u.pathname}: ${why}` };
  }
  if (/[?&]action=(connect|message|follow)/i.test(u.search)) {
    return { ok: false, reason: "refusing an action URL (connect/message/follow) — nothing outward, ever" };
  }
  return { ok: true, reason: "" };
}

/**
 * `npm run open` — open ONE allowed LinkedIn URL with the signed-in session,
 * read-only, and save its rendered HTML + a screenshot to run-artifacts so the
 * agent can read what was on it. This is how the agent explores: it crafts a
 * search URL, opens it here, reads the artifact, and decides what to open next.
 * Nothing is extracted, judged, or written to the sheet by this path.
 *
 * On a blocker the page copy is still saved — the artifact is the evidence of
 * what blocked — and the verdict comes back named.
 */
export async function openPage({ config, url, label = "page", budget = null }) {
  const v = checkOpenUrl(url);
  if (!v.ok) return { ok: false, kind: "refused_url", reason: v.reason };
  if (budget) {
    const t = budget.takeOpen();
    if (!t.ok) return { ok: false, kind: "budget_exhausted", reason: "the daily page-open budget is spent", budget: t };
  }
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
    try {
      await guard(page, resp ? resp.status() : 0);
    } catch (err) {
      if (err instanceof BlockerError) {
        const shot = await saveSnapshot(page, config.outDir, `blocked-${err.kind}`);
        return { ok: false, kind: err.kind, reason: err.message, snapshot: shot };
      }
      throw err;
    }
    const shot = await saveSnapshot(page, config.outDir, `open-${label}`);
    return { ok: true, snapshot: shot };
  } catch (err) {
    return { ok: false, kind: "error", reason: err.message };
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * `npm run inspect` — verify-by-reopening, v6's anti-fabrication core.
 *
 * The agent nominated people; this opens EVERY nominated profile and its
 * recent-activity page itself, with the signed-in session, and captures the
 * evidence first-hand: headline, company, location, degree badge, the newest
 * post verbatim with date and permalink, and a named verdict when the activity
 * page could not be read. Agent-reported facts are never recorded as evidence.
 *
 * Hard disqualifiers (disqualify.mjs) are applied to what was captured — the
 * result rides along in the evidence so the agent can see who was ruled out
 * and why. Nothing is written to the sheet here.
 *
 * Budgets: one inspection + two page opens per nomination, persisted across
 * invocations. An exhausted budget stops the run loudly with the reset time.
 */
export async function runInspect({ nominations = [], persona = {}, config, budget }) {
  const pacer = createPacer({
    minDelayMs: config.minDelayMs,
    maxDelayMs: config.maxDelayMs,
    dailyCap: Number.MAX_SAFE_INTEGER, // budgets, not the pacer, are the v6 cap
  });
  const context = await launch({
    profilePath: config.chromeProfile,
    liAt: config.liAt,
    channel: config.chromeChannel,
    headless: config.headless,
  });
  const page = context.pages()[0] || (await context.newPage());
  const evidence = [];
  let blocker = null;
  let inspected = 0;

  try {
    for (const row of nominations) {
      const ti = budget.takeInspection();
      if (!ti.ok) {
        blocker = { kind: "budget_exhausted", reason: `daily inspection budget spent (${ti.limit}/day); resets at ${ti.resetAt}`, budget: ti };
        break;
      }
      const to = budget.takeOpen(2); // profile page + activity page
      if (!to.ok) {
        blocker = { kind: "budget_exhausted", reason: `daily page-open budget spent (${to.limit}/day); resets at ${to.resetAt}`, budget: to };
        break;
      }
      let profile = null;
      try {
        profile = await inspectProfile(page, row.url, pacer);
        inspected++;
      } catch (err) {
        if (err instanceof BlockerError) {
          await saveSnapshot(page, config.outDir, `blocked-${err.kind}`);
          throw err;
        }
        // One dead profile is not a dead run: record it and keep going.
        evidence.push(evidenceEntry(row, null, persona, { unreachable: true, unreachableReason: err.message }));
        continue;
      }
      evidence.push(evidenceEntry(row, profile, persona));
    }
  } catch (err) {
    blocker = err instanceof BlockerError
      ? { kind: err.kind, reason: err.message }
      : { kind: "error", reason: err.message };
  } finally {
    await context.close().catch(() => {});
  }

  return { evidence, blocker, inspected };
}

/**
 * One candidate's captured facts, shaped for evidence.json. Everything in it
 * except why_nominated/source_url was observed by THIS browser; the agent's
 * two fields are carried as provenance, never as facts.
 */
export function evidenceEntry(row, profile, persona, { unreachable = false, unreachableReason = "" } = {}) {
  const merged = mergeProfile({ name: row.name || "", url: row.url }, profile || {});
  const facts = {
    name: merged.name,
    url: row.url,
    headline: merged.headline || "",
    title: merged.title || merged.headline || "",
    company: merged.company || "",
    location: merged.location || "",
    degree: merged.degree || "",
    unreachable,
    unreachableReason,
  };
  const dq = disqualify(persona, facts);
  const p = profile || {};
  return {
    key: row.url,
    name: facts.name,
    url: row.url,
    why_nominated: row.whyNominated || "",
    source_url: row.sourceUrl || "",
    headline: facts.headline,
    title: facts.title,
    company: facts.company,
    location: facts.location,
    degree: facts.degree,
    post: p.activity
      ? { summary: p.activity.summary || "", date: p.activity.date || "", url: p.activity.url || "", type: p.activity.type || "post" }
      : null,
    activity_status: unreachable ? "unreachable" : (p.activityStatus || "none"),
    activity_verdict: p.activityVerdict || null,
    disqualified: dq.disqualified ? { reason: dq.reason } : null,
  };
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
 * Open a headed window so the PERSON signs into LinkedIn themselves, then wait
 * until their feed actually loads, then shut the browser down cleanly.
 *
 * WHY IT WORKS THIS WAY. The previous version parked on `new Promise(() => {})`
 * and told the person to press Ctrl+C. Ctrl+C kills the Node process, so the
 * `context.close()` underneath that line was unreachable and Chrome was killed
 * rather than closed. Chrome writes its cookie store on a clean shutdown, so a
 * sign-in that the person completed perfectly could still fail to reach disk.
 * So: detect success ourselves, close the context properly to flush cookies,
 * and hand back a verdict the caller can record.
 *
 * @returns {{ok:boolean, reason:string}}
 */
export async function setupLogin({
  profilePath, channel = "chrome", waitMs = 0,
  timeoutMs = 10 * 60 * 1000, pollMs = 2500,
}) {
  const context = await launch({ profilePath, channel, headless: false, allowNewProfile: true });

  let closed = false;
  const closeOnce = async () => {
    if (closed) return;
    closed = true;
    // The whole point: a graceful close is what flushes the cookie store.
    await context.close().catch(() => {});
  };
  const onSignal = () => { closeOnce().finally(() => process.exit(130)); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" }).catch(() => {});
    console.log("A Chrome window is open. Sign in to LinkedIn manually, including any 2-factor step.");
    console.log("This tool never types your password and never handles your 2FA.");
    console.log("Leave the window open once your feed loads — this waits for it and closes the window itself.");

    const deadline = Date.now() + (waitMs > 0 ? waitMs : timeoutMs);
    while (Date.now() < deadline) {
      // A closed window is the person telling us they are done. Stop rather
      // than polling a dead context.
      if (!context.pages().length) {
        return { ok: false, reason: "the window was closed before a signed-in feed was seen." };
      }
      const live = context.pages()[0];
      const signedIn = await live.evaluate(() =>
        /linkedin\.com/.test(location.host) &&
        !/\/(login|uas\/login|checkpoint)/.test(location.pathname) &&
        !!document.querySelector("a[href*='/in/'], a[href*='/mynetwork'], a[href*='/messaging']"),
      ).catch(() => false);
      if (signedIn) {
        // Give Chrome a moment to settle the session cookie before we close.
        await live.waitForTimeout(1500).catch(() => {});
        await closeOnce();
        return { ok: true, reason: "signed-in feed loaded and the profile was closed cleanly." };
      }
      await live.waitForTimeout(pollMs).catch(() => {});
    }
    return { ok: false, reason: "timed out before a signed-in feed appeared." };
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await closeOnce();
  }
}

/**
 * Fold first-hand profile observations into a nomination row WITHOUT letting
 * an empty field erase a captured one. A blank never overwrites a fact.
 */
export function mergeProfile(base, profile) {
  const merged = { ...base };
  for (const [k, v] of Object.entries(profile || {})) {
    if (v !== "" && v !== null && v !== undefined) merged[k] = v;
  }
  // A base row sometimes carries no title line; the profile headline is the
  // same fact observed first-hand, so it may stand in. Never the reverse.
  if (!merged.title && merged.headline) merged.title = merged.headline;
  // Degree is the one field where the BASE is the better witness when it has
  // one: a card badge sits in a known place, while the profile top card is a
  // wall of text a headline can imitate. A captured base degree wins.
  if (base && base.degree) merged.degree = base.degree;
  // Activity captured with the base (e.g. the post that led to the nomination
  // being verified) survives a profile visit that saw something newer only if
  // the base capture was first-hand. Both sides here are this browser's own.
  if (base && base.activity && base.activityStatus === "captured") {
    merged.activity = base.activity;
    merged.activityStatus = "captured";
  }
  return merged;
}

/**
 * Save a screenshot + the rendered HTML of a page, so the agent (or the next
 * person) can read exactly what the browser saw.
 * Best-effort: a failure to write a diagnostic must never mask the real problem.
 */
async function saveSnapshot(page, outDir, label) {
  if (!outDir) return null;
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    fs.mkdirSync(outDir, { recursive: true });
    const base = path.join(outDir, `${label}`);
    await page.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => {});
    const html = await page.content().catch(() => "");
    if (html) fs.writeFileSync(`${base}.html`, html.slice(0, 2_000_000));
    return `${base}.png`;
  } catch {
    return null;
  }
}

/**
 * The update-card DOM walk. ONE function, used for the surfaces that carry
 * update cards — a profile's recent-activity page, and (when the agent saved
 * one with `open`) a content-search page — because they are the same shape: a
 * list of update cards, each with a body, a stamp, a permalink, and (on
 * content search) an author. Exported standalone so `npm run test:dom` can run
 * it against saved pages. It must close over nothing: Playwright ships its
 * source into the page, so everything it needs is defined inside it.
 *
 * `opts.withAuthor` asks for the card's author link as well. On an activity
 * page every card has the same author and it is not needed; on a content
 * search it is the whole point, because the author IS the candidate.
 *
 * It deliberately keys on NOTHING LinkedIn can rename:
 *
 * - Each permalink (`/feed/update/`, `/posts/`, `/pulse/`) anchors one item, and
 *   the card is the largest ancestor still holding only that one permalink.
 * - The BODY is the card minus its actor header. The header is whatever element
 *   wraps the author link, and its lines are removed by value before the longest
 *   remaining line is taken. Without that step a long headline in the header
 *   competes with a short post and sometimes wins (the wrong-node bug).
 * - A line made of the card's own linked NAMES is a tag strip, not prose. Three
 *   or more of the card's linked names covering most of the line is the
 *   structural signature of that strip; two names inside a real sentence is not.
 * - The date comes from a <time> element or the "2d •"-style stamp anywhere in
 *   the card; "commented" in the header marks a comment rather than a post.
 *
 * Returns items newest-first as the page lists them.
 */
export function extractUpdatesFromDom(opts) {
  {
    const withAuthor = !!(opts && opts.withAuthor);
    const root = document.querySelector("main") || document.body;
    if (!root) return [];
    const UPDATE_SEL = "a[href*='/feed/update/'], a[href*='/posts/'], a[href*='/pulse/']";

    const isChrome = (s) =>
      /^(like|comment|repost|send|share|follow|connect|celebrate|love|insightful|funny|support|\+ follow|see more|…more|show more|report|copy link|open post|view comment)/i.test(s) ||
      /^\d[\d,.]*\s*(likes?|comments?|reposts?|reactions?|impressions?)?$/i.test(s) ||
      /followers?$|connections?$/i.test(s) ||
      /^\d+(st|nd|rd|th)\+?(\s*degree)?(\s*connection)?\s*([•·|]|$)/i.test(s) ||
      (/^\d+\s*(m|h|d|w|mo|yr?)\b/i.test(s) && s.length < 12) ||
      // The actor header renders as ONE glued innerText line — name, badge,
      // headline, timestamp, audience — so any of its unmistakable fragments
      // disqualifies the whole line from being the post body.
      /visible to anyone|•\s*(1st|2nd|3rd)\b|\b\d+\s*(minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/i.test(s);

    const linesOf = (node) =>
      ((node && node.innerText) || "").split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

    const readCard = (card, href) => {
      const lines = linesOf(card);
      if (!lines.length) return null;

      // The author link, and the element that wraps it: the actor header.
      //
      // NOT simply the first /in/ link in the card. A feed or content-search
      // card often opens with a social-context row — "Priya reposted this",
      // "Sam and 2 others liked this" — whose profile link comes first in DOM
      // order. Taking that one attributes the post to somebody who merely
      // touched it, which is a fabricated fact about two people at once. So skip
      // any link sitting inside a line of social context.
      const socialContext = /\b(reposted|shared this|likes? this|liked this|commented on this|follows? this|and \d+ others?)\b/i;
      let authorLink = null;
      for (const cand of card.querySelectorAll("a[href*='/in/']")) {
        const wrapper = cand.closest("div, section, header, article, li") || cand;
        if (socialContext.test((wrapper.innerText || ""))) continue;
        authorLink = cand;
        break;
      }
      const headerNode = authorLink
        ? (authorLink.closest("div, section, header, article") || null)
        : null;

      // Everyone this card links to. A line built out of those names is a tag
      // strip, never the post body.
      const names = [];
      for (const x of card.querySelectorAll("a[href*='/in/']")) {
        const n = ((x.innerText || "")).replace(/\s+/g, " ").trim();
        if (n && n.length <= 60 && names.indexOf(n) === -1) names.push(n);
      }
      const isNameStrip = (s) => {
        if (names.length < 3) return false;
        let hits = 0;
        let covered = 0;
        for (const n of names) {
          if (s.indexOf(n) !== -1) { hits++; covered += n.length; }
        }
        return hits >= 3 && covered >= s.length * 0.6;
      };

      // Anchor on the body: the card's lines minus the actor header's lines.
      let bodyLines = lines;
      if (headerNode && headerNode !== card) {
        const headerLines = linesOf(headerNode);
        bodyLines = lines.filter((s) => headerLines.indexOf(s) === -1);
      }
      const summary = bodyLines
        .filter((s) => !isChrome(s) && !isNameStrip(s))
        .sort((x, y) => y.length - x.length)[0] || "";

      const timeEl = card.querySelector("time");
      let dateText = (timeEl && (timeEl.getAttribute("datetime") || (timeEl.textContent || "").trim())) || "";
      if (!dateText) {
        // The stamp can sit anywhere in the card ("2d •", "1w • Edited", "3d ago"),
        // including glued into the actor line — scan the whole card text.
        const m = (card.innerText || "").match(/(?:^|\s|•|·)(\d+\s*(?:mo|m|h|d|w|yr?))(?=\s*(?:•|·|ago|Edited|\s|$))/i);
        if (m) dateText = m[1];
      }
      const header = lines.slice(0, 3).join(" ").toLowerCase();
      const type = /comment/.test(header) ? "comment"
        : /repost|shared this/.test(header) ? "repost" : "post";

      const item = { summary: summary.slice(0, 400), dateText, url: href || "", type };
      if (withAuthor) {
        const ahref = (authorLink && authorLink.href) || "";
        if (!ahref) return null; // a post with no visible author is not a candidate
        // The visible name sits in an aria-hidden span; the anchor's own text
        // repeats it and appends the screen-reader label.
        const hidden = authorLink.querySelector("span[aria-hidden='true']");
        let name = (((hidden && hidden.textContent) || authorLink.textContent || "")).replace(/\s+/g, " ").trim();
        name = name.split(/\bView\b|['’]s profile/)[0].trim();
        if (!name || name.length > 120) return null;
        item.author = { name, url: ahref };
      }
      return item;
    };

    const seen = new Set();
    const items = [];
    for (const a of root.querySelectorAll(UPDATE_SEL)) {
      const href = a.href || "";
      if (!href || seen.has(href)) continue;
      // Walk up to the card: the LARGEST ancestor that still contains only this
      // one update. The moment a parent holds a second update's permalink, we
      // have left the card and entered the feed — that boundary is structural
      // and survives any redesign, unlike text-length guesses (which stopped
      // short of the timestamp on the live page and cost every candidate
      // their recency).
      let card = a;
      while (card.parentElement && card.parentElement !== root) {
        const next = card.parentElement;
        const links = new Set(
          [...next.querySelectorAll(UPDATE_SEL)].map((x) => (x.href || "").split("?")[0]),
        );
        if (links.size > 1) break; // next level holds a second update
        card = next;
        if (card.tagName === "LI" || card.tagName === "ARTICLE") break;
      }
      if (!(card.innerText || "").trim()) continue;
      seen.add(href);
      const item = readCard(card, href);
      if (item) items.push(item);
    }

    // A card whose permalink anchor is gone is still an update. LinkedIn has
    // moved the permalink behind an overflow menu before, and when it does the
    // loop above returns nothing at all — which reads as "they never posted"
    // and is how three of ten rows once came back with an empty column D. So
    // fall back to the other thing an update card cannot stop doing: carrying
    // a timestamp. No permalink means no column E, and that is the honest
    // outcome — an unlinkable post is still a post we read.
    if (!items.length) {
      for (const card of root.querySelectorAll("li, article")) {
        if (card.querySelector("li, article")) continue; // outer list, not a card
        const hasStamp = !!card.querySelector("time") ||
          /(?:^|\s|•|·)\d+\s*(?:mo|m|h|d|w|yr?)(?=\s*(?:•|·|ago|Edited|\s|$))/i.test(card.innerText || "");
        if (!hasStamp) continue;
        const item = readCard(card, "");
        // A real post has prose in it. Requiring a body of some substance keeps
        // a stray timestamped list item from being reported as somebody's post.
        if (item && item.summary.length >= 40) items.push(item);
      }
    }
    return items;
  }
}

// Two names for one walk, because two surfaces need it and the difference
// between them is one option, not one implementation. Aliases (not wrappers): a
// wrapper would close over this function, and Playwright ships a page
// function's own source into the browser, where nothing it closed over exists.
export { extractUpdatesFromDom as extractActivityFromDom };
export { extractUpdatesFromDom as extractPostsFromDom };

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
      // The top card carries the same degree badge the search card does.
      // Anchored per LINE, never across a 1500-character blob: "Owner · 3rd
      // generation aviator" is a headline, and reading "3rd" out of it would
      // write a fabricated relationship into column F.
      const main = document.querySelector("main") || document.body;
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
  const items = await page.evaluate(extractUpdatesFromDom, { withAuthor: false }).catch(() => []);
  const activity = (items || [])[0] || null;

  if (activity && (activity.summary || activity.url)) {
    out.activity = {
      summary: activity.summary || "",
      date: normalizeDate(activity.dateText),
      url: activity.url || "",
      // "repost" is carried through rather than flattened into "post". Column S
      // then says whose words those are, and a drafted message says "your
      // repost on …" instead of crediting someone else's writing to them.
      type: activity.type === "comment" ? "comment" : activity.type === "repost" ? "repost" : "post",
    };
    out.activityStatus = "captured";
    out.activityVerdict = null;
  } else {
    // Nothing extracted. Was there really nothing, or can we not read the page?
    // The difference matters: an unreadable page must never be reported as
    // "they do not post", which is a claim about them rather than our parser.
    const ev = await page.evaluate(() => {
      const root = document.querySelector("main") || document.body;
      return {
        updateLinks: root ? root.querySelectorAll("a[href*='/feed/update/'], a[href*='/posts/'], a[href*='/pulse/']").length : 0,
        bodyTextSample: (root && root.innerText ? root.innerText : "").slice(0, 2000),
      };
    }).catch(() => ({ updateLinks: 0, bodyTextSample: "" }));
    const d = diagnoseActivity({ ...ev, itemCount: 0 });
    out.activityVerdict = { kind: d.kind, reason: d.reason, benign: d.benign };
    out.activityStatus = d.benign ? "none" : "unreadable";
  }
  return out;
}

/**
 * Best-effort ISO date; returns "" if not confidently parseable (no fabrication).
 * Relative stamps ("2d", "1w") ARE confidently parseable — they are the only
 * dates LinkedIn's activity feed shows, and leaving them blank silently hides
 * every candidate's recency.
 */
function normalizeDate(text) {
  return parseActivityDate(text, Date.now());
}
