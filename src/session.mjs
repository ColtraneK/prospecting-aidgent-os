// session.mjs — is there a LinkedIn session, and was it ever PROVED to work?
//
// Two facts, kept separate on purpose:
//  - preflightSession answers "can this run possibly have a session" from
//    local facts, before a browser opens, with a named verdict — because a
//    misconfigured machine used to surface as `login: login page detected`,
//    which blames LinkedIn for a line nobody filled in.
//  - sessionProofState answers "did a real command actually load the feed with
//    THIS session" by reading the record check-login/setup-login wrote. Chrome
//    creates a cookie FILE the instant it launches, so files on disk are not
//    proof of anything. Forging the proof file is forbidden: it records
//    something that happened.

import fsDefault from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";
import { recordProof, readProof } from "./verified.mjs";

/** The literal value shipped in .env.example. Rejected by value, not just by existence. */
export const PLACEHOLDER_PROFILE_PATH = "/absolute/path/outside/repo/aidgent-chrome-profile";

// Anything shaped like an instruction rather than a path. Every pattern is
// anchored to whole path SEGMENTS: a false positive here bricks a working
// setup with no override flag, so /srv/path/to/profile and "your-profile-
// backup" must stay real folders.
const PLACEHOLDER_PATTERNS = [
  /(^|[\\/])absolute[\\/]path[\\/]outside[\\/]repo([\\/]|$)/i,
  /^(?:[a-z]:)?[\\/.]{0,2}path[\\/]to([\\/]|$)/i,
  /(^|[\\/])<[^\\/<>]*>([\\/]|$)/,
  /(^|[\\/])(change|fill)[-_]me([\\/]|$)/i,
  /(^|[\\/])(changeme|fillme)([\\/]|$)/i,
  /(^|[\\/])your[-_](chrome[-_])?profile([\\/]|$)/i,
  /(^|[\\/])(path|folder|dir)[-_](to|here)([\\/]|$)/i,
  /(^|[\\/])(you|your[-_]?username|username)([\\/]|$)/i,
];

/** Is this the example placeholder rather than a real folder someone chose? */
export function isPlaceholderProfilePath(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (v === PLACEHOLDER_PROFILE_PATH) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(v));
}

// Chrome writes its cookie store to one of these two places depending on
// version. A profile directory with neither has never been signed into.
const COOKIE_PATHS = [["Default", "Cookies"], ["Default", "Network", "Cookies"]];

/**
 * What do we know about a profile directory without opening it?
 * @returns {{path:string,set:boolean,placeholder:boolean,exists:boolean,signedIn:boolean}}
 */
export function profileState(profilePath, { fs = fsDefault } = {}) {
  const p = String(profilePath || "").trim();
  if (!p) return { path: "", set: false, placeholder: false, exists: false, signedIn: false };
  const placeholder = isPlaceholderProfilePath(p);
  // Never touch the filesystem for a placeholder: on Windows it resolves, and
  // asking whether it exists invites someone to "fix" it by creating it.
  const exists = placeholder ? false : !!safe(() => fs.existsSync(p));
  const signedIn = exists && COOKIE_PATHS.some((rel) => !!safe(() => fs.existsSync(path.join(p, ...rel))));
  return { path: p, set: true, placeholder, exists, signedIn };
}

const safe = (fn) => { try { return fn(); } catch { return false; } };

// --- the preflight ----------------------------------------------------------

export const SESSION_OK = "session_ok";
export const NO_SESSION_CONFIGURED = "no_session_configured";
export const PLACEHOLDER_PROFILE = "placeholder_profile";
export const PROFILE_MISSING = "profile_missing";
export const PROFILE_NEVER_SIGNED_IN = "profile_never_signed_in";

/**
 * Decide, without opening a browser, whether this run can possibly have a
 * LinkedIn session. Called by every command that would otherwise navigate.
 * A `false` here is a refusal, not a warning.
 *
 * @returns {{ok:boolean, kind:string, reason:string, fix:string}}
 */
export function preflightSession({ chromeProfile = "", liAt = "" } = {}, deps = {}) {
  if (String(liAt || "").trim()) {
    return { ok: true, kind: SESSION_OK, reason: "an li_at cookie is set, so no profile is needed.", fix: "" };
  }
  const st = profileState(chromeProfile, deps);
  if (!st.set) {
    return {
      ok: false,
      kind: NO_SESSION_CONFIGURED,
      reason: "no LinkedIn session is configured — neither a Chrome profile nor an li_at cookie.",
      fix: [
        "Two ways, either is enough:",
        "  Simplest — paste your LinkedIn li_at cookie into AIDGENT_LI_AT in .env (.env.example says where to copy it from). Runs stay headless and no login window ever opens.",
        "  Or — set AIDGENT_CHROME_PROFILE in .env to a folder OUTSIDE this repo, then run `npm run setup-login` and sign in once.",
      ].join("\n"),
    };
  }
  if (st.placeholder) {
    return {
      ok: false,
      kind: PLACEHOLDER_PROFILE,
      reason: `AIDGENT_CHROME_PROFILE reads as a fill-this-in placeholder rather than a real folder ("${st.path}"). The line in .env.example looks like this and is the usual source of it.`,
      fix: [
        "Open .env and replace that line with the folder you want the signed-in Chrome profile to live in — anywhere outside this repo.",
        "Then run `npm run setup-login`, sign in yourself, and re-run this command.",
        "Refusing here on purpose: a profile folder that does not exist gets CREATED empty on launch, which would open a signed-out Chrome and report a LinkedIn login wall instead of this message.",
      ].join("\n"),
    };
  }
  if (!st.exists) {
    return {
      ok: false,
      kind: PROFILE_MISSING,
      reason: `AIDGENT_CHROME_PROFILE points at "${st.path}", which is not on this machine.`,
      fix: "Fix the path in .env, then run `npm run setup-login` and sign in once. Launching anyway would create that folder empty and land on the login wall.",
    };
  }
  if (!st.signedIn) {
    return {
      ok: false,
      kind: PROFILE_NEVER_SIGNED_IN,
      reason: `the profile at "${st.path}" exists but has no cookie store, so nobody has ever signed into it.`,
      fix: "Run `npm run setup-login`. A Chrome window opens; sign into LinkedIn yourself, including any 2-factor step, wait for your feed, then close the window. This tool never types your password.",
    };
  }
  return { ok: true, kind: SESSION_OK, reason: `signed-in Chrome profile at "${st.path}".`, fix: "" };
}

/**
 * Should the profile path this command ran with be written into .env? Only
 * when the PROFILE is what carried the session — a check that passed on an
 * li_at cookie proves nothing about whatever path sat alongside it.
 */
export function shouldRememberProfile({ chromeProfile = "", liAt = "" } = {}, deps = {}) {
  if (typeof chromeProfile !== "string") return false;
  if (String(liAt || "").trim()) return false;
  const st = profileState(chromeProfile, deps);
  return st.set && !st.placeholder && st.exists && st.signedIn;
}

// --- proof that a session actually worked -----------------------------------

export const SESSION_PROOF_PATH = path.join(REPO_ROOT, "private", "session-verified.json");

/**
 * Which session a proof belongs to, so changing the profile path or switching
 * to a cookie invalidates it rather than inheriting a green tick. The cookie's
 * value is never written anywhere.
 */
export function sessionSource({ chromeProfile = "", liAt = "" } = {}) {
  if (String(liAt || "").trim()) return "li_at cookie";
  const p = String(chromeProfile || "").trim();
  return p ? `profile:${p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()}` : "";
}

/** Record that a session was just proved to load the LinkedIn feed. */
export function writeSessionProof({ chromeProfile = "", liAt = "", nowIso } = {}, deps = {}) {
  return recordProof({
    file: deps.proofPath || SESSION_PROOF_PATH,
    fingerprint: sessionSource({ chromeProfile, liAt }),
    method: String(liAt || "").trim() ? "li_at cookie" : "chrome profile",
    nowIso,
  }, deps);
}

/**
 * Has THIS session been proved to work?
 * @returns {{ok:boolean, reason:string, fix:string, command:string, verifiedAt:string}}
 */
export function sessionProofState({ chromeProfile = "", liAt = "", proofPath = "" } = {}, deps = {}) {
  if (proofPath) deps = { ...deps, proofPath };
  const want = sessionSource({ chromeProfile, liAt });
  const SIGNIN = "Sign into LinkedIn yourself in the window that opens, including any 2-factor step, and leave it open until your own feed appears. It closes itself once it sees you are in. Nothing types your password and nothing touches your 2FA.";
  const CHECK = "npm run check-login";
  if (!want) {
    return { ok: false, reason: "no session is configured yet, so there is nothing to verify.", fix: "Either paste your LinkedIn li_at cookie into .env, or let your agent open a window for you to sign into.", command: CHECK, verifiedAt: "" };
  }
  const proof = readProof({ file: deps.proofPath || SESSION_PROOF_PATH }, deps);
  if (!proof) {
    return {
      ok: false,
      reason: "no run has ever proved this session works. A profile folder containing a cookie file is not proof: Chrome creates that file the moment it opens, before anyone signs in.",
      fix: SIGNIN, command: CHECK, verifiedAt: "",
    };
  }
  if (proof.fingerprint !== want) {
    return {
      ok: false,
      reason: `the last verified session was a different one (${proof.method || "unknown"}, ${proof.verifiedAt || "unknown date"}), so it says nothing about the one configured now.`,
      fix: SIGNIN, command: CHECK, verifiedAt: proof.verifiedAt || "",
    };
  }
  return { ok: true, reason: `verified ${proof.verifiedAt} via ${proof.method}.`, fix: "", command: "", verifiedAt: proof.verifiedAt };
}

/** The message a command prints before refusing to run. */
export function formatSessionRefusal(v) {
  return [
    `No usable LinkedIn session (${v.kind}): ${v.reason}`,
    "",
    v.fix,
    "",
    "Nothing was opened, sourced or written. Verify with `npm run check-login` once fixed.",
  ].join("\n");
}
