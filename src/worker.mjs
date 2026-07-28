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

import { detectBlocker } from "./blockers.mjs";
import { createPacer } from "./pacing.mjs";
import { canonicalizeLinkedInUrl } from "./url.mjs";
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

/** Launch a persistent context bound to the dedicated profile. */
async function launch({ profilePath, channel = "chrome", headless = true }) {
  if (!profilePath) throw new Error("AIDGENT_CHROME_PROFILE (browser profile path) is required");
  const { chromium } = await import("playwright");
  const context = await chromium.launchPersistentContext(profilePath, {
    headless,
    channel, // use the installed Chrome channel where possible
    viewport: { width: 1280, height: 900 },
    // Never load automation-evasion tricks; we do not bypass bot detection.
  });
  return context;
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
  const context = await launch({ profilePath, channel, headless: false });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" }).catch(() => {});
  console.log("A Chrome window is open. Sign in to LinkedIn manually (including any MFA).");
  console.log("When your feed loads, come back here and press Ctrl+C, or close the window.");
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  else await new Promise(() => {}); // wait indefinitely for manual login; user ends it
  await context.close();
}

/**
 * HEADLESS research run. Returns { candidates, blocker, inspected }.
 * candidates carry only VERIFIED, captured fields. Scoring/qualification and
 * Why-Them/opener composition happen in the pipeline (cli.mjs), not here.
 */
export async function runResearch({ persona, config }) {
  const pacer = createPacer({
    minDelayMs: config.minDelayMs,
    maxDelayMs: config.maxDelayMs,
    dailyCap: config.dailyCap,
  });
  const sources = buildSources(persona, config);
  const context = await launch({ profilePath: config.chromeProfile, channel: config.chromeChannel, headless: config.headless });
  const page = context.pages()[0] || (await context.newPage());
  const candidates = [];
  const seen = new Set();
  let blocker = null;

  try {
    for (const source of sources) {
      if (candidates.length >= config.target || pacer.capReached) break;
      const resp = await page.goto(source.url, { waitUntil: "domcontentloaded" }).catch(() => null);
      await guard(page, resp ? resp.status() : 0);
      await pacer.wait();

      const results = source.kind === "connections"
        ? await collectConnections(page)
        : await collectSearchResults(page);
      let fromThisSource = 0;
      for (const r of results) {
        if (candidates.length >= config.target) break;
        if (source.limit && fromThisSource >= source.limit) break;
        const canon = canonicalizeLinkedInUrl(r.url);
        if (!canon || seen.has(canon)) continue;
        seen.add(canon);
        if (!pacer.tick()) break; // daily cap
        const profile = await inspectProfile(page, canon, pacer);
        candidates.push({ ...r, ...profile, url: canon, fromConnection: source.kind === "connections" });
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

  return { candidates, blocker, inspected: pacer.inspected };
}

/** Read-only extraction of people-search result cards. */
async function collectSearchResults(page) {
  // Selectors drift; keep this resilient and read-only. Codex may adapt them.
  return page.$$eval("li.reusable-search__result-container, div.entity-result", (nodes) =>
    nodes.map((n) => {
      const nameEl = n.querySelector("span[aria-hidden='true']");
      const linkEl = n.querySelector("a[href*='/in/']");
      const titleEl = n.querySelector(".entity-result__primary-subtitle, .entity-result__summary");
      const locEl = n.querySelector(".entity-result__secondary-subtitle");
      return {
        name: nameEl?.textContent?.trim() || "",
        url: linkEl?.href || "",
        title: titleEl?.textContent?.trim() || "",
        location: locEl?.textContent?.trim() || "",
      };
    }).filter((r) => r.name && r.url),
  ).catch(() => []);
}

/** Read-only extraction of the user's own existing connections (opt-in mode). */
async function collectConnections(page) {
  return page.$$eval("li.mn-connection-card, div.mn-connection-card", (nodes) =>
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
}

/** Visit a profile + its recent activity, read-only, and capture evidence. */
async function inspectProfile(page, profileUrl, pacer) {
  const out = { headline: "", company: "", location: "", activity: null };
  const resp = await page.goto(profileUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
  await guard(page, resp ? resp.status() : 0);
  await pacer.wait();

  const info = await page.evaluate(() => {
    const text = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
    return {
      headline: text("div.text-body-medium.break-words") || text(".pv-text-details__left-panel .text-body-medium"),
      location: text("span.text-body-small.inline.t-black--light.break-words"),
    };
  }).catch(() => ({}));
  out.headline = info.headline || "";
  out.location = info.location || out.location;

  // Recent activity (posts + comments). Read-only; capture date/type/summary/url.
  const activityUrl = profileUrl.replace(/\/$/, "") + "/recent-activity/all/";
  const aresp = await page.goto(activityUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
  await guard(page, aresp ? aresp.status() : 0);
  await pacer.wait();
  const activity = await page.evaluate(() => {
    const item = document.querySelector("li.profile-creator-shared-feed-update__container, div.feed-shared-update-v2");
    if (!item) return null;
    const summary = item.querySelector(".update-components-text, .feed-shared-text")?.textContent?.trim() || "";
    const timeEl = item.querySelector("time, .update-components-actor__sub-description");
    const linkEl = item.querySelector("a[href*='/feed/update/'], a[href*='/posts/']");
    return {
      summary: summary.slice(0, 400),
      dateText: timeEl?.getAttribute("datetime") || timeEl?.textContent?.trim() || "",
      url: linkEl?.href || "",
      type: item.querySelector(".update-components-header")?.textContent?.toLowerCase().includes("comment") ? "comment" : "post",
    };
  }).catch(() => null);

  if (activity && (activity.summary || activity.url)) {
    out.activity = {
      summary: activity.summary || "",
      date: normalizeDate(activity.dateText),
      url: activity.url || "",
      type: activity.type || "post",
    };
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
    out.observedInvites = true;

    // 2) People already in your network -> "connected".
    const cresp = await page.goto(CONNECTIONS_URL, { waitUntil: "domcontentloaded" }).catch(() => null);
    await guard(page, cresp ? cresp.status() : 0);
    await pacer.wait();
    out.connections = await collectConnections(page);
    out.observedConnections = true;

    // 3) Message threads -> did they reply, and what did they say.
    const mresp = await page.goto(MESSAGING_URL, { waitUntil: "domcontentloaded" }).catch(() => null);
    await guard(page, mresp ? mresp.status() : 0);
    await pacer.wait();
    out.threads = await collectThreads(page);
    out.observedMessages = true;
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
  return page.$$eval(
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

/** Best-effort ISO date; returns "" if not confidently parseable (no fabrication). */
function normalizeDate(text) {
  if (!text) return "";
  const iso = Date.parse(text);
  if (!isNaN(iso)) return new Date(iso).toISOString().slice(0, 10);
  return ""; // relative strings like "2d" are left blank rather than guessed here
}
