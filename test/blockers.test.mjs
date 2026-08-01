import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBlocker, diagnoseEmptyResults, diagnoseActivity } from "../src/blockers.mjs";

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

// --- v5: an empty column D now has to say WHICH kind of empty it is ---------

test("an activity page we could read but that holds nothing is the benign case", () => {
  const d = diagnoseActivity({ itemCount: 0, updateLinks: 0, bodyTextSample: "Rowan hasn't posted yet" });
  assert.equal(d.kind, "activity_none");
  assert.equal(d.benign, true);
});

test("update links with zero captured posts is a parser defect, not a quiet person", () => {
  // This is the one that cost three of ten pilot rows their column D. Reporting
  // it as "they do not post" is a claim about the person; it is a fact about us.
  const d = diagnoseActivity({ itemCount: 0, updateLinks: 6, bodyTextSample: "All activity\nSomething" });
  assert.equal(d.kind, "activity_parse_failed");
  assert.equal(d.benign, false);
  assert.match(d.reason, /markup has changed/i);
});

test("an activity page with no text never rendered, and one with neither is not that page", () => {
  assert.equal(diagnoseActivity({ itemCount: 0, bodyTextSample: "  " }).kind, "activity_not_rendered");
  assert.equal(diagnoseActivity({ itemCount: 0, bodyTextSample: "Jobs\nMy Network" }).kind, "activity_not_visible");
  assert.equal(diagnoseActivity({ itemCount: 0, bodyTextSample: "Jobs" }).benign, false);
});

test("captured posts short-circuit the diagnosis", () => {
  const d = diagnoseActivity({ itemCount: 2, updateLinks: 0, bodyTextSample: "" });
  assert.equal(d.kind, "captured");
  assert.equal(d.benign, true);
});

test("no activity diagnosis is ever silent either", () => {
  for (const state of [{}, { updateLinks: 3, bodyTextSample: "x" }, { bodyTextSample: "hasn't posted" }]) {
    const d = diagnoseActivity(state);
    assert.ok(d.kind, "every diagnosis must name a kind");
    assert.ok(d.reason && d.reason.length > 20, "every diagnosis must explain itself in plain English");
    assert.equal(typeof d.benign, "boolean");
  }
});

test("no empty-page diagnosis is ever silent", () => {
  for (const state of [{}, { profileLinkCount: 3, bodyTextSample: "x" }, { bodyTextSample: "no results found" }]) {
    const d = diagnoseEmptyResults(state);
    assert.ok(d.kind, "every diagnosis must name a kind");
    assert.ok(d.reason && d.reason.length > 20, "every diagnosis must explain itself in plain English");
    assert.equal(typeof d.benign, "boolean");
  }
});
