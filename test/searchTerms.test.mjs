import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSearches, geoIncludes, geoExcludes, peopleSearchUrl,
  buildSources, includeConnections, CONNECTIONS_URL,
  contentSearchUrl, buildContentSearches, personaTopics,
} from "../src/searchTerms.mjs";

const persona = {
  buyer_titles: ["Founder", "Operations Lead"],
  search_keywords: ["operations"],
  geography: { include: ["United States"], exclude: ["India"] },
  exclusions: ["Students"],
};

/** What a run walks, minus the connections entry. */
const allSearches = (p) => [...buildContentSearches(p), ...buildSearches(p)];

test("buildSearches is persona-driven with no hardcoded keyword", () => {
  const searches = buildSearches(persona);
  assert.ok(searches.length >= 2);
  const kws = searches.map((s) => s.keywords);
  assert.ok(kws.some((k) => k.includes("Founder")));
  assert.ok(kws.some((k) => k.includes("Operations Lead")));
  assert.ok(kws.every((k) => k.includes("operations")));
  // exclusions carried through for the qualifier
  assert.deepEqual(searches[0].excludeTerms, ["Students"]);
  // uses geography, not a hardcoded default
  assert.ok(searches[0].url.includes("United%20States") || searches[0].geo === "United States");
});

test("empty persona yields no searches", () => {
  assert.deepEqual(buildSearches({}), []);
});

test("geo helpers handle array/string/object", () => {
  assert.deepEqual(geoIncludes(["US", "CA"]), ["US", "CA"]);
  assert.deepEqual(geoIncludes("US"), ["US"]);
  assert.deepEqual(geoIncludes({ include: ["US"], exclude: ["IN"] }), ["US"]);
  assert.deepEqual(geoExcludes({ include: ["US"], exclude: ["IN"] }), ["IN"]);
});

test("peopleSearchUrl encodes keywords", () => {
  const u = peopleSearchUrl({ keywords: "Founder operations", geo: "United States" });
  assert.ok(u.startsWith("https://www.linkedin.com/search/results/people/"));
  assert.ok(u.includes("keywords="));
});

// --- buildSources: which surfaces a run actually walks -----------------------

test("existing connections are NOT mined unless the persona opted in", () => {
  // The pilot chose "warm connections included first" from a "you suggest and
  // proceed", and five of ten leads came back 1st-degree marketers. Warm-first
  // is a real option; it is not a default, and it is not something a persona
  // acquires by an agent's own reasoning.
  assert.equal(includeConnections(persona), false);
  assert.equal(includeConnections({ ...persona, include_connections: "yes" }), false,
    "only an explicit boolean true opts in");
  const sources = buildSources(persona, { target: 25 });
  assert.deepEqual(sources, allSearches(persona));
  assert.ok(!sources.some((s) => s.kind === "connections"));
});

// --- v5: content searches come first, so recency is sourced not hoped for ----

test("a content search asks for the topic and NOT for the geography", () => {
  // A people search matches a profile, where a country is a field. A content
  // search matches the text of a post, where a country is just a phrase almost
  // nobody types — so folding geography into the keywords would return nothing,
  // and an empty content search is diagnosed as benign `no_results`, meaning the
  // run would fall silently back to people search and look like it was working.
  // Geography is checked by the scorer against the profile the worker opened.
  const searches = buildContentSearches(persona);
  assert.ok(searches.length);
  for (const s of searches) {
    assert.equal(s.geo, null);
    assert.ok(!/United%20States|United\+States/.test(s.url), `geography leaked into a content search: ${s.url}`);
  }
  // The people searches, where it belongs, still carry it.
  assert.ok(buildSearches(persona).some((s) => /United\+States|United%20States/.test(s.url)));
});

test("contentSearchUrl filters to the past week, the way LinkedIn's own facet does", () => {
  const u = contentSearchUrl({ keywords: "capacity planning" });
  assert.ok(u.startsWith("https://www.linkedin.com/search/results/content/"), u);
  assert.ok(u.includes("keywords=capacity+planning"), u);
  // The quotes are load-bearing: LinkedIn ignores an unquoted value and
  // silently returns all-time results, which is the exact failure this replaces.
  assert.ok(u.includes("datePosted=%22past-week%22"), u);
  assert.equal(contentSearchUrl({ keywords: "x", datePosted: "" }).includes("datePosted"), false);
});

test("content searches are built from the topics the scorer pays points for", () => {
  // core_topics wins when present; otherwise keywords + buying signals stand in.
  assert.deepEqual(personaTopics({ core_topics: ["capacity"], search_keywords: ["ops"] }), ["capacity"]);
  assert.deepEqual(personaTopics(persona), ["operations"]);
  assert.deepEqual(personaTopics({}), []);

  const searches = buildContentSearches({ ...persona, core_topics: ["capacity", "handoffs"] });
  assert.deepEqual(searches.map((s) => s.topic), ["capacity", "handoffs"]);
  for (const s of searches) {
    assert.equal(s.kind, "content");
    assert.deepEqual(s.excludeTerms, ["Students"]);
    assert.ok(s.url.includes("datePosted"));
  }
  // A persona with nothing to search for produces nothing, rather than an
  // unfiltered all-of-LinkedIn content search.
  assert.deepEqual(buildContentSearches({ buyer_titles: ["Founder"] }), []);
});

test("a run walks CONTENT searches before people searches", () => {
  const sources = buildSources(persona, { target: 25 });
  const kinds = sources.map((s) => s.kind);
  assert.equal(kinds[0], "content", "recency must be searched for, not discovered late");
  assert.ok(kinds.includes("people"), "people search stays as backfill");
  assert.ok(kinds.lastIndexOf("content") < kinds.indexOf("people"),
    `content searches must all precede people searches: ${kinds.join(",")}`);
});

test("opting in puts connections first, capped to a share of the target", () => {
  // The cap is a budget of profiles INSPECTED, and the target counts leads
  // ADDED, so it scales by the inspections one added lead typically costs.
  // Without that conversion, "40% of your run from warm connections" silently
  // became "40% of the target opened", which is nearer a tenth of the run.
  const opted = { ...persona, include_connections: true };
  const sources = buildSources(opted, { target: 25 });
  assert.equal(sources[0].kind, "connections");
  assert.equal(sources[0].url, CONNECTIONS_URL);
  assert.equal(sources[0].limit, 40); // ceil(25 added * 0.4 share * 4 inspections each)
  assert.deepEqual(sources.slice(1), allSearches(opted));
});

test("the cap is always at least one, even for a tiny target", () => {
  const opted = { ...persona, include_connections: true };
  assert.equal(buildSources(opted, { target: 1 })[0].limit, 2);
  assert.equal(buildSources(opted, {})[0].limit, 40); // default target 25
  // A share small enough to round to zero still yields a usable budget.
  assert.equal(buildSources(opted, { target: 1 }, { connectionShare: 0.01, inspectionsPerAdd: 1 })[0].limit, 1);
});

test("--connections walks ONLY your connections", () => {
  const sources = buildSources(persona, { mode: "connections", target: 25 });
  assert.deepEqual(sources, [{ url: CONNECTIONS_URL, kind: "connections" }]);
});

