import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearches, geoIncludes, geoExcludes, peopleSearchUrl } from "../src/searchTerms.mjs";

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
