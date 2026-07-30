# Security — the trust posture

Read this before running anything, and say it out loud in any demo.

## What the worker does and does not do

- **Read-only research.** It navigates and extracts. It NEVER clicks Connect, Message, Follow, Like, Celebrate, Support, React, Comment, Share, Repost, or Post.
- **The follow-up pass is read-only too.** It opens your own sent-invitations page, connections list, and message list to record who accepted and who replied. It never accepts, withdraws, replies, sends, or marks anything as read.
- **Never automates login.** It does not type your username, password, or MFA, and never completes a login for you. You sign in manually once, in a headed window.
- **Never bypasses controls.** It does not defeat CAPTCHAs, checkpoints, bot detection, or access controls. On any such page it stops and exits nonzero.
- **No fabrication.** It never invents activity, dates, quotes, geography, titles, or URLs. Unverified fields are left blank.
- **Human-approved outreach.** It drafts Why Them and an opener; you decide and send.
- **No guessed observations.** If the follow-up pass could not read a page, it records `unknown` — never a "no reply" it did not verify — and leaves untouched anything it did not see.

## Credentials and the Chrome profile — the honest version

This system uses a **dedicated persistent Chrome profile** that you sign into
manually. That profile directory **contains authentication cookies and a live
LinkedIn session**. Treat it like a credential:

- Keep the profile path **outside this repo** (`AIDGENT_CHROME_PROFILE`). It is git-ignored by pattern as a backstop, but it should never live in the working tree.
- Anyone with that folder can act as you on LinkedIn. Protect it like a password.
- We do **not** claim "no credentials are stored." A signed-in profile is stored, by design, on your machine only.

## Google Sheets credentials

- Use a **service-account JSON key** referenced by `GOOGLE_APPLICATION_CREDENTIALS`, kept **outside the repo**.
- Share the target Sheet with the service account's `client_email` (Editor).
- `.env`, credentials, tokens, and the key file are git-ignored. The public repo contains only `.env.example` (variable names only).

## Rate and volume discipline

Conservative randomized pacing between actions and a hard **daily cap**
(`AIDGENT_DAILY_CAP`). Keep volumes low. If you would not do it by hand at a
human pace, do not script it. Respect LinkedIn's and every platform's terms.

The practical limit on the human side of this is connection requests: LinkedIn
objects to accounts sending much more than about **30 a day**. That is why the
default target is 25 researched leads — it keeps the outreach you do by hand
inside a range LinkedIn is comfortable with, and 25 is already about twenty
minutes of real work. Raising the target does not produce more conversations.

## Data hygiene

- Real personas, prospect exports, run artifacts, screenshots, traces, and the Chrome profile are all git-ignored. The public repo may contain **only fake examples**.
- The worker preserves your human columns (K–Q) and never deletes leads.

## Operating requirements (not a security feature, but be honest)

Runs require the **computer on and awake** and the **agent app running**. It
does **not** run with the computer off. A pasted `li_at` cookie is a real
credential exactly like the signed-in Chrome profile: anyone holding it can act
as you on LinkedIn. It lives only in your local `.env`, which is git-ignored.
