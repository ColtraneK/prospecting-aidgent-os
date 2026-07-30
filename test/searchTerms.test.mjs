import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSearches, geoIncludes, geoExcludes, peopleSearchUrl,
  buildSources, includeConnections, CONNECTIONS_URL,
} from "../src/searchTerms.mjs";

const persona = {
  buyer_titles: ["Founder", "Operations Lead"],
  search_keywords: ["operations"],
  geography: { include: ["United States"], exclude: ["India"] },
  exclusions: ["Students"],
};

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
  assert.equal(includeConnections(persona), false);
  const sources = buildSources(persona, { target: 25 });
  assert.deepEqual(sources, buildSearches(persona));
  assert.ok(!sources.some((s) => s.kind === "connections"));
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
  assert.deepEqual(sources.slice(1), buildSearches(opted));
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

