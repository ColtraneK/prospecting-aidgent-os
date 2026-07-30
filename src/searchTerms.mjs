// searchTerms.mjs — build LinkedIn searches purely from the active persona.
// No hardcoded ICP. Deterministic output (stable ordering) so it is testable.

/** Build a LinkedIn people-search URL from keyword + optional geo hint. */
export function peopleSearchUrl({ keywords, geo } = {}) {
  const params = new URLSearchParams();
  const kw = [keywords, geo].filter(Boolean).join(" ").trim();
  if (kw) params.set("keywords", kw);
  params.set("origin", "GLOBAL_SEARCH_HEADER");
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

/**
 * Construct an ordered, de-duplicated list of search descriptors from a persona.
 * Each descriptor: { title, keywords, geo, url, excludeTerms }.
 * Titles are the primary axis; each is combined with the persona keywords and a
 * geography hint. Exclusions are surfaced so the qualifier can drop bad matches.
 */
export function buildSearches(persona, { maxSearches = 24 } = {}) {
  if (!persona || typeof persona !== "object") return [];
  const titles = arr(persona.buyer_titles);
  const keywords = arr(persona.search_keywords);
  const geos = geoIncludes(persona.geography);
  const excludeTerms = arr(persona.exclusions);

  const searches = [];
  const seen = new Set();
  const geoList = geos.length ? geos : [""];
  const kwList = keywords.length ? keywords : [""];

  for (const title of titles.length ? titles : [""]) {
    for (const geo of geoList) {
      for (const kw of kwList) {
        const keywordString = [title, kw].filter(Boolean).join(" ").trim();
        if (!keywordString && !geo) continue;
        const dedupeKey = `${keywordString}::${geo}`.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        searches.push({
          title: title || null,
          keywords: keywordString || null,
          geo: geo || null,
          excludeTerms,
          url: peopleSearchUrl({ keywords: keywordString, geo }),
        });
        if (searches.length >= maxSearches) return searches;
      }
    }
  }
  return searches;
}

// Read-only LinkedIn surfaces the worker is allowed to open.
export const CONNECTIONS_URL = "https://www.linkedin.com/mynetwork/invite-connect/connections/";
export const SENT_INVITES_URL = "https://www.linkedin.com/mynetwork/invitation-manager/sent/";
export const MESSAGING_URL = "https://www.linkedin.com/messaging/";

/** True when this persona opted in (during setup) to blending existing connections. */
export function includeConnections(persona) {
  return !!(persona && persona.include_connections === true);
}

/**
 * Decide which surfaces a run walks.
 * - explicit --connections  -> ONLY your existing connections
 * - persona opted in        -> connections first (capped share) then net-new search
 * - otherwise               -> net-new search only
 * Pure so it is testable without a browser.
 */
export function buildSources(persona, config = {}, { connectionShare = 0.4 } = {}) {
  if (config.mode === "connections") {
    return [{ url: CONNECTIONS_URL, kind: "connections" }];
  }
  const searches = buildSearches(persona);
  if (!includeConnections(persona)) return searches;
  const target = Number(config.target) > 0 ? Number(config.target) : 25;
  const limit = Math.max(1, Math.ceil(target * connectionShare));
  return [{ url: CONNECTIONS_URL, kind: "connections", limit }, ...searches];
}

function arr(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

/** geography may be an array, a string, or { include: [], exclude: [] }. */
export function geoIncludes(geography) {
  if (!geography) return [];
  if (Array.isArray(geography)) return arr(geography);
  if (typeof geography === "string") return arr(geography);
  if (typeof geography === "object") return arr(geography.include);
  return [];
}

export function geoExcludes(geography) {
  if (geography && typeof geography === "object" && !Array.isArray(geography)) {
    return arr(geography.exclude);
  }
  return [];
}
