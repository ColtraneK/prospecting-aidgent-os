# Codex + Playwright — the local worker

The worker (`src/worker.mjs`) drives a **dedicated persistent Chrome profile**
using Playwright's persistent context. This is different from attaching to an
already-open Chrome over localhost CDP: the profile is created and owned by the
worker, lives outside the repo, and you sign into it once. Later runs can be
headless.

## How it works

- **Persistent profile, not CDP attach.** `chromium.launchPersistentContext(profilePath, { channel, headless })`. The profile path comes from `AIDGENT_CHROME_PROFILE` (env) or `--profile`, and must live outside the repo.
- **Installed Chrome channel.** Uses `channel: "chrome"` (configurable via `AIDGENT_CHROME_CHANNEL`) so it drives your real Chrome build where possible.
- **Manual login only.** `npm run setup-login` opens the profile headed so you sign in yourself. The worker never types credentials, MFA, or completes login.
- **Read-only.** It navigates and extracts. It never clicks Connect, Message, Follow, Like, Celebrate, React, Comment, Share, Repost, or Post (`FORBIDDEN_ACTION_LABELS` documents them).
- **Blocker-aware.** After each navigation it checks for login, CAPTCHA, checkpoint, rate-limit, session-expiry, and access-restricted states (`src/blockers.mjs`). On any blocker it stops, records it in the run report, and exits nonzero. It never tries to bypass detection or access controls.
- **Paced + capped.** Conservative randomized delays (`AIDGENT_MIN_DELAY_MS`/`MAX`) and a hard per-run cap (`AIDGENT_DAILY_CAP`).

## What it captures per candidate

Canonical profile URL, current title and company, and — when accessible — recent
posts and comments (activity date, type, url, short evidence summary). It prefers
the last 7 days as a ranking boost but allows strong older evidence. It never
fabricates any field.

## Commands

```bash
# one-time headed login into the dedicated profile
npm run setup-login -- --persona my-persona

# headless research runs
npm run pilot  -- --persona my-persona --headless
npm run source -- --persona my-persona --target 50 --headless --update-sheet
```

## Selectors drift

LinkedIn's DOM changes. The extraction selectors in `src/worker.mjs` are a
resilient starting point; Codex can read the live DOM and adjust them. Keep every
change read-only and keep volumes low.

## Why not a hosted cloud browser

A hosted cloud browser cannot hold your signed-in LinkedIn session, so it cannot
see logged-in activity. That is why local LinkedIn mode uses your own persistent
profile, and why the alternative is the public-web fallback (`--public-web`),
which needs no session but sees less.
