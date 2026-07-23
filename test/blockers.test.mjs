import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBlocker } from "../src/blockers.mjs";

test("detects login/checkpoint/captcha/rate-limit/expiry/access", () => {
  assert.equal(detectBlocker({ url: "https://www.linkedin.com/login" }).kind, "login");
  assert.equal(detectBlocker({ url: "https://www.linkedin.com/checkpoint/challenge" }).kind, "checkpoint");
  assert.equal(detectBlocker({ bodyTextSample: "Please verify you are a human (reCAPTCHA)" }).kind, "captcha");
  assert.equal(detectBlocker({ bodyTextSample: "You've reached the weekly limit" }).kind, "rate_limit");
  assert.equal(detectBlocker({ bodyTextSample: "Your session has expired, please sign in again" }).kind, "session_expired");
  assert.equal(detectBlocker({ bodyTextSample: "Sign in to see this profile" }).kind, "access_restricted");
});

test("http status codes trigger blockers", () => {
  assert.equal(detectBlocker({ httpStatus: 429 }).kind, "rate_limit");
  assert.equal(detectBlocker({ httpStatus: 403 }).kind, "access_restricted");
  assert.equal(detectBlocker({ httpStatus: 401 }).kind, "login");
});

test("a normal profile page is not blocked", () => {
  const r = detectBlocker({
    url: "https://www.linkedin.com/in/sam-rivera-fake",
    title: "Sam Rivera | LinkedIn",
    bodyTextSample: "Founder at Bright Ops. Austin, United States. Activity...",
    httpStatus: 200,
  });
  assert.equal(r.blocked, false);
  assert.equal(r.kind, null);
});
