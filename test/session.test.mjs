// session.test.mjs — the preflight that stops a run before the login wall, and
// the proof that READY means demonstrated, not configured.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isPlaceholderProfilePath, preflightSession, shouldRememberProfile,
  writeSessionProof, sessionProofState, formatSessionRefusal, sessionSource,
  NO_SESSION_CONFIGURED, PLACEHOLDER_PROFILE, PROFILE_MISSING, PROFILE_NEVER_SIGNED_IN, SESSION_OK,
} from "../src/session.mjs";
import { upsertDotEnv, loadDotEnv, resolveConfig } from "../src/config.mjs";

// --- placeholder detection: refuse instructions, never real folders ----------

test("the shipped placeholder and its cousins are recognised", () => {
  for (const p of [
    "/absolute/path/outside/repo/aidgent-chrome-profile",
    "C:/path/to/profile",
    "path/to/aidgent",
    "/home/<your-username>/profile",
    "/home/me/change-me",
    "C:/Users/you/aidgent-profile",
    "/srv/your-profile",
  ]) {
    assert.equal(isPlaceholderProfilePath(p), true, p);
  }
});

test("real folders that merely resemble examples are NOT refused", () => {
  // A false positive bricks a working setup with no override flag.
  for (const p of [
    "/srv/path/to/profile", // "path/to" only counts at the START of the path
    "/home/me/your-profile-backup",
    "/archive/{2024}/profile",
    "/home/me/[old]/profile",
    "C:/Users/youssef/aidgent-profile",
    "/data/dirto/x",
  ]) {
    assert.equal(isPlaceholderProfilePath(p), false, p);
  }
  assert.equal(isPlaceholderProfilePath(""), false);
});

// --- preflight verdicts ------------------------------------------------------

const fakeFs = (existing = []) => ({
  existsSync: (p) => existing.includes(p.replace(/\\/g, "/")),
});

test("every misconfiguration gets its own named verdict, before any browser", () => {
  assert.equal(preflightSession({}).kind, NO_SESSION_CONFIGURED);
  assert.equal(preflightSession({ chromeProfile: "/absolute/path/outside/repo/aidgent-chrome-profile" }).kind, PLACEHOLDER_PROFILE);
  assert.equal(preflightSession({ chromeProfile: "/real/profile" }, { fs: fakeFs([]) }).kind, PROFILE_MISSING);
  assert.equal(preflightSession({ chromeProfile: "/real/profile" }, { fs: fakeFs(["/real/profile"]) }).kind, PROFILE_NEVER_SIGNED_IN);
  const ok = preflightSession({ chromeProfile: "/real/profile" }, {
    fs: fakeFs(["/real/profile", "/real/profile/Default/Cookies"]),
  });
  assert.equal(ok.kind, SESSION_OK);
  assert.equal(ok.ok, true);
});

test("an li_at cookie is a session on its own, whatever the profile line says", () => {
  const v = preflightSession({ chromeProfile: "/absolute/path/outside/repo/aidgent-chrome-profile", liAt: "cookievalue" });
  assert.equal(v.ok, true);
});

test("every refusal names a fix and says nothing was opened", () => {
  for (const v of [
    preflightSession({}),
    preflightSession({ chromeProfile: "/real/profile" }, { fs: fakeFs([]) }),
  ]) {
    assert.ok(v.fix.length > 0);
    assert.match(formatSessionRefusal(v), /Nothing was opened, sourced or written/);
  }
});

test("shouldRememberProfile: only a signed-in profile that carried the session", () => {
  const deps = { fs: fakeFs(["/real/profile", "/real/profile/Default/Cookies"]) };
  assert.equal(shouldRememberProfile({ chromeProfile: "/real/profile" }, deps), true);
  assert.equal(shouldRememberProfile({ chromeProfile: "/real/profile", liAt: "c" }, deps), false,
    "a cookie-borne success proves nothing about the path beside it");
  assert.equal(shouldRememberProfile({ chromeProfile: "/gone" }, { fs: fakeFs([]) }), false);
});

// --- proof: READY means a run actually loaded the feed -----------------------

const tmpProof = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "proof-")), "session-verified.json");

test("no proof file means not verified, with the honest reason", () => {
  const st = sessionProofState({ chromeProfile: "/real/profile", proofPath: tmpProof() });
  assert.equal(st.ok, false);
  assert.match(st.reason, /no run has ever proved/);
  assert.equal(st.command, "npm run check-login");
});

test("a recorded proof verifies the same session and no other", () => {
  const proofPath = tmpProof();
  writeSessionProof({ chromeProfile: "/real/profile" }, { proofPath });
  assert.equal(sessionProofState({ chromeProfile: "/real/profile", proofPath }).ok, true);
  assert.equal(sessionProofState({ chromeProfile: "/REAL/profile/", proofPath }).ok, true,
    "case and trailing slash are the same folder");
  assert.equal(sessionProofState({ chromeProfile: "/other/profile", proofPath }).ok, false,
    "a green tick is never inherited by a session nobody tested");
  assert.equal(sessionProofState({ liAt: "cookie", proofPath }).ok, false,
    "switching to a cookie invalidates a profile proof");
});

test("the cookie's value is never written into the proof", () => {
  const proofPath = tmpProof();
  writeSessionProof({ liAt: "secret-cookie-value" }, { proofPath });
  const raw = fs.readFileSync(proofPath, "utf8");
  assert.ok(!raw.includes("secret-cookie-value"), "the li_at cookie is a secret and stays out of files");
  assert.equal(sessionProofState({ liAt: "secret-cookie-value", proofPath }).ok, true);
  assert.equal(sessionSource({ liAt: "x" }), "li_at cookie");
});

// --- .env write-back ---------------------------------------------------------

const tmpEnv = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "env-")), ".env");

test("upsertDotEnv replaces every duplicate line, not just the first", () => {
  const file = tmpEnv();
  fs.writeFileSync(file, "AIDGENT_CHROME_PROFILE=/old\nOTHER=1\nAIDGENT_CHROME_PROFILE=/older\n");
  upsertDotEnv("AIDGENT_CHROME_PROFILE", "/new", file);
  const env = loadDotEnv(file);
  assert.equal(env.AIDGENT_CHROME_PROFILE, "/new");
  const raw = fs.readFileSync(file, "utf8");
  assert.equal((raw.match(/AIDGENT_CHROME_PROFILE=/g) || []).length, 1);
  assert.match(raw, /OTHER=1/);
});

test("upsertDotEnv keeps CRLF endings and substitutes values literally", () => {
  const file = tmpEnv();
  fs.writeFileSync(file, "A=1\r\nB=2\r\n");
  upsertDotEnv("B", "C:/Users/$&/profile", file);
  const raw = fs.readFileSync(file, "utf8");
  assert.match(raw, /\r\n/);
  assert.equal(loadDotEnv(file).B, "C:/Users/$&/profile");
});

test("upsertDotEnv appends to a missing file", () => {
  const file = tmpEnv();
  upsertDotEnv("K", "v", file);
  assert.equal(loadDotEnv(file).K, "v");
});

test("resolveConfig: a bare --profile flag is not a path", () => {
  const cfg = resolveConfig({ profile: true }, {});
  assert.equal(cfg.chromeProfile, "");
  const cfg2 = resolveConfig({ profile: "/p" }, {});
  assert.equal(cfg2.chromeProfile, "/p");
});

test("resolveConfig carries the v6 budgets with sane defaults", () => {
  const cfg = resolveConfig({}, {});
  assert.equal(cfg.openBudget, 120);
  assert.equal(cfg.inspectBudget, 60);
  const cfg2 = resolveConfig({}, { AIDGENT_OPEN_BUDGET: "80", AIDGENT_INSPECT_BUDGET: "40" });
  assert.equal(cfg2.openBudget, 80);
  assert.equal(cfg2.inspectBudget, 40);
});
