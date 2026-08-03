// Small, explicit Apify boundary. Raw Actor output is kept separately; only the
// normalized evidence returned here is allowed into qualification.

import { canonicalizeLinkedInUrl } from "./url.mjs";

export function actorInput(candidates, { maxPosts = 3, lookback = "month" } = {}) {
  return {
    targetUrls: candidates.map((c) => c.url),
    maxPosts: Math.max(1, Math.min(10, Number(maxPosts) || 3)),
    postedLimit: ["24h", "week", "month", "3months", "6months", "year"].includes(lookback) ? lookback : "month",
    includeQuotePosts: true,
    includeReposts: false,
    scrapeReactions: false,
    scrapeComments: false,
    postNestedReactions: false,
    postNestedComments: false,
  };
}

export async function callProfilePosts({ token, actorId = "harvestapi~linkedin-profile-posts", input, timeoutMs = 295000, fetchImpl = fetch }) {
  if (!String(token || "").trim()) throw new Error("APIFY_API_TOKEN is missing");
  const safeActor = String(actorId || "").replace("/", "~");
  if (!/^[A-Za-z0-9_-]+~[A-Za-z0-9_-]+$/.test(safeActor)) throw new Error("invalid Apify Actor id");
  const endpoint = new URL(`https://api.apify.com/v2/acts/${safeActor}/run-sync-get-dataset-items`);
  endpoint.searchParams.set("clean", "true");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Apify returned HTTP ${response.status}: ${safeMessage(body)}`);
    const data = JSON.parse(body);
    if (!Array.isArray(data)) throw new Error("Apify returned a non-array dataset");
    return data;
  } catch (err) {
    if (err?.name === "AbortError") throw new Error("Apify timed out before returning dataset items; rerun this stage to resume");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeApify(candidates, items, { capturedAt = new Date().toISOString() } = {}) {
  const byProfile = new Map(candidates.map((c) => [c.url, []]));
  for (const item of items || []) {
    if (!item || typeof item !== "object" || (item.type && item.type !== "post")) continue;
    const authorUrl = canonicalizeLinkedInUrl(item.author?.linkedinUrl || item.authorUrl || item.profileUrl);
    if (!authorUrl || !byProfile.has(authorUrl)) continue;
    const content = String(item.content || item.text || item.commentary || "").trim();
    const postUrl = String(item.linkedinUrl || item.url || "").trim();
    if (!content && !postUrl) continue;
    byProfile.get(authorUrl).push({
      id: String(item.id || item.postId || ""),
      summary: content,
      url: postUrl,
      date: normalizeDate(item.postedAt || item.postedDate || item.createdAt || item.createdAtTimestamp),
      type: item.resharedPost || item.reposted ? "repost" : item.quotedPost ? "quote" : "post",
      engagement: {
        likes: numberOrBlank(item.engagement?.likes ?? item.numLikes),
        comments: numberOrBlank(item.engagement?.comments ?? item.numComments),
        shares: numberOrBlank(item.engagement?.shares ?? item.numShares),
      },
    });
  }
  return candidates.map((candidate) => {
    const posts = (byProfile.get(candidate.url) || []).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const post = posts.find((p) => p.type !== "repost") || posts[0] || null;
    return {
      ...candidate,
      post,
      posts_captured: posts.length,
      evidence_source: "apify_profile_posts",
      evidence_captured_at: capturedAt,
    };
  });
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return "";
  const raw = typeof value === "number" || /^\d{11,}$/.test(String(value)) ? Number(value) : value;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
function numberOrBlank(value) { const n = Number(value); return Number.isFinite(n) ? n : ""; }
function safeMessage(body) { return String(body || "").replace(/apify_api_[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 400); }
