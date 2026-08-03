# Security and trust posture

## What this project does

- Uses public web results to nominate possible prospects.
- Sends explicit LinkedIn profile URLs to the configured Apify actor for recent-post evidence.
- Uses Codex Browser read-only to verify identity, current profile facts, and visible connection state.
- Writes research and suggested next actions to a Google Sheet.

## What it never does

- It never sends a connection request or message.
- It never likes, reacts, comments, shares, reposts, or posts.
- It never types a LinkedIn password, handles MFA, bypasses CAPTCHA, or evades an access control.
- It never treats a search snippet, scraped record, or model guess as confirmed truth.

## Credentials

Keep these outside Git:

- `APIFY_API_TOKEN` in local `.env`.
- The Google service-account JSON file referenced by `GOOGLE_APPLICATION_CREDENTIALS`.
- Any browser session data in the separate Codex Browser profile.

`.env`, `private/`, service-account keys, evidence, and run artifacts are git-ignored. Do not paste tokens into prompts, workshop chats, issues, screenshots, or commits. If a credential is exposed, revoke it and create a replacement immediately.

The Google Sheet should be shared only with the service account's `client_email`, as Editor. The key does not grant access to every file in the user's Drive.

## Browser boundary

The user signs in manually in Codex Browser. Browser activity is inspection only. If LinkedIn shows a checkpoint, CAPTCHA, warning, or unexpected write action, stop and let the user handle it. Do not repeatedly retry.

## Data quality and privacy

- Keep the public source URL and capture timestamp for each candidate.
- Require Browser verification before writing a qualified lead.
- Leave uncertain facts blank and record the uncertainty.
- Store only information appropriate for a professional B2B research workflow.
- Respect applicable site terms, privacy rules, and the user's organizational policy.

The computer must be on and awake for a local scheduled task. Scheduling increases consistency, not authority: scheduled runs remain read-only and never auto-send outreach.
