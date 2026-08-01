# Step 4 — Schedule it (local)

Goal: run the same research each weekday without starting it by hand.

Use a **local Codex desktop scheduled task** that runs the deterministic command:

```bash
npm run daily -- --persona my-persona --target 25 --headless --update-sheet
```

`daily` is two things in order: source new people, then the read-only follow-up
pass that records who accepted your connection request and who wrote back. If
sourcing hits a blocker the follow-up half still runs and reports, and the
command still exits nonzero so your scheduler surfaces the failure.

Keep the target near 25. LinkedIn objects to accounts sending much more than
about 30 connection requests a day, and 25 researched leads is already roughly
twenty minutes of real outreach. More rows do not become more conversations.

Scheduled tasks need a paid agent plan (OpenAI Plus, for Codex). Without one
everything still works — you just start the run yourself.

## Honest requirements

This is a local system. For a scheduled run to fire:

- the **computer must be on and awake** (disable sleep for the schedule window),
- **Codex desktop must be running**,
- the dedicated Chrome profile must still be signed in (re-run `setup-login` if a run reports a login/expiry blocker).

It does **not** run with the computer off. There is no cloud worker.

## What a run does

Searches LinkedIn content from the past week on your core topics before it
searches anyone by job title, appends fresh, deduped leads and refreshes existing
ones in your Sheet, never sends or connects, never touches your human columns
K–Q, and writes a Run Log row. If it hits a blocker it stops and exits nonzero,
so a scheduler can surface the failure.

The run leaves the two message columns blank and your agent fills them in a
second pass, checked by `npm run validate-outreach` before anything is written.
A re-run never overwrites them, so a message you edited by hand survives every
scheduled run after it.

## Your daily loop

Open the Sheet. For each new person: read Why Them, read the verbatim recent post
in column D and open its link in E, use or edit the Suggested Comment (I) and Suggested
Intro DM (J), reach out yourself, then tick **Reached Out (K)**.

That tick matters beyond your own tracking — it is what tells tomorrow's
follow-up pass to watch that person. The next morning, **Y–AB** will tell you who
accepted and who replied, so you can spend your twenty minutes on the
conversations that are actually live rather than re-reading the whole list.

Watch the Run Log for blockers. And run `npm run start` any time you want to
confirm the system is still healthy — it is a status check, not just a setup
wizard.
