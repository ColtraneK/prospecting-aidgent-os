# The Lead Sheet

One Google Sheet is the system of record. `npm run qualify` maintains it in
place over the Sheets API: it appends new leads and refreshes research on
existing ones, and it never touches your human tracking. Nothing is auto-sent.

## Tabs

- **Start Here** — how the local system runs.
- **Leads** — the working list. A–J agent output, K–Q your tracking, R–AB system.
- **Feedback** — plain-English notes from you. You write A–C, the agent writes D–F.
- **ICP + Schedule** — your business snapshot and the confirmed ICP.
- **Prompt Library**, **Lists** — reference material and dropdown values.
- **Run Log** — one row per qualify run, appended by the worker.

## Leads columns

| Col | Field | Who writes it |
|---|---|---|
| A | Name | agent |
| B | Title / Company | agent |
| C | LinkedIn (or profile URL) | agent (canonical) |
| D | Recent Post (verbatim + date) | agent (captured first-hand by `inspect`) |
| E | Post Link | agent (the bare permalink, one clean click) |
| F | Degree | agent (1st / 2nd / 3rd, blank when no badge was on the page) |
| G | Score (1-10) | agent (the 0-100 score in T, at reading scale) |
| H | Why Them | agent (the agent's written rationale) |
| I | Suggested Comment | agent (drafted, checked in code before writing) |
| J | Suggested Intro DM | agent (drafted, checked in code before writing) |
| K | Reached Out | you |
| L | Replied | you |
| M | Outcome | you |
| N | Date Added | you / seeded on insert |
| O | Source Type | you / seeded on insert |
| P | Batch | you |
| Q | Notes | you |
| R | Activity Date | system |
| S | Activity Type | system (post / comment / repost) |
| T | Fit Score | system (the agent's raw 0-100 score) |
| U | Last Verified | system |
| V | Canonical Key | system (dedup key) |
| W | Research Source | system |
| X | Research Status | system (New / Refreshed) |
| Y | Connection Status | reserved (unwritten in v6) |
| Z | Reply Status | reserved (unwritten in v6) |
| AA | Last Reply | reserved (unwritten in v6) |
| AB | Follow-up Checked | reserved (unwritten in v6) |

The worker writes **A–J and R–X only**. On an existing lead it refreshes those
fields and leaves **K–Q exactly as you left them**. It never deletes rows, and
a refresh never blanks I or J — a blank draft leaves the earlier one alone.

**Column D** shows whatever post `inspect` actually captured, verbatim. An
older post is shown and marked `(date — older than 7 days)` rather than
dropped. A blank D means nothing was captured — and the run says which kind of
blank it was (they do not post vs. we could not read the page).

**Degree (F)** is copied from the badge on the page, blank when none was
visible, never inferred. **Score (G)** is column T divided by ten and rounded.
**Why Them (H)** is the agent's own stated reason — the thing you argue with.

**Suggested Comment (I)** and **Suggested Intro DM (J)** are drafted by the
agent and checked in code before a cell is written: under 280 characters (250
for a comment), at least **four consecutive words** quoted from column D, no
pipes, no URLs, no word cut in half, greeting the person column A names. A
draft that fails is left blank with the reason reported to the agent — never
repaired, and never written into your Notes column. When column D is blank the
message may ask for the person's view and claim nothing about them; a comment
is not written at all in that state.

## The Feedback tab

Write a sentence, not a config change: *no leads outside the US, Must*, *stop
showing me recruiters, Avoid*. The agent reads the tab at the start of every
`inspect` and `qualify`; an unapplied row prints a **loud warning** (it never
blocks the run), and the agent applies it to the persona and stamps columns
D–F with what changed (`npm run feedback -- --apply`). A note it cannot apply
is marked `Needs a decision` with the reason and raised with you. Your columns
A–C are never written by the system. `Must` is a hard requirement, `Avoid`
becomes a hard exclusion, `Prefer` steers the agent's judgement.

## Dedup and merge

Leads are matched by the canonical LinkedIn URL (column V), falling back to
normalized name + company. A match becomes an in-place refresh; a non-match a
new appended row. Nominations for people already in the sheet are refused at
the gate rather than re-inspected.

## Which sheet does it use?

**One you own.** Never `sheets.new`, and never one this tool made. If you do
not have one, open the template and click **Make a copy** — the copy lands in
your Drive, all tabs built, no data:

<https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy>

Then bind it and prove access:

```bash
npm run bind-sheet  -- --sheet <your-sheet-url>
npm run check-sheet
```

A sheet on an older column layout is refused, not patched — writing v6 values
over old headers would shift every value into the wrong column, including your
own tracking. Take a fresh copy of the template instead.
