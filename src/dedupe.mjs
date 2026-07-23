// dedupe.mjs — collapse duplicate candidates within a single batch. Pure.

import { canonicalKey } from "./url.mjs";

/**
 * Collapse candidates that resolve to the same canonical key.
 * Keeps the highest-scoring instance; the rest become duplicatesSkipped.
 * `scoreOf` extracts a numeric score from a candidate (default: c.score || 0).
 * Returns { kept: [...], duplicates: [{ candidate, keptKey, reason }] }.
 */
export function dedupeCandidates(candidates, scoreOf = (c) => Number(c.score || 0)) {
  const byKey = new Map();
  const order = [];
  const duplicates = [];

  for (const c of candidates) {
    const { key } = canonicalKey({ url: c.url, name: c.name, company: c.company });
    if (!key) {
      // No usable identity; keep it but it can never dedupe.
      order.push(c);
      continue;
    }
    if (!byKey.has(key)) {
      byKey.set(key, c);
      order.push({ __key: key });
    } else {
      const existing = byKey.get(key);
      if (scoreOf(c) > scoreOf(existing)) {
        duplicates.push({ candidate: existing, keptKey: key, reason: "duplicate canonical key (kept higher score)" });
        byKey.set(key, c);
      } else {
        duplicates.push({ candidate: c, keptKey: key, reason: "duplicate canonical key (kept higher score)" });
      }
    }
  }

  const kept = order.map((o) => (o && o.__key ? byKey.get(o.__key) : o));
  return { kept, duplicates };
}
