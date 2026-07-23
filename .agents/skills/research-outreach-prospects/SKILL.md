---
name: research-outreach-prospects
description: Research LinkedIn prospects for a selected private ICP persona using the local Playwright worker, then maintain a Google Sheet. Read-only research, never sends or connects, human-approved outreach. Use when the user wants to source or refresh prospects, run the scheduled research job, or switch ICP personas.
---

# Research Outreach Prospects

One reusable skill. The ICP is never hardcoded here: it is loaded from a private,
switchable persona so the user can change businesses or audiences without touching
the sourcing code.

## Golden rules

- Read-only. Never Connect, Message, Follow, Like, React, Celebrate, Comment, Share, Repost, or Post.
- Never automate login, passwords, MFA, or CAPTCHA. Never bypass bot detection or access controls.
- Never fabricate activity, dates, quotes, geography, titles, or URLs. Omit what was not verified.
- Prefer activity from the last 7 days as a ranking boost, but allow strong ICP matches without recent activity.
- Preserve the Sheet's human columns G:M. Only write agent (A:F) and system (N:T) fields.
- Requires: computer on and awake, Codex desktop running, a signed-in dedicated Chrome profile. This does NOT run with the computer off.

## Prerequisites

1. `.env` filled from `.env.example` (values live outside the repo).
2. A service-account JSON at `GOOGLE_APPLICATION_CREDENTIALS`, and the target Sheet shared with the service-account email.
3. A dedicated Chrome profile path in `AIDGENT_CHROME_PROFILE` (outside the repo), signed into LinkedIn once via setup-login.
4. A selected persona.
5. An EXISTING Google Sheet bound to the persona. Never create a new one and never use sheets.net. Use the user's sheet (or File > Make a copy of a template), then `npm run bind-sheet -- --persona <slug> --sheet <id-or-url>` and `npm run check-sheet -- --persona <slug>`. A run refuses to start if no real sheet is bound.

## Persona commands

- List: `npm run list-personas`
- Select: `npm run select-persona -- --persona <slug>`
- Validate: `npm run validate-persona -- --persona <slug>`
- Create from an approved ICP: `npm run create-persona -- --from approved-icp.json --slug <slug>`

If the user has no persona, run the scan/confirm ICP steps (steps/1 and steps/2),
get explicit approval, then create a private persona under `private/personas/`.

## Procedure

1. Confirm prerequisites and the active persona (`validate-persona`).
2. First-time only: `npm run setup-login -- --persona <slug>` and have the user sign in manually.
3. Pilot: `npm run pilot -- --persona <slug> --headless`. Review the 10-lead output before scaling.
4. Full run / scheduled: `npm run source -- --persona <slug> --target 50 --headless --update-sheet`.
5. Report: read the run report and Run Log. If a blocker was hit (login, CAPTCHA, checkpoint, rate limit, expiry), stop and tell the user to re-run setup-login or wait.

## Offline check

`npm run dry-run -- --persona <slug> --fixture test/fixtures/dry-run.json` plans a
Sheet update from fixtures and writes nothing. Use it to demonstrate behavior
without a live run.

## Modes

- Local LinkedIn (default): signed-in dedicated profile, richest activity, computer must stay on and awake.
- Public-web fallback (`--public-web`): no signed-in session, public profiles and external sources only, lower activity visibility.
