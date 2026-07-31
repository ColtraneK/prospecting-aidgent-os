// session.mjs — is there a LinkedIn session, and can .env reproduce it?
//
// WHY THIS EXISTS
// A run that reaches LinkedIn without a session does not fail cleanly. It
// lands on the login wall, and the run report says `login: login page
// detected` — which reads as "LinkedIn blocked us" when the truth is "this
// machine was never configured". Those two need different responses from the
// person, and the report cannot tell them apart after the fact.
//
// Two specific traps produced that outcome in the field:
//
//   1. The .env.example placeholder. Copying .env.example to .env and filling
//      in only the Google key is exactly what a first setup does, which leaves
//      AIDGENT_CHROME_PROFILE pointing at the example string. On Windows a
//      leading slash resolves against the current drive, so it is a VALID path
//      that does not exist — and Playwright's launchPersistentContext CREATES
//      any profile directory it is handed. A brand-new signed-out Chrome opens
//      and walks straight into the login wall.
//
//   2. A value that lives only in one shell. resolveConfig merges flags over
//      process.env over .env, so `set AIDGENT_CHROME_PROFILE=...` in the
//      terminal you happen to be standing in makes `npm run start` print READY
//      against a configuration that .env cannot reproduce. The next shell — or
//      the next agent thread, or the machine after a reboot — silently falls
//      back to the placeholder.
//
// Everything here answers those questions BEFORE a browser opens, and names
// the fix in the same breath. It is pure: no browser, no network, and its only
// filesystem reads go through an injected `fs` so it can be tested.

import fsDefault from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";
import { recordProof, readProof, fingerprintSecret } from "./verified.mjs";

/** The literal value shipped in .env.example. Rejected by value, not just by existence. */
export const PLACEHOLDER_PROFILE_PATH = "/absolute/path/outside/repo/aidgent-chrome-profile";

// Anything shaped like an instruction rather than a path.
//
// Every pattern is anchored to whole path SEGMENTS. An earlier version matched
// on substrings and refused real folders — /srv/path/to/profile,
// /home/me/your-profile-backup, "OneDrive/Your Profile" — with a message
// asserting they were the example placeholder. A false positive here is not
// cheap: there is no override flag, so it bricks a working setup and lies
// about why. Match narrowly, and word the message as a judgement rather than
// a fact about .env.example.
const PLACEHOLDER_PATTERNS = [
  // The shipped example, and anything beneath it.
  /(^|[\\/])absolute[\\/]path[\\/]outside[\\/]repo([\\/]|$)/i,
  // "path/to/..." only at the START of the path, with an optional drive letter
  // or "./" — C:/path/to/x is a template, /srv/path/to/x is somebody's folder.
  /^(?:[a-z]:)?[\\/.]{0,2}path[\\/]to([\\/]|$)/i,
  // A whole segment in angle brackets: <your-username>. Angle brackets are
  // illegal in Windows filenames and vanishingly rare elsewhere. Square
  // brackets and braces are NOT included — /home/me/[old]/profile and
  // /archive/{2024}/profile are real folders people have.
  /(^|[\\/])<[^\\/<>]*>([\\/]|$)/,
  // Whole-segment fill-me-in tokens. Both boundaries matter, and so does the
  // separator: "change-me-later", "your-profile-backup", "yourprofile",
  // "dirto" and "pathto" are all folders someone made on purpose.
  /(^|[\\/])(change|fill)[-_]me([\\/]|$)/i,
  /(^|[\\/])(changeme|fillme)([\\/]|$)/i,
  /(^|[\\/])your[-_](chrome[-_])?profile([\\/]|$)/i,
  /(^|[\\/])(path|folder|dir)[-_](to|here)([\\/]|$)/i,
  // .env.example once suggested C:/Users/you/... verbatim.
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

// --- where a value came from ------------------------------------------------

export const FROM_FLAG = "flag";
export const FROM_SHELL = "shell";
export const FROM_ENV_FILE = "env-file";
export const FROM_NOWHERE = "unset";

/**
 * Which layer actually supplied this setting. Mirrors resolveConfig's
 * precedence exactly: CLI flag, then the shell, then .env.
 */
export function provenanceOf(key, { flagValue = "", shellEnv = {}, fileEnv = {} } = {}) {
  if (flagValue && flagValue !== true && String(flagValue).trim()) return FROM_FLAG;
  if (String(shellEnv[key] || "").trim()) return FROM_SHELL;
  if (String(fileEnv[key] || "").trim()) return FROM_ENV_FILE;
  return FROM_NOWHERE;
}

/** Human wording for a provenance, for printing next to a resolved value. */
export function describeProvenance(p) {
  switch (p) {
    case FROM_FLAG: return "from a --flag on this command";
    case FROM_SHELL: return "from a variable set in this terminal — NOT from .env";
    case FROM_ENV_FILE: return "from .env";
    default: return "not set anywhere";
  }
}

// --- can .env stand on its own? --------------------------------------------

/**
 * Would a brand-new terminal, reading only .env, end up with the same working
 * session as the one in front of us right now?
 *
 * This is the check that would have caught the field failure. Everything else
 * in the checklist was green at the time; the only thing wrong was that the
 * green came from the shell.
 *
 * @returns {{ok:boolean, reason:string, fix:string}}
 */
export function envFileReproducesSession(
  { fileEnv = {}, resolvedProfile = "", resolvedLiAt = "" } = {},
  deps = {},
) {
  const fileProfile = String(fileEnv.AIDGENT_CHROME_PROFILE || "").trim();
  const fileLiAt = String(fileEnv.AIDGENT_LI_AT || "").trim();

  if (fileLiAt) {
    return { ok: true, reason: "AIDGENT_LI_AT is set in .env, which is a session on its own.", fix: "" };
  }

  // A cookie exported for a one-off test does not make a .env that already
  // names a working profile unreproducible. Only complain about a shell-only
  // cookie when .env has nothing of its own to fall back on — otherwise this
  // pushes people to write a secret to disk for no reason.
  if (resolvedLiAt && !fileProfile) {
    return {
      ok: false,
      reason: "the li_at cookie you are running with is not in .env, and .env names no profile either, so the next terminal will have no session at all.",
      fix: "Either set AIDGENT_CHROME_PROFILE in .env to a signed-in profile folder, or paste that same cookie into AIDGENT_LI_AT in .env.",
    };
  }

  if (!fileProfile) {
    return {
      ok: false,
      reason: resolvedProfile
        ? `you are running against the profile "${resolvedProfile}", but .env does not name it.`
        : ".env names no LinkedIn session at all.",
      fix: resolvedProfile
        ? `Set AIDGENT_CHROME_PROFILE=${forEnvFile(resolvedProfile)} in .env.`
        : "Set AIDGENT_CHROME_PROFILE in .env to your signed-in profile folder, or paste an li_at cookie into AIDGENT_LI_AT.",
    };
  }

  if (isPlaceholderProfilePath(fileProfile)) {
    return {
      ok: false,
      reason: `.env has a fill-this-in placeholder where the profile path goes (${fileProfile}), not a real folder.`,
      fix: resolvedProfile && !isPlaceholderProfilePath(resolvedProfile)
        ? `Replace it with AIDGENT_CHROME_PROFILE=${forEnvFile(resolvedProfile)}.`
        : "Replace it with the folder you signed into, then run `npm run check-login`.",
    };
  }

  if (resolvedProfile && !samePath(fileProfile, resolvedProfile)) {
    return {
      ok: false,
      reason: `.env says "${fileProfile}" but this run is using "${resolvedProfile}" — a new terminal would get the first one.`,
      fix: `Make them agree: set AIDGENT_CHROME_PROFILE=${forEnvFile(resolvedProfile)} in .env, or drop the override.`,
    };
  }

  const st = profileState(fileProfile, deps);
  if (!st.exists) {
    return {
      ok: false,
      reason: `.env points at "${fileProfile}", which is not on this machine.`,
      fix: "Fix the path in .env, then run `npm run setup-login` and sign in once.",
    };
  }
  if (!st.signedIn) {
    return {
      ok: false,
      reason: `.env points at "${fileProfile}", which exists but has never been signed into.`,
      fix: "Run `npm run setup-login`, sign in yourself, wait for your feed, then close the window.",
    };
  }
  return { ok: true, reason: `.env names a signed-in profile (${fileProfile}).`, fix: "" };
}

// .env is parsed as raw KEY=VALUE with no unescaping, so a Windows path with
// backslashes survives literally — but forward slashes are what we suggest,
// because they cannot be mistaken for an escape by anyone editing the file.
function forEnvFile(p) {
  return String(p || "").replace(/\\/g, "/");
}

function samePath(a, b) {
  const norm = (v) => String(v || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

// --- the preflight ----------------------------------------------------------

export const SESSION_OK = "session_ok";
export const NO_SESSION_CONFIGURED = "no_session_configured";
export const PLACEHOLDER_PROFILE = "placeholder_profile";
export const PROFILE_MISSING = "profile_missing";
export const PROFILE_NEVER_SIGNED_IN = "profile_never_signed_in";

/** Every verdict this module can hand back. AGENTS.md must explain each one. */
export const SESSION_VERDICTS = [
  SESSION_OK, NO_SESSION_CONFIGURED, PLACEHOLDER_PROFILE, PROFILE_MISSING, PROFILE_NEVER_SIGNED_IN,
];

/**
 * Decide, without opening a browser, whether this run can possibly have a
 * LinkedIn session. Called by every command that would otherwise navigate.
 *
 * A `false` here is a refusal, not a warning. The alternative — proceeding and
 * finding out at the login wall — costs eight seconds and produces a report
 * that blames the wrong thing.
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
        "Open .env and replace that line with the folder you want the signed-in Chrome profile to live in — anywhere outside this repo, for example a folder next to your home directory.",
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
 * Should the profile path this command ran with be written into .env?
 *
 * Only when the PROFILE is what carried the session. A check-login that
 * succeeded on an li_at cookie proves nothing about whatever path happened to
 * be set alongside it, and persisting that path plants a value that looks
 * verified, reports as signed-in later (the folder acquires a cookie store
 * once Chrome opens it), and fails every run after the cookie expires.
 */
export function shouldRememberProfile({ chromeProfile = "", liAt = "" } = {}, deps = {}) {
  if (typeof chromeProfile !== "string") return false;
  if (String(liAt || "").trim()) return false;
  const st = profileState(chromeProfile, deps);
  return st.set && !st.placeholder && st.exists && st.signedIn;
}

// --- proof that a session actually worked -----------------------------------
//
// WHY THIS EXISTS
// `npm run start` is offline by contract: it opens no browser and makes no
// network calls, so it cannot itself find out whether LinkedIn will accept a
// session. It used to infer one from the presence of a cookie-store FILE
// inside the profile directory — and Chrome creates that file the instant it
// launches, before anyone has typed a password. So a profile that had been
// opened and abandoned reported as signed in, the checklist printed READY, and
// `check-login` then said "login page detected" one command later.
//
// The only honest source of truth is a run that actually loaded the feed. So
// the commands that DO open a browser record what they proved, and the
// checklist reads that record instead of guessing. READY now means a session
// that was demonstrated, not one that looked plausible on disk.

export const SESSION_PROOF_PATH = path.join(REPO_ROOT, "private", "session-verified.json");

/** A proof older than this is treated as expired: sessions do not last forever. */
export const SESSION_PROOF_MAX_AGE_DAYS = 14;

/**
 * Identify WHICH session a proof belongs to, so that changing the profile path
 * or pasting a different cookie invalidates it rather than inheriting someone
 * else's green tick. The cookie is fingerprinted, never stored: a truncated
 * SHA-256 of a long random value is not reversible, and the secret itself has
 * no business being written to a file this tool manages.
 */
export function sessionFingerprint({ chromeProfile = "", liAt = "" } = {}) {
  const cookie = String(liAt || "").trim();
  if (cookie) return `cookie:${fingerprintSecret(cookie)}`;
  const p = String(chromeProfile || "").trim();
  return p ? `profile:${p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()}` : "";
}

/** Record that a session was just proved to load the LinkedIn feed. */
export function writeSessionProof({ chromeProfile = "", liAt = "", nowIso } = {}, deps = {}) {
  return recordProof({
    file: deps.proofPath || SESSION_PROOF_PATH,
    fingerprint: sessionFingerprint({ chromeProfile, liAt }),
    method: String(liAt || "").trim() ? "li_at cookie" : "chrome profile",
    nowIso,
  }, deps);
}

export function readSessionProof(deps = {}) {
  return readProof({ file: deps.proofPath || SESSION_PROOF_PATH }, deps);
}

/**
 * Has THIS session been proved to work, recently enough to believe?
 * @returns {{ok:boolean, reason:string, fix:string, verifiedAt:string}}
 */
export function sessionProofState(
  { chromeProfile = "", liAt = "", nowMs = Date.now(), maxAgeDays = SESSION_PROOF_MAX_AGE_DAYS, proofPath = "" } = {},
  deps = {},
) {
  if (proofPath) deps = { ...deps, proofPath };
  const want = sessionFingerprint({ chromeProfile, liAt });
  // Person-facing prose only. The verifying command travels in `command`.
  const SIGNIN = "Sign into LinkedIn yourself in the window that opens, including any 2-factor step, and leave it open until your own feed appears. It closes itself once it sees you are in. Nothing types your password and nothing touches your 2FA.";
  const NOTHING = "Nothing for you to do unless the check comes back signed out.";
  const CHECK = "npm run check-login";
  if (!want) {
    return { ok: false, reason: "no session is configured yet, so there is nothing to verify.", fix: "Choose how to sign in: either paste your LinkedIn li_at cookie into .env, or let your agent open a window for you to sign into.", command: CHECK, verifiedAt: "" };
  }
  const proof = readSessionProof(deps);
  if (!proof) {
    return {
      ok: false,
      reason: "no run has ever proved this session works. A profile folder containing a cookie file is not proof: Chrome creates that file the moment it opens, before anyone signs in.",
      fix: SIGNIN,
      command: CHECK,
      verifiedAt: "",
    };
  }
  if (proof.fingerprint !== want) {
    return {
      ok: false,
      reason: `the last verified session was a different one (${proof.method || "unknown"}, ${proof.verifiedAt || "unknown date"}), so it says nothing about the one configured now.`,
      fix: SIGNIN,
      command: CHECK,
      verifiedAt: proof.verifiedAt || "",
    };
  }
  const ageMs = nowMs - Date.parse(proof.verifiedAt || "");
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { ok: false, reason: "the recorded verification has no usable date.", fix: NOTHING, command: CHECK, verifiedAt: proof.verifiedAt || "" };
  }
  if (ageMs > maxAgeDays * 86400000) {
    const days = Math.floor(ageMs / 86400000);
    return {
      ok: false,
      reason: `this session was last proved to work ${days} days ago, and LinkedIn sessions expire.`,
      fix: SIGNIN,
      command: CHECK,
      verifiedAt: proof.verifiedAt,
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
