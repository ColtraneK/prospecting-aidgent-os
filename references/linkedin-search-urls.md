# LinkedIn search URL grammar

You craft search URLs yourself and open them with
`npm run open -- --url "<url>"`. There is no parser: you read the saved HTML in
`run-artifacts/` and decide who to nominate. This file is the URL grammar.

Always URL-encode: quotes are `%22`, spaces are `%20`, `#` is `%23`.

## Content search — who wrote about this recently

The workhorse. Recency is a property of the search, and each hit arrives with
the post that makes the first message writable.

```
https://www.linkedin.com/search/results/content/?keywords=<QUERY>&datePosted=%22past-week%22
```

- `keywords` supports quoted phrases and boolean operators, e.g.
  `%22client%20onboarding%22%20OR%20%22delivery%20bottleneck%22`.
  Quoted phrases beat bare words: `client delivery` unquoted matches half of
  LinkedIn (that exact term sank the 2026-08-01 pilot); `"client delivery"`
  matches the phrase.
- `datePosted` values (keep the quotes — an unquoted value is silently
  ignored and you get all-time results): `%22past-24h%22`, `%22past-week%22`,
  `%22past-month%22`.
- `sortBy=%22date_posted%22` sorts newest first instead of by relevance.

Do not put a geography into a content search: it matches the text of the post,
and almost nobody types their country into a post. Geography is checked against
the profile the worker opens at inspect time.

## People search — who describes themselves this way

Backfill, for when the content well runs dry. No post comes with the hit, so
expect a blank column D unless their activity page has something.

```
https://www.linkedin.com/search/results/people/?keywords=<QUERY>
```

- `keywords` supports the same quoting and `OR`, e.g.
  `%22fractional%20COO%22%20OR%20%22interim%20operations%22`.
- Useful extra params (values are JSON-ish arrays, URL-encoded):
  - `geoUrn=%5B%22103644278%22%5D` — filter by region URN (103644278 = United
    States; grab a URN by applying the filter in the UI once and copying the URL).
  - `network=%5B%22S%22%5D` — 2nd degree only; `%5B%22F%22%5D` 1st, `%5B%22O%22%5D` 3rd+.

## A post's engagement — who cared enough to act

The highest-intent surface: people who reacted to or commented on a post that
matches your ICP's pain. Open the post itself and read the reactors/commenters
from the saved page:

```
https://www.linkedin.com/feed/update/urn:li:activity:<ID>/
```

- Post permalinks appear in content-search results as
  `/feed/update/urn:li:activity:<ID>/` or `/posts/<slug>_..._activity-<ID>-...`.
  Both open the post with its comment thread rendered.
- Commenters beat likers: a written comment carries a name, a headline, and
  words you can judge. Cross-reference: someone engaging on 2+ relevant posts
  is the strongest signal there is (see references/trigger-signals.md).

## A person's own surfaces

```
https://www.linkedin.com/in/<slug>/                          profile
https://www.linkedin.com/in/<slug>/recent-activity/all/      their posts + comments
```

You rarely need to open these yourself — `npm run inspect` opens both for
every nomination and captures the evidence verbatim.

## What `open` refuses

linkedin.com only, and never a surface whose purpose is an outward action:
messaging/compose URLs, connect/invitation URLs, login/checkpoint pages, and
any `action=` URL. The tool looks; it never touches.
