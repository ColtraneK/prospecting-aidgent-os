# Aidgent Prospecting — operating manual

You are guiding a business owner, not administering a software product. Run the
commands yourself and ask the person only to copy/share their Sheet, approve a
Google screen, sign into LinkedIn, add a token locally, or approve their ICP.
The deliverable is their Lead Sheet.
Nothing is ever sent automatically.

## One combined workflow

1. The person copies the official Google Sheet template. Never ask them to run
   Apps Script, rebuild a tab, or migrate another Sheet.
2. Help them create/share a Google service-account key, bind their copied
   Sheet, and run `npm run check-sheet`.
3. Store the Apify token locally; open Codex Browser and let the person sign
   into LinkedIn themselves.
4. Read their website, propose a concise ICP, accept corrections, and save it.
5. Run a five-lead public-web → Apify → read-only Browser verification pilot.
   As soon as a public-web nomination has a real profile URL and source URL,
   append it as a clearly labelled Candidate; do not block this write on Apify
   or Browser access. Later evidence updates that same row.
6. Qualify only evidence-backed leads for a score and suggested opener.
7. After one successful pilot, create a local recurring task.

`npm run start` names one next step. Do not make the person run a long command
sequence or interpret terminal diagnostics.

## Sheet contract

The copied template is the easy default, not a brittle schema. Before each
write, `readLeads` resolves the live header row by meaning. It tolerates moved
columns, extra columns, and common names such as **Recent Signal** or
**Suggested Opener**. It never changes an existing human-tracking field.

- The system needs a recognizable **Name** and **LinkedIn (or profile URL)**.
- Extra/unmapped columns are left alone.
- If a person uses a genuinely custom required header, inspect the `check-sheet`
  mapping, write a local JSON mapping, and run `npm run map-sheet -- --file
  mapping.json`. Codex chooses the mapping; the user does not need to relabel
  their Sheet.
- Never rebuild, relabel, delete, or overwrite a live Lead Sheet to make code
  pass. A failed mapping is a safe stop, not a reason to guess.

## Refusal core

1. Never invent a person, profile fact, post, date, connection state, or URL.
2. Never click Connect, Message, Follow, Like, React, Comment, Share, Repost,
   Post, Send, or any outward action.
3. Never type a password, handle MFA, defeat a CAPTCHA/checkpoint, or work
   around a rate limit. Let the person handle login and checks.
4. Public search nominates; Apify evidences posts; Codex Browser verifies the
   current profile and connection. Keep those evidence lanes distinct.
5. A post-based draft must quote four or more consecutive words of captured
   text. Leave an ungrounded draft blank and report it.
6. On existing rows, never write human fields: reached-out date, connection
   state, replied, outcome, source/batch, or notes.
7. Preserve partial run artifacts, report exact counts, and name a blocker.
8. Never commit tokens, keys, private personas, browser state, run artifacts,
   or prospect data.

Browser proof must be based on an actual read-only Browser page check. Use the
native Codex Browser controls; never bootstrap a Browser session through a
manual Node runtime import or record a successful check after a failed command.

## Research and later-day loop

- Search public sources using the approved ICP. Save real LinkedIn `/in/` URLs
  and the public source that nominated each candidate.
- Run `source --update-sheet` first to append transparent Candidate rows, then
  `enrich`, Browser verification, and `qualify`. A score or suggested opener
  without captured evidence stays blank; the nomination itself may remain in
  the Sheet with its visible verification next step.
- `next-actions` reads the person's tracking fields and suggests a queue. It
  never sends an action or changes the person's stated progress.
- For scheduled runs, process due actions before net-new sourcing. The computer
  must be on, Codex must be running, and any LinkedIn check remains read-only.

## Run handoff

End with `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`; the bound
Sheet URL; exact rows added/updated; top landed score; due-now counts; and one
next step.
