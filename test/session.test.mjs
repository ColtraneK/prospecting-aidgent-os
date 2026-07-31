// These tests exist because of a real failure, and they describe it exactly.
//
// A first setup filled in the Google key, left AIDGENT_CHROME_PROFILE as the
// .env.example placeholder, and verified the LinkedIn login through a variable
// set in one terminal. `npm run start` printed READY. The very next command —
// a pilot, in a different shell — read .env, got the placeholder, opened a
// Chrome profile that Playwright created empty, and stopped at the LinkedIn
// login wall after eight seconds with `login: login page detected`.
//
// Nothing in that report was false and nothing in it was useful: it named
// LinkedIn for a line nobody had filled in. Every assertion below is a piece
// of making that impossible rather than merely unlikely.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isPlaceholderProfilePath, profileState, preflightSession, formatSessionRefusal,
  envFileReproducesSession, provenanceOf, describeProvenance, shouldRememberProfile,
  PLACEHOLDER_PROFILE_PATH, SESSION_VERDICTS, sessionProofState, writeSessionProof,
  SESSION_OK, NO_SESSION_CONFIGURED, PLACEHOLDER_PROFILE, PROFILE_MISSING, PROFILE_NEVER_SIGNED_IN,
  FROM_FLAG, FROM_SHELL, FROM_ENV_FILE, FROM_NOWHERE,
} from "../src/session.mjs";
import { upsertDotEnv, loadDotEnv, resolveConfig } from "../src/config.mjs";

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), "aidgent-session-"));

function signedInProfile(root, name = "profile") {
  const p = path.join(root, name);
  fs.mkdirSync(path.join(p, "Default"), { recursive: true });
  fs.writeFileSync(path.join(p, "Default", "Cookies"), "");
  return p;
}

test("the exact string shipped in .env.example is recognised as not-a-path", () => {
  // The literal value, verbatim from the file. If .env.example ever changes
  // this and session.mjs does not, the field failure comes straight back.
  assert.ok(isPlaceholderProfilePath(PLACEHOLDER_PROFILE_PATH));
  const example = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const line = example.match(/^AIDGENT_CHROME_PROFILE=(.*)$/m);
  assert.ok(line, ".env.example no longer has an AIDGENT_CHROME_PROFILE line");
  assert.ok(isPlaceholderProfilePath(line[1].trim()),
    `.env.example ships "${line[1].trim()}" and session.mjs does not recognise it as a placeholder`);
});

test("other ways of writing 'put your path here' are caught too", () => {
  for (const v of [
    "/path/to/profile", "C:/path/to/profile", "./path/to/profile", "<your-profile>",
    "C:/Users/<name>/p", "C:/your-chrome-profile", "/home/me/your_profile/x",
    "/absolute/path/outside/repo/anything", "changeme", "C:/Users/you/aidgent-chrome-profile",
    "C:/Users/<your-windows-username>/aidgent-chrome-profile", "/home/me/fill-me/profile",
  ]) {
    assert.ok(isPlaceholderProfilePath(v), `not caught: ${v}`);
  }
});

test("every path .env.example itself suggests is either real or refused", () => {
  // .env.example once offered `C:/Users/you/...` as the thing to copy. Pasted
  // verbatim that is not a folder anyone owns, and setup-login would have
  // created a signed-in profile there — the original bug, from the file's own
  // advice. Any example path in that file must be recognisable as a template.
  const example = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const suggested = [...example.matchAll(/AIDGENT_CHROME_PROFILE=(\S+)/g)].map((m) => m[1]);
  assert.ok(suggested.length >= 2, "expected the live line plus at least one commented example");
  for (const v of suggested) {
    assert.ok(isPlaceholderProfilePath(v),
      `.env.example offers "${v}", which would be accepted as a real profile path`);
  }
});

test("real paths are never mistaken for placeholders", () => {
  // A false positive here would refuse a working setup, so it is worth being
  // explicit about the shapes people actually use — including the one from the
  // machine where this failed.
  for (const v of [
    "C:/Users/coltr/aidgent-chrome-profile", "C:\\Users\\coltr\\aidgent-chrome-profile",
    "/home/me/aidgent-chrome-profile", "/Users/me/Library/aidgent", "D:/work/profiles/li",
    "../outside/aidgent-chrome-profile", "/home/absolute/path-finder/profile",
    // Every one of these was refused by an earlier substring-matching version.
    // A false positive has no override flag: it bricks a working setup and
    // tells the person their real folder is an example placeholder.
    "/srv/path/to-profiles/li", "/home/me/your-profile-backup",
    "C:/Users/me/OneDrive/Your Profile/chrome", "/opt/example/path/li", "C:/Users/yourprofile/x", "/data/dirto/p", "/data/pathto/p",
    "/home/me/[old]/profile", "/archive/{2024}/profile", "//server/path/to/profile",
    "/Users/me/Projects/change-me-later/profile", "/home/me/exchange-me/profile",
  ]) {
    assert.ok(!isPlaceholderProfilePath(v), `false positive: ${v}`);
  }
  assert.ok(!isPlaceholderProfilePath(""));
});

test("a placeholder is never touched on disk, even if something with that name exists", () => {
  // On Windows a leading slash resolves against the current drive, so the
  // placeholder is a path that CAN exist. Existence must not rescue it.
  const root = tmpdir();
  const p = path.join(root, "changeme");
  fs.mkdirSync(path.join(p, "Default"), { recursive: true });
  fs.writeFileSync(path.join(p, "Default", "Cookies"), "");
  const st = profileState(p);
  assert.equal(st.placeholder, true);
  assert.equal(st.exists, false, "a placeholder must never report as a usable profile");
  assert.equal(st.signedIn, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("each way of having no session gets its own named verdict", () => {
  const root = tmpdir();
  const empty = path.join(root, "empty-profile");
  fs.mkdirSync(path.join(empty, "Default"), { recursive: true });

  assert.equal(preflightSession({}).kind, NO_SESSION_CONFIGURED);
  assert.equal(preflightSession({ chromeProfile: PLACEHOLDER_PROFILE_PATH }).kind, PLACEHOLDER_PROFILE);
  assert.equal(preflightSession({ chromeProfile: path.join(root, "nope") }).kind, PROFILE_MISSING);
  assert.equal(preflightSession({ chromeProfile: empty }).kind, PROFILE_NEVER_SIGNED_IN);
  assert.equal(preflightSession({ chromeProfile: signedInProfile(root) }).ok, true);
  // The cookie is a complete session on its own; no folder has to exist.
  assert.equal(preflightSession({ liAt: "AQEDA..." }).ok, true);
  assert.equal(preflightSession({ chromeProfile: PLACEHOLDER_PROFILE_PATH, liAt: "AQEDA..." }).ok, true,
    "a working cookie makes the profile line irrelevant");

  fs.rmSync(root, { recursive: true, force: true });
});

test("every refusal names a fix and never blames LinkedIn", () => {
  const root = tmpdir();
  const cases = [
    preflightSession({}),
    preflightSession({ chromeProfile: PLACEHOLDER_PROFILE_PATH }),
    preflightSession({ chromeProfile: path.join(root, "nope") }),
  ];
  for (const v of cases) {
    assert.equal(v.ok, false);
    assert.ok(v.fix.trim().length > 20, `verdict ${v.kind} has no usable fix`);
    const text = formatSessionRefusal(v);
    // The whole point: this message must not read as a LinkedIn problem.
    assert.ok(!/login page detected|linkedin (blocked|is blocking)/i.test(text),
      `verdict ${v.kind} still reads like a LinkedIn blocker: ${text}`);
    assert.match(text, /Nothing was opened, sourced or written/);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test("no refusal is ever rendered with an empty reason or an empty fix", () => {
  // The status screen prints these verbatim. An empty fix renders as a blank
  // gap under "NEXT STEP", which is a dead end for the person reading it.
  const root = tmpdir();
  const empty = path.join(root, "empty");
  fs.mkdirSync(path.join(empty, "Default"), { recursive: true });
  const verdicts = [
    preflightSession({}),
    preflightSession({ chromeProfile: PLACEHOLDER_PROFILE_PATH }),
    preflightSession({ chromeProfile: path.join(root, "nope") }),
    preflightSession({ chromeProfile: empty }),
    envFileReproducesSession({ fileEnv: {} }),
    envFileReproducesSession({ fileEnv: {}, resolvedLiAt: "AQEDA..." }),
    envFileReproducesSession({ fileEnv: {}, resolvedProfile: "/somewhere/real" }),
    envFileReproducesSession({ fileEnv: { AIDGENT_CHROME_PROFILE: PLACEHOLDER_PROFILE_PATH } }),
    envFileReproducesSession({ fileEnv: { AIDGENT_CHROME_PROFILE: path.join(root, "gone") } }),
    envFileReproducesSession({ fileEnv: { AIDGENT_CHROME_PROFILE: empty } }),
    envFileReproducesSession({
      fileEnv: { AIDGENT_CHROME_PROFILE: signedInProfile(root, "a") },
      resolvedProfile: signedInProfile(root, "b"),
    }),
  ];
  for (const v of verdicts) {
    if (v.ok) continue;
    assert.ok(v.reason && v.reason.trim().length > 10, `empty reason: ${JSON.stringify(v)}`);
    assert.ok(v.fix && v.fix.trim().length > 10, `empty fix: ${JSON.stringify(v)}`);
    // The status screen must never ask a question — it cannot receive an answer.
    assert.ok(!`${v.reason} ${v.fix}`.includes("?"), `question mark in verdict: ${v.kind}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test("a cookie exported for one command does not invalidate a good .env", () => {
  // Regression: an earlier version returned "not reproducible" whenever a
  // cookie was in the shell, even when .env named a working profile — and told
  // the person to paste a secret into a file to silence it.
  const root = tmpdir();
  const profile = signedInProfile(root);
  const v = envFileReproducesSession({
    fileEnv: { AIDGENT_CHROME_PROFILE: profile },
    resolvedProfile: profile,
    resolvedLiAt: "AQEDA...",
  });
  assert.equal(v.ok, true, v.reason);
  assert.ok(!/paste/i.test(v.fix || ""), "must not push the person to write a secret to disk");
  fs.rmSync(root, { recursive: true, force: true });
});

test("only a session the profile actually carried gets written back to .env", () => {
  const root = tmpdir();
  const good = signedInProfile(root);
  const empty = path.join(root, "never");
  fs.mkdirSync(empty, { recursive: true });

  assert.equal(shouldRememberProfile({ chromeProfile: good }), true);
  // check-login succeeding on a cookie proves nothing about this path. Writing
  // it plants a value that reads as verified and fails when the cookie expires.
  assert.equal(shouldRememberProfile({ chromeProfile: good, liAt: "AQEDA..." }), false);
  assert.equal(shouldRememberProfile({ chromeProfile: empty }), false);
  assert.equal(shouldRememberProfile({ chromeProfile: path.join(root, "gone") }), false);
  assert.equal(shouldRememberProfile({ chromeProfile: PLACEHOLDER_PROFILE_PATH }), false);
  assert.equal(shouldRememberProfile({}), false);
  // A bare `--profile` with no value arrives as `true`.
  assert.equal(shouldRememberProfile({ chromeProfile: true }), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a valueless --profile flag never becomes the string 'true'", () => {
  // parseFlags gives `--profile` with no argument the value `true`. Left
  // alone it reaches Playwright as a path and dies on a raw type error.
  const c = resolveConfig({ profile: true }, { AIDGENT_CHROME_PROFILE: "/home/me/p" });
  assert.equal(c.chromeProfile, "/home/me/p", "a flag with no value must not win over .env");
  assert.equal(resolveConfig({ profile: true }, {}).chromeProfile, "");
  assert.equal(resolveConfig({ "li-at": true }, {}).liAt, "");
  assert.equal(resolveConfig({ profile: "/from/flag" }, { AIDGENT_CHROME_PROFILE: "/from/env" }).chromeProfile, "/from/flag");
});

test("AGENTS.md explains every session verdict the preflight can produce", () => {
  // Same contract as the empty-page verdicts: a word that can reach the person
  // and is not in AGENTS.md leaves the agent unable to explain it.
  const agents = fs.readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
  for (const kind of SESSION_VERDICTS) {
    if (kind === SESSION_OK) continue;
    assert.ok(agents.includes(kind), `AGENTS.md never explains the "${kind}" verdict`);
  }
});

// --- the shell-vs-.env gap --------------------------------------------------

test("provenance follows resolveConfig's precedence exactly", () => {
  const shellEnv = { AIDGENT_CHROME_PROFILE: "/from/shell" };
  const fileEnv = { AIDGENT_CHROME_PROFILE: "/from/file" };
  assert.equal(provenanceOf("AIDGENT_CHROME_PROFILE", { flagValue: "/from/flag", shellEnv, fileEnv }), FROM_FLAG);
  assert.equal(provenanceOf("AIDGENT_CHROME_PROFILE", { shellEnv, fileEnv }), FROM_SHELL);
  assert.equal(provenanceOf("AIDGENT_CHROME_PROFILE", { fileEnv }), FROM_ENV_FILE);
  assert.equal(provenanceOf("AIDGENT_CHROME_PROFILE", {}), FROM_NOWHERE);
  // A bare `--profile` with no value is a flag, not a path.
  assert.equal(provenanceOf("AIDGENT_CHROME_PROFILE", { flagValue: true, fileEnv }), FROM_ENV_FILE);
  // The shell case has to say out loud that it is not .env — that sentence is
  // the entire warning.
  assert.match(describeProvenance(FROM_SHELL), /NOT from \.env/);
});

test("a session that works only in this terminal is reported as not reproducible", () => {
  const root = tmpdir();
  const profile = signedInProfile(root);

  // Exactly the field failure: .env untouched, the real path in the shell.
  const shellOnly = envFileReproducesSession({
    fileEnv: { AIDGENT_CHROME_PROFILE: PLACEHOLDER_PROFILE_PATH },
    resolvedProfile: profile,
  });
  assert.equal(shellOnly.ok, false);
  assert.match(shellOnly.reason, /placeholder/i);
  assert.match(shellOnly.fix, /AIDGENT_CHROME_PROFILE=/);

  // .env naming a different real profile than the one in use is the same class
  // of problem and must not pass just because both exist.
  const disagree = envFileReproducesSession({
    fileEnv: { AIDGENT_CHROME_PROFILE: signedInProfile(root, "other") },
    resolvedProfile: profile,
  });
  assert.equal(disagree.ok, false);
  assert.match(disagree.reason, /a new terminal would get the first one/);

  // And the state we actually want.
  const good = envFileReproducesSession({
    fileEnv: { AIDGENT_CHROME_PROFILE: profile },
    resolvedProfile: profile,
  });
  assert.equal(good.ok, true);

  fs.rmSync(root, { recursive: true, force: true });
});

test("a cookie in the shell but not in .env is caught the same way", () => {
  const v = envFileReproducesSession({ fileEnv: {}, resolvedLiAt: "AQEDA..." });
  assert.equal(v.ok, false);
  assert.match(v.reason, /not in \.env/);
  // .env carrying its own cookie is enough on its own — no profile needed.
  assert.equal(envFileReproducesSession({ fileEnv: { AIDGENT_LI_AT: "AQEDA..." } }).ok, true);
});

test("a profile named in .env that is unusable is not 'reproducible'", () => {
  const root = tmpdir();
  const missing = envFileReproducesSession({ fileEnv: { AIDGENT_CHROME_PROFILE: path.join(root, "gone") } });
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /not on this machine/);

  const never = path.join(root, "fresh");
  fs.mkdirSync(never, { recursive: true });
  const v = envFileReproducesSession({ fileEnv: { AIDGENT_CHROME_PROFILE: never } });
  assert.equal(v.ok, false);
  assert.match(v.reason, /never been signed into/);
  fs.rmSync(root, { recursive: true, force: true });
});

// --- writing the value back -------------------------------------------------

test("upsertDotEnv replaces the placeholder line in place and leaves the rest alone", () => {
  const root = tmpdir();
  const file = path.join(root, ".env");
  fs.writeFileSync(file, [
    "# comment",
    "GOOGLE_APPLICATION_CREDENTIALS=/keys/svc.json",
    `AIDGENT_CHROME_PROFILE=${PLACEHOLDER_PROFILE_PATH}`,
    "HEADLESS=false",
    "",
  ].join("\n"));

  const r = upsertDotEnv("AIDGENT_CHROME_PROFILE", "C:/Users/me/aidgent-chrome-profile", file);
  assert.equal(r.replaced, true);
  const parsed = loadDotEnv(file);
  assert.equal(parsed.AIDGENT_CHROME_PROFILE, "C:/Users/me/aidgent-chrome-profile");
  assert.equal(parsed.GOOGLE_APPLICATION_CREDENTIALS, "/keys/svc.json", "other settings must survive");
  assert.equal(parsed.HEADLESS, "false");
  assert.match(fs.readFileSync(file, "utf8"), /^# comment$/m, "comments must survive");
  fs.rmSync(root, { recursive: true, force: true });
});

test("upsertDotEnv appends a missing key and preserves CRLF files", () => {
  const root = tmpdir();
  const file = path.join(root, ".env");
  // .env is hand-edited on Windows more often than not. Rewriting the whole
  // file with LF endings would show up as a total rewrite in any diff.
  fs.writeFileSync(file, "GOOGLE_SHEET_ID=abc\r\nHEADLESS=false\r\n");
  // Assert CRLF is PRESENT as well as unmixed: "no lone \n" passes vacuously
  // on a file that contains no newline at all.
  const crlfOnly = (raw) => {
    assert.ok(raw.includes("\r\n"), `expected CRLF endings, got ${JSON.stringify(raw)}`);
    assert.ok(!/[^\r]\n/.test(raw), `mixed line endings introduced:\n${JSON.stringify(raw)}`);
  };
  upsertDotEnv("AIDGENT_CHROME_PROFILE", "C:/Users/me/p", file);
  crlfOnly(fs.readFileSync(file, "utf8"));
  assert.equal(loadDotEnv(file).AIDGENT_CHROME_PROFILE, "C:/Users/me/p");
  assert.equal(loadDotEnv(file).GOOGLE_SHEET_ID, "abc");

  // Replacing inside a CRLF file must not strip that line's CR either.
  upsertDotEnv("HEADLESS", "true", file);
  crlfOnly(fs.readFileSync(file, "utf8"));
  assert.equal(loadDotEnv(file).HEADLESS, "true");
  fs.rmSync(root, { recursive: true, force: true });
});

test("upsertDotEnv beats duplicate keys, which loadDotEnv resolves last-wins", () => {
  // Appending rather than editing is how a .env normally grows a second line
  // for the same key. Replacing only the first writes a value the stale line
  // below immediately overrides — while reporting success, which is the exact
  // class of failure this whole change exists to prevent.
  const root = tmpdir();
  const file = path.join(root, ".env");
  fs.writeFileSync(file, [
    "AIDGENT_CHROME_PROFILE=/old/one",
    "HEADLESS=false",
    "AIDGENT_CHROME_PROFILE=/old/two",
    "",
  ].join("\n"));
  assert.equal(loadDotEnv(file).AIDGENT_CHROME_PROFILE, "/old/two", "loadDotEnv is last-wins");

  upsertDotEnv("AIDGENT_CHROME_PROFILE", "/home/me/new", file);
  assert.equal(loadDotEnv(file).AIDGENT_CHROME_PROFILE, "/home/me/new");
  const kept = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.startsWith("AIDGENT_CHROME_PROFILE="));
  assert.equal(kept.length, 1, `left ${kept.length} lines for the key: ${kept.join(" | ")}`);
  assert.equal(loadDotEnv(file).HEADLESS, "false");
  fs.rmSync(root, { recursive: true, force: true });
});

test("upsertDotEnv writes the value literally, including $ characters", () => {
  // String.replace treats $&, $` and $' in the REPLACEMENT as instructions, so
  // a path containing one would splice other parts of the file into itself.
  const root = tmpdir();
  const file = path.join(root, ".env");
  for (const value of ["/home/me/a$&b", "C:/Users/me/$`p", "/srv/$'x", "/srv/$1/y"]) {
    fs.writeFileSync(file, "AIDGENT_CHROME_PROFILE=/old\nHEADLESS=false\n");
    upsertDotEnv("AIDGENT_CHROME_PROFILE", value, file);
    assert.equal(loadDotEnv(file).AIDGENT_CHROME_PROFILE, value, `mangled: ${value}`);
    assert.equal(loadDotEnv(file).HEADLESS, "false");
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test("upsertDotEnv leaves commented-out and similarly-named keys alone", () => {
  const root = tmpdir();
  const file = path.join(root, ".env");
  fs.writeFileSync(file, [
    "#   AIDGENT_CHROME_PROFILE=C:/an/example/from/the/comments",
    "AIDGENT_CHROME_PROFILE_BACKUP=/keep/me",
    "AIDGENT_CHROME_PROFILE=/old",
    "",
  ].join("\n"));
  upsertDotEnv("AIDGENT_CHROME_PROFILE", "/new", file);
  const raw = fs.readFileSync(file, "utf8");
  assert.match(raw, /^#   AIDGENT_CHROME_PROFILE=C:\/an\/example\/from\/the\/comments$/m);
  assert.equal(loadDotEnv(file).AIDGENT_CHROME_PROFILE_BACKUP, "/keep/me");
  assert.equal(loadDotEnv(file).AIDGENT_CHROME_PROFILE, "/new");
  fs.rmSync(root, { recursive: true, force: true });
});

test("upsertDotEnv creates the file when there is none", () => {
  const root = tmpdir();
  const file = path.join(root, ".env");
  upsertDotEnv("AIDGENT_CHROME_PROFILE", "/home/me/p", file);
  assert.equal(loadDotEnv(file).AIDGENT_CHROME_PROFILE, "/home/me/p");
  fs.rmSync(root, { recursive: true, force: true });
});

// --- proof that a session actually worked ------------------------------------

test("a cookie file in a profile folder is NOT proof of a LinkedIn session", () => {
  // The regression this whole section exists for. Chrome creates
  // Default/Cookies the instant it launches, so a profile someone opened and
  // abandoned looked signed in to the checklist. `npm run start` printed READY
  // and `npm run check-login` said "login page detected" one command later.
  const root = tmpdir();
  const profile = signedInProfile(root); // has Default/Cookies on disk
  const proofPath = path.join(root, "session-verified.json");

  assert.equal(profileState(profile).signedIn, true, "the old heuristic still sees a cookie file");
  const v = sessionProofState({ chromeProfile: profile, proofPath });
  assert.equal(v.ok, false, "but nothing has proved the session works");
  assert.match(v.reason, /Chrome creates that file the moment it opens/);
  // The hint a person reads must describe a human action, not a command.
  // Commands belong to the agent and travel separately.
  assert.match(v.command, /check-login/);
  assert.ok(!/npm run/.test(v.fix), `a person-facing hint should not contain a command: ${v.fix}`);
  assert.match(v.fix, /[Ss]ign into LinkedIn/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("proof is accepted only for the session it was recorded against", () => {
  const root = tmpdir();
  const a = signedInProfile(root, "a");
  const b = signedInProfile(root, "b");
  const proofPath = path.join(root, "session-verified.json");
  const nowIso = "2026-07-31T12:00:00.000Z";
  const nowMs = Date.parse(nowIso);

  writeSessionProof({ chromeProfile: a, nowIso }, { proofPath });
  assert.equal(sessionProofState({ chromeProfile: a, nowMs, proofPath }).ok, true);
  // Switching the profile must not inherit the other one's green tick.
  const other = sessionProofState({ chromeProfile: b, nowMs, proofPath });
  assert.equal(other.ok, false);
  assert.match(other.reason, /a different one/);
  // A cookie is a different session again, even alongside the proved profile.
  assert.equal(sessionProofState({ chromeProfile: a, liAt: "AQEDA...", nowMs, proofPath }).ok, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("proof expires, because LinkedIn sessions do", () => {
  const root = tmpdir();
  const profile = signedInProfile(root);
  const proofPath = path.join(root, "session-verified.json");
  writeSessionProof({ chromeProfile: profile, nowIso: "2026-07-01T12:00:00.000Z" }, { proofPath });

  const fresh = sessionProofState({ chromeProfile: profile, nowMs: Date.parse("2026-07-08T12:00:00.000Z"), proofPath });
  assert.equal(fresh.ok, true);
  const stale = sessionProofState({ chromeProfile: profile, nowMs: Date.parse("2026-08-30T12:00:00.000Z"), proofPath });
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /days ago/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("the li_at cookie is fingerprinted, never written to disk", () => {
  // The proof file lives in private/ and is git-ignored, but a credential still
  // has no business being in a file this tool writes on someone's behalf.
  const root = tmpdir();
  const proofPath = path.join(root, "session-verified.json");
  const secret = "AQEDATotallySecretCookieValue1234567890";
  writeSessionProof({ liAt: secret, nowIso: "2026-07-31T12:00:00.000Z" }, { proofPath });
  const raw = fs.readFileSync(proofPath, "utf8");
  assert.ok(!raw.includes(secret), `the cookie value was written to disk:\n${raw}`);
  assert.match(raw, /"fingerprint": "cookie:[0-9a-f]{16}"/);
  // A different cookie must not satisfy the proof.
  const nowMs = Date.parse("2026-07-31T12:00:01.000Z");
  assert.equal(sessionProofState({ liAt: secret, nowMs, proofPath }).ok, true);
  assert.equal(sessionProofState({ liAt: "AQEDADifferentCookie", nowMs, proofPath }).ok, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("no proof at all is reported as unverified, not as broken", () => {
  const root = tmpdir();
  const proofPath = path.join(root, "nothing-here.json");
  const v = sessionProofState({ chromeProfile: signedInProfile(root), proofPath });
  assert.equal(v.ok, false);
  assert.ok(v.reason.trim().length > 10);
  assert.ok(v.fix.trim().length > 10);
  assert.ok(!`${v.reason} ${v.fix}`.includes("?"));
  // And with nothing configured either, it says so rather than blaming a file.
  const none = sessionProofState({ proofPath });
  assert.equal(none.ok, false);
  assert.match(none.reason, /nothing to verify/);
  fs.rmSync(root, { recursive: true, force: true });
});
