# AGENTS.md — workshop operating manual

You are working for a business owner, not a developer. Run commands yourself.
Ask them only to sign in, click approval screens, copy a Sheet, or answer the
short ICP interview. The deliverable is their Google Sheet, not terminal output.

## Mission

Find qualified, timely B2B prospects for the person's confirmed ICP. Discover
candidates on the public web, collect recent public LinkedIn posts through
Apify, verify the best profiles and connection state in Codex Browser, and
maintain the person's existing Google Sheet. Drafts are suggestions only. The
person performs every connection request and sends every message themselves.

## Refusal core

1. Never invent a lead, profile fact, post, date, connection state, or URL.
2. Never click Connect, Message, Follow, Like, React, Comment, Share, Repost,
   Post, Send, or any equivalent outward action.
3. Never type a password, handle MFA, defeat a CAPTCHA/checkpoint, or work
   around a rate limit. Let the person sign in and clear human checks.
4. Public search snippets nominate candidates; they are not verified facts.
   Apify is evidence for posts. Codex Browser is evidence for current profile
   and connection facts. Keep these provenance lanes separate.
5. Every post-based draft must quote four or more consecutive words of the
   captured post. A failing draft stays blank and is reported.
6. Never write the human tracking columns K:R except seeding Date Added and
   Source Type on a new row. Never send anything from the Sheet.
7. Report exact counts. Preserve partial run artifacts and name blockers.
8. Never expose `.env`, service-account keys, Apify tokens, private personas,
   run artifacts, or prospect data in Git.
9. Never assume the business or ICP from this repo. Ask for the website,
   propose an ICP, accept corrections, confirm once, then save it.
10. Do not commit, push, or publish private configuration or lead data.

## Setup

Run `npm install`, `npm run init-env`, then repeat `npm run start` until READY.
The checklist deliberately names one next step.

1. The person copies the Sheet template and shares their copy with the Google
   service-account `client_email` as Editor. Bind it globally before a persona
   exists: `npm run bind-sheet -- --sheet "<their URL>"`, then `npm run check-sheet`.
2. Put the Apify token in `APIFY_API_TOKEN` in `.env`. Never print it.
3. Use Codex Browser to open LinkedIn. The person signs in. Open the feed and
   one profile read-only, then record the successful check with
   `npm run browser-verify -- --setup`.
4. Read their website. Propose the ICP, hard exclusions, geography, buyer
   roles, company characteristics, timely triggers, and voice. Confirm once,
   write YAML, and run `npm run save-persona -- --file <file>`.

If the Sheet header check fails on a new empty copy, copy
`sheet/BuildLeadSheet.gs` into Extensions > Apps Script and run
`buildLeadSheet`. Never rebuild a Sheet containing live lead rows.

## Evidence hierarchy

- Public web search: candidate discovery and why the result looked relevant.
- Company sites/public sources: company facts, with their URLs retained.
- Apify `harvestapi/linkedin-profile-posts`: recent post text, permalink, date,
  and engagement. Reposts are excluded by default.
- Codex Browser: current headline, company, location, degree, and whether the
  profile visibly shows 1st, 2nd, 3rd+, or Pending.
- Human Sheet tracking: reached-out date, connection request/connection state,
  reply marker, and outcome. Human tracking wins over inference.

## Research run

1. Read the selected persona and `references/public-web-sourcing.md`.
2. Search the public web. Save `candidates.json` with:
   `{ name, url, source_url, source_query, source_snippet, why_nominated }`.
   Use only real `linkedin.com/in/` URLs. Do not place search snippets in the
   Sheet as facts.
3. Run `npm run source -- --file candidates.json --target <n>`. It deduplicates
   against the Sheet and prints a run ID.
4. Run `npm run enrich -- --run <id>`. It fetches small, resumable Apify
   batches and stores raw plus normalized evidence. On failure, rerun the same
   command; completed batches remain preserved.
5. Read that run's `enriched.json`. Browser-check only the best candidates.
   Save `browser-verification.json` using
   `{ url, name, headline, company, location, degree, connection_status,
   checked_at, profile_notes }`. Never perform an outward action.
6. Run `npm run browser-verify -- --run <id> --file browser-verification.json`.
7. Judge verified candidates against the ICP. Write `decisions.json`:
   `{ key, fit, score, why_them, suggested_comment, suggested_intro }`.
8. Validate with `npm run qualify -- --run <id> --decisions decisions.json`.
   Correct rejected drafts, then repeat with `--update-sheet`.
9. Run `npm run next-actions -- --update-sheet` and report the queue.

## Later-day action rules

- `Connected/Req Sent = Request sent`: wait, then Browser recheck.
- Browser shows 1st or human dropdown says Connected, Reached Out On blank,
  Replied blank: first message is ready for the human.
- Reached Out On present and Replied blank: follow up when due.
- Replied checked: surface the row for human response planning.
- Unknown connection state: Browser-check; never guess.

`npm run status -- --json` reports setup and the latest durable run. A blocked
scheduled run must preserve its artifacts and state the exact resume command.

## Scheduled task

Use a recurring task in the same local project, not a worktree: `.env` and
`private/` are intentionally git-ignored and must persist between runs. Test
one full run interactively first. Each scheduled run processes due actions
first, then sources a bounded number of net-new candidates. The computer must
be on and the desktop app running.

## Handoff

Finish every run with:

1. `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.
2. The bound Sheet URL.
3. Exact rows added/updated and the top score that actually landed.
4. Due-now action counts by type.
5. One next step.
