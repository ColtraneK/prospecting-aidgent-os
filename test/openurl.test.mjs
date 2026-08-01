// The allowlist on `npm run open`: linkedin.com only, read-only surfaces only.
// The agent crafts its own URLs now, so this is the rail that keeps "explore"
// from ever meaning "act".

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOpenUrl } from "../src/worker.mjs";

test("search, profile, activity and post URLs are allowed", () => {
  for (const url of [
    "https://www.linkedin.com/search/results/content/?keywords=%22client%20delivery%22&datePosted=%22past-week%22",
    "https://www.linkedin.com/search/results/people/?keywords=fractional%20coo",
    "https://www.linkedin.com/in/ada-lovelace-7b21/",
    "https://www.linkedin.com/in/ada-lovelace-7b21/recent-activity/all/",
    "https://www.linkedin.com/feed/update/urn:li:activity:7355501234567890123/",
    "https://www.linkedin.com/posts/someone_something-activity-123",
  ]) {
    assert.equal(checkOpenUrl(url).ok, true, url);
  }
});

test("anything off linkedin.com is refused", () => {
  for (const url of [
    "https://example.com/",
    "https://linkedin.com.evil.io/in/x",
    "https://www.google.com/search?q=site:linkedin.com",
  ]) {
    const r = checkOpenUrl(url);
    assert.equal(r.ok, false, url);
  }
});

test("http, garbage, and empty are refused", () => {
  assert.equal(checkOpenUrl("http://www.linkedin.com/in/x").ok, false);
  assert.equal(checkOpenUrl("not a url").ok, false);
  assert.equal(checkOpenUrl("").ok, false);
});

test("message, connect, compose, checkpoint and login URLs are refused", () => {
  for (const url of [
    "https://www.linkedin.com/messaging/",
    "https://www.linkedin.com/messaging/thread/2-abc/",
    "https://www.linkedin.com/checkpoint/challenge/",
    "https://www.linkedin.com/uas/login",
    "https://www.linkedin.com/login",
    "https://www.linkedin.com/signup",
    "https://www.linkedin.com/mynetwork/invitation-manager/sent/",
    "https://www.linkedin.com/mynetwork/invite-connect/connections/",
    "https://www.linkedin.com/in/someone/?action=connect",
    "https://www.linkedin.com/in/someone/?action=message",
  ]) {
    const r = checkOpenUrl(url);
    assert.equal(r.ok, false, url);
    assert.ok(r.reason, "a refusal always says why");
  }
});
