# Prospecting Aidgent OS

A reusable, local B2B prospecting template for Codex workshops. It finds timely prospects from public web results, enriches recent LinkedIn activity through Apify, confirms profile and connection details in Codex Browser, and maintains a Google Sheet owned by the user.

It is deliberately read-only: it never sends connection requests, messages, reactions, comments, or posts.

> New user? Start with [START-HERE.md](START-HERE.md). Codex should read [AGENTS.md](AGENTS.md) before doing any setup or research.

## How the evidence flows

```text
Saved ICP + trigger signals
          ↓
Public web search → candidate URL + source snippet
          ↓
Apify → recent LinkedIn post evidence
          ↓
Codex Browser → identity, current profile, connection state
          ↓
Qualification gates → Google Sheet → human outreach
```

No single source is treated as truth. Search results nominate; Apify enriches; Browser verifies; the human decides whether to act.

## Setup

```bash
npm install
npm run init-env
npm run start
```

`npm run start` reports the single next setup step until the system is ready. Setup covers:

1. A copy of the Google Sheet and service-account access.
2. An Apify token stored only in local `.env`.
3. A read-only Codex Browser verification with the user signing in manually.
4. A confirmed, saved ICP persona.

Copy the starter Sheet here, then share your copy with the service account:
<https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy>

If the hosted Sheet template has not yet been upgraded, run the Apps Script in [sheet/BuildLeadSheet.gs](sheet/BuildLeadSheet.gs) in a blank copy. The exact contract is in [sheet/SHEET.md](sheet/SHEET.md).

## A prospect run

Codex performs the search itself and writes a small candidate file with provenance. The commands then make every later stage resumable and auditable:

```bash
npm run source -- --candidates candidates.json
npm run enrich -- --run <run-id>
npm run browser-verify -- --run <run-id> --file browser-verifications.json
npm run qualify -- --run <run-id> --decisions decisions.json
npm run qualify -- --run <run-id> --decisions decisions.json --update-sheet
```

Operational commands:

```bash
npm run status
npm run next-actions
npm run next-actions -- --update-sheet
npm run feedback -- --apply
```

Each run is stored under `private/runs/<run-id>/`. Interrupted Apify batches can resume without losing completed work. Nothing in `private/` or `.env` is tracked by Git.

## Follow-up behavior

The Sheet separates connection state from reply state:

- `Request sent`, not replied → wait, then recheck the connection.
- `Connected`, not reached out → prepare a first message for human review.
- Reached out, not replied → wait five days, then surface a follow-up.
- Replied → review the response and update the outcome.
- 2nd/3rd+ degree → prepare a connection request for the human.

The system writes suggested next actions into system columns; it never changes the human's progress fields or sends the action.

## Scheduled task

After a successful small manual run, create a recurring Codex task using [references/scheduled-task-prompt.md](references/scheduled-task-prompt.md). Run it against this local project, keep the computer awake, and keep the task read-only. The scheduled run checks progress and due follow-ups before sourcing new prospects.

## Reference material

- [references/public-web-sourcing.md](references/public-web-sourcing.md) — search patterns and provenance rules.
- [references/trigger-signals.md](references/trigger-signals.md) — timely reasons to care now.
- [references/outreach-rules.md](references/outreach-rules.md) — grounded, human-reviewed drafting.
- [references/browser-verification.md](references/browser-verification.md) — exact read-only Browser checklist.
- [SECURITY.md](SECURITY.md) — credentials and operating boundaries.

## Tests

```bash
npm test
```

The tests are offline and do not call Google, Apify, or LinkedIn.
