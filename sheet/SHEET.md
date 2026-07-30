# The Lead Sheet

One Google Sheet is the system of record. The research worker maintains it in
place over the Sheets API: it appends new leads and refreshes research on
existing ones, and it never touches your human tracking. Nothing is auto-sent.

## Tabs (built by `BuildLeadSheet.gs`)

- **Start Here** — how the local system runs and the daily loop.
- **Leads** — the working list. A–G agent output, H–N your tracking, O–Y system research and follow-up.
- **Feedback** — plain-English notes from you about what to change. You write A–C, the agent writes D–F.
- **ICP + Schedule** — your business snapshot, the locked five-line ICP, and run settings. Mirrors a persona.
- **Prompt Library** — prompts to build a persona; sourcing and scheduling run via the skill / npm, not by pasting.
- **Lists** — dropdown values and the quality bar.
- **Run Log** — one row per run (appended by the worker). A run that inspected
  nobody always carries a reason in **Blocker / Failure**; a blank there with a
  zero next to it would be a bug, not a quiet day.

## Leads columns

| Col | Field | Who writes it |
|---|---|---|
| A | Name | agent |
| B | Title / Company | agent |
| C | LinkedIn (or profile URL) | agent (canonical) |
| D | Recent Post (verbatim + link) | agent (verbatim if within 7 days, link after) |
| E | Why Them | agent |
| F | Suggested Comment | agent (reply to their recent post/comment) |
| G | Suggested Intro DM | agent (short, no pitch) |
| H | Reached Out | you (checkbox) |
| I | Replied | you (checkbox) |
| J | Outcome | you (No response / Neutral / Positive / Not a fit / Follow up) |
| K | Date Added | you / seeded on insert |
| L | Source Type | you / seeded on insert |
| M | Batch | you |
| N | Notes | you |
| O | Activity Date | system |
| P | Activity Type | system (post / comment) |
| Q | Fit Score | system |
| R | Last Verified | system |
| S | Canonical Key | system (dedup key) |
| T | Research Source | system |
| U | Research Status | system (New / Refreshed / Needs review) |
| V | Connection Status | follow-up pass (connected / pending / not_connected / unknown) |
| W | Reply Status | follow-up pass (replied / no_reply / unknown) |
| X | Last Reply | follow-up pass (their latest message to you, verbatim, + date) |
| Y | Follow-up Checked | follow-up pass (date it last observed this row) |

The worker writes **A–G and O–Y only**. On an existing lead it refreshes those
fields and leaves **H–N exactly as you left them**. It never deletes rows.

Column **D** always shows whatever post was actually captured. If it is older
than seven days it is shown anyway, explicitly marked `(date — older than 7
days)`, so a suggested comment in F is never left pointing at a post you cannot
see. A blank D means nothing was captured at all.

## The follow-up pass (V–Y)

`npm run follow-up` — also the second half of `npm run daily` — opens three of
**your own** pages read-only: sent invitations, your connections list, and your
message list. It records who accepted and who wrote back. It clicks nothing that
accepts, withdraws, replies, sends, or withdraws an invite.

Only rows where **you** ticked **Reached Out (H)** are watched. Ticking that box
is what opts a person in.

Two behaviours that look like bugs and are not:

- A surface it could not read records `unknown`, never a guessed `no_reply`. An
  unread messaging page is not evidence that nobody replied.
- A field it did not observe on a given pass is **left alone**, not blanked. A
  reply recorded last week survives a pass that could not read messaging today.

People are matched across those pages by canonical profile URL where one exists,
and by normalized name where LinkedIn only exposes a name (the messaging list
does not carry profile links).

## The Feedback tab

The deterministic sourcing code must never read free text. If a language model
sat inside the sourcing loop deciding who qualifies, the no-fabrication
guarantee would be gone. So the loop is:

1. The person writes a plain-English note: *no leads outside the US*, *prefer
   people who comment on posts often*, *only people with a PMP certification*.
2. Before the next run the **agent** reads every row whose Status is not
   `Applied`, and turns each one into a concrete persona change — an exclusion,
   a geography rule, a title, a keyword, a core topic.
3. It writes back what it changed, and the unchanged worker reads the persona.

`Must` is a hard filter, `Avoid` becomes an exclusion, and `Prefer` is a ranking
preference rather than a gate. A row the agent cannot express as a persona
change is marked `Needs a decision` with the reason, never silently dropped.

This loop is enforced by code, not etiquette: **a sourcing run refuses to start
while any row is still New.** The agent works the queue with
`npm run feedback -- --list` and records each outcome with
`npm run feedback -- --apply <row> --changed "..."` (or `--needs-decision`),
which stamps columns D–F. Your columns A–C are never written by the system.

This tab is the audit trail of why the targeting looks the way it does.

## Dedup and merge

Leads are matched by the canonical LinkedIn URL (column S), falling back to
normalized name + company. A match becomes an in-place refresh; a non-match
becomes a new appended row; within-run duplicates are collapsed to the highest
fit score.

## Which sheet does it use?

**One you own.** Never `sheets.new`, and never one this tool made for you. Open
the sheet you already use — or, if you do not have one, open the template below
and click **Make a copy**. The copy lands in your Drive under your ownership,
with all seven tabs, headers, dropdowns, and the ⚡ Aidgent OS menu already
built, and no data in it:

<https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy>

Either way, **bind that sheet** so the worker maintains it:

```bash
npm run bind-sheet  -- --persona <slug> --sheet <your-sheet-id-or-url>
npm run check-sheet -- --persona <slug>   # confirms access + lists the tabs
```

`check-sheet` prints the sheet title and tabs and confirms it will be used in
place. A live run refuses to start if no real sheet is bound — the tool never
creates a new spreadsheet.

## Build / refresh

The ⚡ Aidgent OS menu offers **Clear the Leads list** and **About**, and
deliberately does not offer a Build button. Copies of the template arrive fully
built, so a one-click rebuild in front of a non-technical person can only make
things worse. `buildAidgentOsSheet` is run deliberately from
Extensions > Apps Script > Run when someone brings their own sheet.

Copies of the template already have this built and need nothing here. If you
brought your own sheet: open **that** Sheet (the one you bound) → Extensions >
Apps Script → paste
`BuildLeadSheet.gs` → run `buildAidgentOsSheet`. The script is container-bound and
only edits the spreadsheet it lives in. **Re-running is safe:** it refreshes headers, formatting,
validation, and the static tabs but preserves Leads data, your H–N tracking,
your ICP + Schedule inputs, and Run Log history. Clearing leads is a separate
action that requires typing `CLEAR` to confirm.

The builder places headers on **row 3** (data from row 4). The worker also
auto-detects the header row, so it can maintain a sheet whose headers sit
elsewhere and will add the O–Y columns if they are missing — an older sheet
built before the follow-up columns existed gains them on its next run.

## Sourcing from existing connections (optional)

By default the worker sources new people. Add `--connections` (alias
`--from-connections`) to instead research people you're already connected to who
match the persona. It reads your connections list read-only and writes the same
columns. Opt-in only; never the default.

You are also asked once during setup whether ordinary runs should mine your
existing connections first — the warm, low-hanging-fruit list nobody works. That
answer is saved as `include_connections` in your persona. When it is on, matches
found among your connections are searched first and labelled **Connection** in
Source Type (L), so warm rows are obvious at a glance.
