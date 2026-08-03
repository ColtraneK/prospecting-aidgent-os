import { test } from "node:test";
import assert from "node:assert/strict";
import { actorInput, callProfilePosts, normalizeApify } from "../src/apify.mjs";

const candidate = { name: "Ada", url: "https://www.linkedin.com/in/ada-nkem", source_url: "https://example.org" };

test("Apify input is bounded and avoids expensive nested scraping", () => {
  const input = actorInput([candidate], { maxPosts: 99, lookback: "nonsense" });
  assert.deepEqual(input.targetUrls, [candidate.url]);
  assert.equal(input.maxPosts, 10);
  assert.equal(input.postedLimit, "month");
  assert.equal(input.includeReposts, false);
  assert.equal(input.scrapeComments, false);
  assert.equal(input.scrapeReactions, false);
});

test("the Apify token is sent in a header, not placed in the URL", async () => {
  let seen;
  const fakeFetch = async (url, options) => {
    seen = { url: String(url), options };
    return { ok: true, status: 200, text: async () => "[]" };
  };
  await callProfilePosts({ token: "secret-token", input: {}, fetchImpl: fakeFetch });
  assert.doesNotMatch(seen.url, /secret-token/);
  assert.equal(seen.options.headers.authorization, "Bearer secret-token");
});

test("raw Actor posts are matched to their profile and normalized", () => {
  const rows = normalizeApify([candidate], [{
    id: "p1",
    author: { linkedinUrl: "https://linkedin.com/in/ada-nkem/?trk=post" },
    content: "We are hiring an operations leader this month.",
    linkedinUrl: "https://www.linkedin.com/posts/ada_p1",
    postedAt: "2026-08-02T10:00:00Z",
    engagement: { likes: 12, comments: 3 },
  }], { capturedAt: "2026-08-03T12:00:00Z" });
  assert.equal(rows[0].posts_captured, 1);
  assert.match(rows[0].post.summary, /hiring/);
  assert.equal(rows[0].post.engagement.likes, 12);
  assert.equal(rows[0].evidence_source, "apify_profile_posts");
});
