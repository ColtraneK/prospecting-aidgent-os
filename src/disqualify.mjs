// disqualify.mjs — the whole of what code decides about a person in v6.
//
// The agent judges fit; the code verifies evidence and applies HARD
// DISQUALIFIERS only. No points, no threshold, no ranking: a candidate is
// either ruled out by something the person explicitly excluded, or they are
// the agent's call. Pure and testable.

import { normalizeText } from "./url.mjs";

/** geography may be a list, a string, or { include: [], exclude: [] }. */
export function geoIncludes(geography) {
  if (!geography) return [];
  if (Array.isArray(geography) || typeof geography === "string") return arr(geography);
  if (typeof geography === "object") return arr(geography.include);
  return [];
}

export function geoExcludes(geography) {
  if (geography && typeof geography === "object" && !Array.isArray(geography)) {
    return arr(geography.exclude);
  }
  return [];
}

/** The persona's hard exclusion substrings (v6 `hard_exclusions`, v5 `exclusions`). */
export function hardExclusions(persona = {}) {
  return arr(persona.hard_exclusions).concat(arr(persona.exclusions));
}

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
 * Should this candidate be ruled out regardless of what the agent thinks?
 *
 * Three grounds, all of them stated by the person or by the page itself:
 *  - the profile could not be opened (no facts means no row);
 *  - an exclusion substring matches their title/company/headline;
 *  - their observed location misses the geography, when one is set.
 * An UNOBSERVED location disqualifies nobody: a gap in what we saw is not a
 * fact about where they are.
 *
 * @returns {{disqualified: boolean, reason: string}}
 */
export function disqualify(persona = {}, candidate = {}) {
  if (candidate.unreachable) {
    return { disqualified: true, reason: `profile could not be opened${candidate.unreachableReason ? `: ${candidate.unreachableReason}` : ""}` };
  }
  const exclusionHit = anyMatch(
    [candidate.title, candidate.company, candidate.headline].filter(Boolean).join(" "),
    hardExclusions(persona),
  );
  if (exclusionHit) return { disqualified: true, reason: `matched hard exclusion: ${exclusionHit}` };

  const location = String(candidate.location || "").trim();
  const geoBlocked = anyMatch(location, geoExcludes(persona.geography));
  if (geoBlocked) return { disqualified: true, reason: `excluded geography: ${geoBlocked}` };
  const includes = geoIncludes(persona.geography);
  if (includes.length && location && !anyMatch(location, includes)) {
    return { disqualified: true, reason: `outside target geography (observed "${location}")` };
  }
  return { disqualified: false, reason: "" };
}

function arr(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
