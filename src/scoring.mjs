// scoring.mjs — transparent fit scoring. Pure. Prioritizes prospects with
// RECENT (<=7 day) activity ABOUT the persona's core topic, while still allowing
// strong ICP matches with older or no activity. Recency+topic is a boost, not a gate.

import { normalizeText } from "./url.mjs";
import { geoIncludes, geoExcludes } from "./searchTerms.mjs";
import { isRecent } from "./recency.mjs";

// A required buyer-title match (25) plus one more strong ICP signal — geography
// (12), industry (12), or recent activity (12) — clears this. Recent-topic
// activity boosts rank but is never required, so strong static matches still pass.
export const DEFAULT_ACCEPT_THRESHOLD = 35;

function anyMatch(haystack, needles) {
  const h = normalizeText(haystack);
  if (!h) return null;
  for (const n of needles) {
    const nn = normalizeText(n);
    if (nn && h.includes(nn)) return n;
  }
  return null;
}

/** Core topics the ICP cares about: explicit core_topics, else keywords + signals. */
export function coreTopics(persona) {
  if (Array.isArray(persona.core_topics) && persona.core_topics.length) return persona.core_topics;
  return [...list(persona.search_keywords), ...list(persona.buying_signals)];
}

export function scoreCandidate(persona, candidate, { nowMs = Date.now(), threshold = DEFAULT_ACCEPT_THRESHOLD } = {}) {
  const factors = [];
  const add = (name, points, detail) => factors.push({ name, points, detail });

  const titles = list(persona.buyer_titles);
  const industries = list(persona.target_industries);
  const sizes = list(persona.company_sizes);
  const exclusions = list(persona.exclusions);
  const topics = coreTopics(persona);
  const geoInc = geoIncludes(persona.geography);
  const geoExc = geoExcludes(persona.geography);

  const location = candidate.location || candidate.geo || "";
  const activity = candidate.activity || null;

  // Hard rejects first.
  const exclusionHit = anyMatch(
    [candidate.title, candidate.company, candidate.industry, candidate.headline].filter(Boolean).join(" "),
    exclusions,
  );
  if (exclusionHit) return { score: 0, accepted: false, rejectedReason: `matched exclusion: ${exclusionHit}`, factors, recent: false, topicHit: false };
  const geoBlocked = anyMatch(location, geoExc);
  if (geoBlocked) return { score: 0, accepted: false, rejectedReason: `excluded geography: ${geoBlocked}`, factors, recent: false, topicHit: false };

  // Fit factors.
  const titleHit = anyMatch(candidate.title, titles);
  add("title_match", titleHit ? 25 : 0, titleHit ? `title matches "${titleHit}"` : "no buyer-title match");

  const industryHit = candidate.industry ? anyMatch(candidate.industry, industries) : null;
  add("industry_match", industryHit ? 12 : 0, industryHit ? `industry "${industryHit}"` : "industry not confirmed");

  let geoPts = 0, geoDetail = "geography not specified in persona";
  if (geoInc.length) {
    const geoHit = anyMatch(location, geoInc);
    geoPts = geoHit ? 12 : 0;
    geoDetail = geoHit ? `in target geography "${geoHit}"` : "geography not confirmed";
  }
  add("geo_match", geoPts, geoDetail);

  const sizeHit = candidate.companySize ? anyMatch(candidate.companySize, sizes) : null;
  add("size_match", sizeHit ? 8 : 0, sizeHit ? `company size "${sizeHit}"` : "company size not confirmed");

  // The priority signal: recent (<=7d) activity ABOUT a core topic.
  const recent = activity ? isRecent(activity.date, nowMs) : false;
  const topicHit = activity ? anyMatch([activity.summary, candidate.headline].filter(Boolean).join(" "), topics) : null;
  let actPts = 0, actDetail = "no relevant recent activity";
  if (recent && topicHit) { actPts = 30; actDetail = `recent (<=7d) activity about "${topicHit}"`; }
  else if (recent) { actPts = 12; actDetail = "recent activity (topic not confirmed)"; }
  else if (topicHit) { actPts = 8; actDetail = `older activity about "${topicHit}"`; }
  add("recent_topic_activity", actPts, actDetail);

  const evidencePts = activity && (activity.url || activity.summary) ? 8 : 0;
  add("evidence_strength", evidencePts, evidencePts ? "verifiable activity captured" : "no captured activity evidence");

  let score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  const accepted = score >= threshold && !!titleHit;
  const rejectedReason = accepted ? null : !titleHit ? "no buyer-title match" : `score ${score} below threshold ${threshold}`;

  return { score, accepted, rejectedReason, factors, recent, topicHit: !!topicHit };
}

function list(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
