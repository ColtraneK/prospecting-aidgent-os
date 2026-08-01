---
name: research-outreach-prospects
description: Research LinkedIn prospects for a selected private ICP persona using the local Playwright worker, then maintain a Google Sheet. Read-only research, never sends or connects, human-approved outreach. Use when the user wants to source or refresh prospects, run the scheduled research job, or switch ICP personas.
---

# Research Outreach Prospects

One reusable skill. The ICP is never hardcoded here: it is loaded from a private,
switchable persona so the user can change businesses or audiences without touching
the sourcing code.

## Golden rules

- Read-only. Never Connect, Message, Follow, Like, React, Celebrate, Comment, Share, Repost, or Post. The Suggested Comment and Suggested Intro DM are drafts for the human to send — never send them.
- Never automate login, passwords, MFA, or CAPTCHA. Never bypass bot detection or access controls.
- Never assume whose business this is. The branding in this repo and in the sheet belongs to whoever built the tool, not to the user. Never infer their company, website, offer or audience from it. Ask for their website and wait for the answer.
- Never fabricate activity, dates, quotes, geography, titles, or URLs. Omit what was not verified. If there is no recent post, leave the Recent Post cell and Suggested Comment empty rather than inventing one.
- PRIORITIZE prospects with a post or relevant comment about a persona core topic within the last 7 days. This is a ranking boost, not a gate — still allow strong ICP matches with older or no recent activity. Sourcing searches LinkedIn CONTENT from the past week on those topics before it searches people by title, so recency is found rather than hoped for.
- You may write WORDS. You may never pick PEOPLE. Sourcing, scoring and the accept threshold are deterministic code; the Suggested Comment (I) and Suggested Intro DM (J) are yours to draft.
- For each lead the run writes: the verbatim recent post with its date in column D, its bare permalink in Post Link (E), the observed connection Degree (F), the 1-10 Score (G), and a Why Them (H) built from the scorer's own factors. Columns I and J are left blank for you.
- Draft I and J from the post in column D, then submit them with `npm run validate-outreach -- --drafts drafts.json --update-sheet`. Each draft is checked in code before it is written: under 280 characters (250 for a comment), at least FOUR CONSECUTIVE WORDS quoted from column D, no pipes, no URLs, no word cut in half, correct first name. A draft that fails is left blank with the reason printed — never repair it by hand and never loosen the check.
- A connection Degree ranks a warmer person higher. It never qualifies anybody on its own.
- End any response that finishes a step or a run with the sheet's URL as a link, the rows added/updated and top score, and the single next step.
- Preserve the Sheet's human columns K:Q. Only write agent (A:J) and system (R:AB) fields.
- The Sheet has a **Feedback** tab. Columns A:C are the user's (Date, What to change, Must / Prefer / Avoid). Columns D:F are yours (Status, Applied on, What your agent changed). Never write A:C, never invent a row.
- Requires: computer on and awake, Codex desktop running, a signed-in dedicated Chrome profile. This does NOT run with the computer off.

## Prerequisites

1. `.env` filled from `.env.example` (values live outside the repo).
2. A service-account JSON at `GOOGLE_APPLICATION_CREDENTIALS`, and the target Sheet shared with the service-account email.
3. A signed-in LinkedIn session: EITHER a dedicated Chrome profile path in `AIDGENT_CHROME_PROFILE` (outside the repo), signed into once via setup-login, OR the user's `li_at` cookie pasted into `AIDGENT_LI_AT` in `.env` (headless, no login window). Verify with `npm run check-login`.
4. A selected persona.
5. An EXISTING Google Sheet bound to the persona. Never create a new one and never use sheets.new. Use the user's sheet; if they have none, give them https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy and have them click "Make a copy" themselves. Then `npm run bind-sheet -- --persona <slug> --sheet <id-or-url>` and `npm run check-sheet -- --persona <slug>`. A run refuses to start if no real sheet is bound.

## Persona commands

- List: `npm run list-personas`
- Select: `npm run select-persona -- --persona <slug>`
- Validate: `npm run validate-persona -- --persona <slug>`
- Create from an approved ICP: `npm run create-persona -- --from approved-icp.json --slug <slug>`

If the user has no persona, ask them for their website and ICP (who they sell to,
buyer titles, geography, core topics they post about), run the scan/confirm ICP
steps (steps/1 and steps/2), get explicit approval, then save it as a private
persona under `private/personas/` so future runs reuse it. Nothing is hardcoded
to any one business.

## Procedure

1. Confirm prerequisites and the active persona (`validate-persona`).
2. **Read the Feedback tab before sourcing** — and know that this is enforced:
   a sourcing run REFUSES to start while any feedback row is still New. Run
   `npm run feedback -- --list`, turn each waiting note into a concrete persona
   change (exclusion, geography, buyer title, keyword, core topic), then record
   it with `npm run feedback -- --apply <row> --changed "<what you changed>"`.
   If a note cannot be expressed as a persona change, run
   `npm run feedback -- --needs-decision <row> --reason "<why>"` and raise it
   with the user. Never skip a row silently. `Must` is a hard requirement,
   `Avoid` becomes an exclusion, `Prefer` is a ranking boost and never a gate.
   See AGENTS.md section 4b.
3. First-time only: `npm run setup-login -- --persona <slug>` and have the user sign in manually.
4. Pilot: `npm run pilot -- --persona <slug> --headless`. It runs until 10 leads have been ADDED. Review them before scaling.
5. Full run / scheduled: `npm run source -- --persona <slug> --target 25 --headless --update-sheet`. `--target` counts rows ADDED, not profiles inspected; both numbers are reported and are expected to differ. Never raise `AIDGENT_DAILY_CAP` or shorten the pacing to reach a target.
6. Report: read the run report and Run Log. If a blocker was hit (login, CAPTCHA, checkpoint, rate limit, expiry), stop and tell the user to re-run setup-login or wait.

## Offline check

`npm run dry-run -- --persona <slug> --fixture test/fixtures/dry-run.json` plans a
Sheet update from fixtures and writes nothing. Use it to demonstrate behavior
without a live run.

## Modes

- Local LinkedIn (default): signed-in dedicated profile, richest activity, computer must stay on and awake.
- No signed-in session: the run refuses to start (`npm run check-login` names why). Never substitute web search or your own browsing for a missing session.
- Existing connections (`--connections`, alias `--from-connections`): research people the user is already connected to who match the persona, read-only. Opt-in only; use it only when the user explicitly asks, never as the default.
