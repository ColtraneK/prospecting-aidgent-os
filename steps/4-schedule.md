# Step 4 — Schedule it (local)

Goal: run the same research each weekday without starting it by hand.

Use a **local Codex desktop scheduled task** that runs the deterministic command:

```bash
npm run source -- --persona my-persona --target 50 --headless --update-sheet
```

## Honest requirements

This is a local system. For a scheduled run to fire:

- the **computer must be on and awake** (disable sleep for the schedule window),
- **Codex desktop must be running**,
- the dedicated Chrome profile must still be signed in (re-run `setup-login` if a run reports a login/expiry blocker).

It does **not** run with the computer off. There is no cloud worker.

## What a run does

Appends fresh, deduped leads and refreshes existing ones in your Sheet,
prioritizes prospects with a last-7-day post or relevant comment about a core
topic, never sends or connects, never touches your human columns H–N, and writes
a Run Log row. If it hits a blocker it stops and exits nonzero, so a scheduler
can surface the failure.

## Your daily loop

Open the Sheet. For each new person: read Why Them, read the verbatim recent post
in column D and open its link, use or edit the Suggested Comment (F) and Suggested
Intro DM (G), reach out yourself, then track H–N (Reached Out, Replied, Outcome).
Watch the Run Log for blockers.
