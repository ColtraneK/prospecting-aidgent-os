# Aidgent Prospecting

A guided Codex workshop repo for one job: turn an approved B2B ICP into
evidence-backed leads in the person's copied Google Sheet. It is research and
drafting only—nothing is ever sent automatically, connected, reacted, commented, or posted.

## The experience

The user copies one ready-made Sheet, shares it with a Google service account,
approves an ICP, and runs a five-lead pilot. Codex then:

```text
public-web discovery → visible candidate queue → Apify post evidence
→ read-only LinkedIn verification → qualification → the same Lead Sheet
```

`START-HERE.md` is the paste-ready kickoff. Codex runs the commands and guides
one human action at a time.

## A Sheet that does not break when people use it

The template has a simple visible Leads table. The worker resolves columns by
their names and aliases every time it writes, so moved columns, added columns,
and ordinary renames are safe. Human tracking is semantic rather than tied to
K:R; existing progress is never changed. For an unusual custom name, Codex can
save a local header mapping with `npm run map-sheet -- --file mapping.json`.
It never rebuilds or rewrites a live Sheet just to satisfy a schema check.

## Setup and commands

```bash
npm install
npm run init-env
npm run start
```

The start command gives the next setup step. A full researched run uses:

```bash
npm run source -- --file candidates.json --target 5 --update-sheet
npm run enrich -- --run <run-id>
npm run browser-verify -- --run <run-id> --file browser-verifications.json
npm run qualify -- --run <run-id> --decisions decisions.json --update-sheet
npm run next-actions -- --update-sheet
```

Run `npm test` for offline checks. Keep `.env`, service-account keys, local
personas, browser state, and `private/` out of Git.

`source --update-sheet` is intentionally the first write: it adds only deduped
**Candidate** rows, labels them as public-web nominations, and leaves all human
tracking blank. It never claims that a profile, post, or connection was verified.
