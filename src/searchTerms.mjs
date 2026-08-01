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
 * Build a LinkedIn CONTENT-search URL, filtered to posts from the last week.
 *
 * This is the axis flip. A people search asks "who describes themselves this
 * way", and recency is then something you hope for at profile-inspection time —
 * which is why half a run's column D came back blank or years old. A content
 * search asks "who was talking about this in the last seven days", so recency is
 * a property of the search itself and the post is captured with the candidate
 * rather than hunted for afterwards.
 *
 * `datePosted` is quoted because that is the literal value LinkedIn's own facet
 * puts in the query string (`datePosted=%22past-week%22`); an unquoted value is
 * ignored and you silently get all-time results, which is the failure mode this
 * whole job exists to remove.
 */
export function contentSearchUrl({ keywords, geo, datePosted = "past-week" } = {}) {
  const params = new URLSearchParams();
  const kw = [keywords, geo].filter(Boolean).join(" ").trim();
  if (kw) params.set("keywords", kw);
  if (datePosted) params.set("datePosted", `"${datePosted}"`);
  params.set("origin", "FACETED_SEARCH");
  return `https://www.linkedin.com/search/results/content/?${params.toString()}`;
}

/**
 * The subjects this ICP cares about, in priority order: explicit `core_topics`,
 * else the keywords and buying signals.
 *
 * Defined here rather than in scoring.mjs because BOTH now need it — content
 * searches are built from the same topics the scorer pays 30 points for, so a
 * topic that earns points is a topic the run actually searched. scoring.mjs
 * imports it from here; the reverse would be a cycle.
 */
export function personaTopics(persona) {
  if (!persona || typeof persona !== "object") return [];
  if (Array.isArray(persona.core_topics) && persona.core_topics.length) return arr(persona.core_topics);
  return [...arr(persona.search_keywords), ...arr(persona.buying_signals)];
}

/**
 * Content searches: one per topic, filtered to the past week.
 *
 * DELIBERATELY WITHOUT GEOGRAPHY. A people search matches a profile, where
 * "United States" is a field and adding it narrows sensibly. A content search
 * matches the TEXT OF A POST, where "United States" is just a phrase — so
 * folding the geography into the keywords asks for posts that happen to contain
 * the name of a country, which almost none do. That would return near-nothing on
 * every content search, and an empty content search is diagnosed as the benign
 * `no_results`, so the run would fall quietly back to people search and look
 * exactly like it was working.
 *
 * Geography is not lost by leaving it out: `scoreCandidate` checks the
 * candidate's own location against the persona's include/exclude lists, on the
 * profile this worker opened itself. Filtering on where someone actually is
 * beats filtering on whether they typed a country name.
 *
 * Each descriptor: { kind:"content", topic, keywords, geo, url, excludeTerms }.
 */
export function buildContentSearches(persona, { maxSearches = 12, datePosted = "past-week" } = {}) {
  if (!persona || typeof persona !== "object") return [];
  const topics = personaTopics(persona);
  if (!topics.length) return [];
  const excludeTerms = arr(persona.exclusions);

  const searches = [];
  const seen = new Set();
  for (const topic of topics) {
    const dedupeKey = topic.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    searches.push({
      kind: "content",
      topic,
      title: null,
      keywords: topic,
      geo: null, // see above: geography is scored on the profile, not searched in the post
      excludeTerms,
      url: contentSearchUrl({ keywords: topic, datePosted }),
    });
    if (searches.length >= maxSearches) return searches;
  }
  return searches;
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
          kind: "people",
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
 *
 * `limit` is a budget of profiles INSPECTED on that source, and the target now
 * counts leads ADDED, so the two are no longer the same unit. `inspectionsPerAdd`
 * converts: reaching one added lead costs several profiles opened, because most
 * people inspected do not qualify. Without it, "40% of the run from your warm
 * connections" quietly became "40% of the target opened from your connections",
 * which is nearer 10%.
 */
export function buildSources(persona, config = {}, { connectionShare = 0.4, inspectionsPerAdd = 4 } = {}) {
  if (config.mode === "connections") {
    return [{ url: CONNECTIONS_URL, kind: "connections" }];
  }
  // Content first, people second. The order IS the fix: whoever a content
  // search returns arrives with a dated, on-topic post already attached, and
  // the run only falls back to headline matching once those are exhausted.
  const searches = [...buildContentSearches(persona), ...buildSearches(persona)];
  if (!includeConnections(persona)) return searches;
  const target = Number(config.target) > 0 ? Number(config.target) : 25;
  const limit = Math.max(1, Math.ceil(target * connectionShare * inspectionsPerAdd));
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
