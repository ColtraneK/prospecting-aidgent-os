import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBlocker, diagnoseEmptyResults } from "../src/blockers.mjs";

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

// A page that loads fine and yields nothing is the failure mode that cost a
// whole pilot run: 209 seconds, 0 profiles, no blocker, and a report that read
// like success. These assertions exist so "we could not read the page" can
// never again be reported as "nobody matched".

test("LinkedIn saying there are no results is benign", () => {
  const d = diagnoseEmptyResults({
    bodyTextSample: "No results found\nTry different keywords or filters.",
    profileLinkCount: 0,
  });
  assert.equal(d.kind, "no_results");
  assert.equal(d.benign, true);
});

test("profile links on the page with zero extracted rows is a parser defect", () => {
  const d = diagnoseEmptyResults({
    bodyTextSample: "Ada Lovelace\nFounder at Analytical\nLondon",
    profileLinkCount: 10,
  });
  assert.equal(d.kind, "parse_failed");
  assert.equal(d.benign, false);
  assert.match(d.reason, /markup has changed/i);
});

test("a page with no text at all never rendered", () => {
  const d = diagnoseEmptyResults({ bodyTextSample: "   ", profileLinkCount: 0 });
  assert.equal(d.kind, "page_not_rendered");
  assert.equal(d.benign, false);
});

test("text but no links and no 'no results' message is not the page we expected", () => {
  const d = diagnoseEmptyResults({ bodyTextSample: "Feed\nJobs\nMy Network", profileLinkCount: 0 });
  assert.equal(d.kind, "no_results_visible");
  assert.equal(d.benign, false);
});

test("no empty-page diagnosis is ever silent", () => {
  for (const state of [{}, { profileLinkCount: 3, bodyTextSample: "x" }, { bodyTextSample: "no results found" }]) {
    const d = diagnoseEmptyResults(state);
    assert.ok(d.kind, "every diagnosis must name a kind");
    assert.ok(d.reason && d.reason.length > 20, "every diagnosis must explain itself in plain English");
    assert.equal(typeof d.benign, "boolean");
  }
});
