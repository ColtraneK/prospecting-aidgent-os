// scoring.mjs — transparent fit scoring. Pure. Prioritizes prospects with
// RECENT (<=7 day) activity ABOUT the persona's core topic, while still allowing
// strong ICP matches with older or no activity. Recency+topic is a boost, not a gate.

import { normalizeText } from "./url.mjs";
import { geoIncludes, geoExcludes } from "./disqualify.mjs";
import { isRecent } from "./recency.mjs";

/** The subjects this ICP cares about: explicit core_topics, else keywords+signals. */
function personaTopics(persona) {
  const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean)
    : typeof v === "string" && v.trim() ? [v.trim()] : []);
  if (!persona || typeof persona !== "object") return [];
  if (Array.isArray(persona.core_topics) && persona.core_topics.length) return arr(persona.core_topics);
  return [...arr(persona.search_keywords), ...arr(persona.buying_signals)];
}

// A required buyer-title match (25) plus one more strong ICP signal — geography
// (12), industry (12), or recent activity (12) — clears this. Recent-topic
// activity boosts rank but is never required, so strong static matches still pass.
export const DEFAULT_ACCEPT_THRESHOLD = 35;

// Factors that RANK but do not QUALIFY: their points order the list and are
// excluded from the number compared against the threshold.
//
// Only connection degree is in here, and it is here because of what it did.
// Degree points were added in v4 without revisiting the bar, and 25 (title) + 10
// (1st degree) is exactly 35 — so knowing someone became a complete substitute
// for the "one more real ICP signal" the threshold was designed to require.
// Half the 2026-08-01 pilot's leads were 1st-degree connections with no
// geography, industry, or activity match at all, and they were accepted by
// arithmetic nobody had noticed.
//
// Rank-only rather than a higher threshold, of the two options in the work
// order, because the two are not equivalent. Raising the bar to 45 also
// disqualifies people whose second signal is real but modest (a size match at 8,
// an older on-topic post at 8), and it would still let a title + 1st degree +
// any 10 points through. Excluding the factor fixes the actual defect: being
// connected to someone is a reason to reach them SOONER, never a reason they
// are a fit. `test/scoring.test.mjs` runs both against the pilot's shape.
export const RANK_ONLY_FACTORS = ["degree_match"];

function anyMatch(haystack, needles) {
  const h = normalizeText(haystack);
  if (!h) return null;
  for (const n of needles) {
    const nn = normalizeText(n);
    if (nn && h.includes(nn)) return n;
  }
  return null;
}

/**
 * Core topics the ICP cares about: explicit core_topics, else keywords + signals.
 * One definition, shared with the content searches that go looking for them —
 * a topic the scorer pays for is a topic the run searched.
 */
export function coreTopics(persona) {
  return personaTopics(persona);
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

  // Network distance, when it was actually observed on the page. A 1st or 2nd
  // degree connection is warmer and ranks higher; 3rd degree still qualifies on
  // the other signals, and an unobserved degree costs nobody anything — it is a
  // gap in what we saw, not a fact about the person.
  const degree = String(candidate.degree || "").trim().toLowerCase();
  const degPts = degree === "1st" ? 10 : degree === "2nd" ? 8 : 0;
  const degDetail = degree
    ? (degPts ? `${degree}-degree connection` : `${degree}-degree connection (no bonus)`)
    : "connection degree not observed";
  add("degree_match", degPts, degDetail);

  // Two numbers, on purpose. `score` is everything, and it is what column T
  // shows and what the list is ranked by — a warm 1st-degree lead still sorts
  // above an identical cold one. `qualifyingScore` is what the threshold sees,
  // and it leaves out the factors that only rank. Reporting one number for both
  // jobs is what let a connection degree buy someone a place in the sheet.
  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  const rankOnlyPoints = factors
    .filter((f) => RANK_ONLY_FACTORS.includes(f.name))
    .reduce((s, f) => s + f.points, 0);
  const qualifyingScore = Math.max(0, score - rankOnlyPoints);

  const accepted = qualifyingScore >= threshold && !!titleHit;
  const rejectedReason = accepted
    ? null
    : !titleHit
      ? "no buyer-title match"
      : rankOnlyPoints > 0
        ? `score ${qualifyingScore} below threshold ${threshold} (the ${rankOnlyPoints}-point connection-degree bonus ranks this person higher but does not qualify them)`
        : `score ${qualifyingScore} below threshold ${threshold}`;

  return { score, qualifyingScore, accepted, rejectedReason, factors, recent, topicHit: !!topicHit };
}

function list(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
