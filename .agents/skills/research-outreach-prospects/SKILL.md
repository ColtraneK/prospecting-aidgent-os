---
name: research-outreach-prospects
description: Research LinkedIn prospects for the saved ICP persona using the local Playwright worker, then maintain the person's Google Sheet. The agent explores and judges; the code verifies evidence, paces, and writes. Read-only research, never sends or connects, human-approved outreach. Use when the user wants to source prospects or run the research loop.
---

# Research Outreach Prospects

The v6 loop: you explore and judge; the code verifies, paces, and writes.
AGENTS.md is the full manual and outranks this summary.

## Golden rules

- Read-only. Never Connect, Message, Follow, Like, React, Comment, Share,
  Repost, or Post. The drafted comment and DM are for the human to send.
- Never automate login, passwords, MFA, or CAPTCHA. Never bypass detection.
- Never invent a lead, post, fact, or URL. `qualify` refuses any decision
  without evidence `inspect` captured first-hand — do not fight the gate.
- Never write the sheet's human columns K–Q. A refresh never blanks I/J.
- Never raise the daily budgets (120 opens / 60 inspections, persisted) or
  shorten the pacing. Exhausted budgets refuse with the reset time — stop.
- Never assume whose business this is; the persona's `icp` prose is the
  ground truth, and the person confirmed it once.
- End any finishing response with: the sheet URL as a link, rows
  added/updated + top score, and the single next step.

## The loop

1. Craft search URLs from the persona's `topics` — quoted phrases, OR,
   `datePosted="past-week"` — per `references/linkedin-search-urls.md`.
   Hunt the triggers in `references/trigger-signals.md`.
2. `npm run open -- --url "<url>"` and read the saved HTML in
   `run-artifacts/`. A few opens per loop is plenty.
3. Write `nominations.json`: `[{ name, url, why_nominated, source_url }]` —
   whoever you judge worth opening, with the trigger named.
4. `npm run inspect -- --nominations nominations.json`. Apply any Feedback
   warnings to the persona now and stamp them (`npm run feedback -- --apply`).
5. Read `run-artifacts/evidence.json`. Judge each candidate against the
   `icp`; draft per `references/outreach-rules.md`, quoting the captured
   post. Write `decisions.json`:
   `{ key, fit, score: 0-100, why_them, suggested_comment, suggested_intro }`.
6. `npm run qualify -- --decisions decisions.json` to check, then again with
   `--update-sheet` to write. Redraft anything reported, never work around it.

## Blockers

Login/checkpoint/CAPTCHA/rate-limit stop the run safely with artifacts saved.
Relay the named verdict and the fix from AGENTS.md's blocker table; never
retry in a loop. A missing session refuses before any browser opens —
`npm run check-login` proves it, `npm run setup-login` lets the person fix it.
