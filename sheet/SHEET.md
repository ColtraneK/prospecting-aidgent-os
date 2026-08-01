# The Lead Sheet

One Google Sheet is the system of record. The research worker maintains it in
place over the Sheets API: it appends new leads and refreshes research on
existing ones, and it never touches your human tracking. Nothing is auto-sent.

## Tabs (built by `BuildLeadSheet.gs`)

- **Start Here** — how the local system runs and the daily loop.
- **Leads** — the working list. A–J agent output, K–Q your tracking, R–AB system research and follow-up.
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
| D | Recent Post (verbatim + date) | agent (verbatim text and its date) |
| E | Post Link | agent (the bare permalink, so it stays one clean click) |
| F | Degree | agent (1st / 2nd / 3rd, blank when the badge was not on the page) |
| G | Score (1-10) | agent (the Fit Score in column T, at reading scale) |
| H | Why Them | agent |
| I | Suggested Comment | agent (drafted from column D, checked in code) |
| J | Suggested Intro DM | agent (drafted from column D, checked in code) |
| K | Reached Out | you (checkbox) |
| L | Replied | you (checkbox) |
| M | Outcome | you (No response / Neutral / Positive / Not a fit / Follow up) |
| N | Date Added | you / seeded on insert |
| O | Source Type | you / seeded on insert |
| P | Batch | you |
| Q | Notes | you |
| R | Activity Date | system |
| S | Activity Type | system (post / comment) |
| T | Fit Score | system (raw 0-100) |
| U | Last Verified | system |
| V | Canonical Key | system (dedup key) |
| W | Research Source | system |
| X | Research Status | system (New / Refreshed / Needs review) |
| Y | Connection Status | follow-up pass (connected / pending / not_connected / unknown) |
| Z | Reply Status | follow-up pass (replied / no_reply / unknown) |
| AA | Last Reply | follow-up pass (their latest message to you, verbatim, + date) |
| AB | Follow-up Checked | follow-up pass (date it last observed this row) |

The worker writes **A–J and R–AB only**. On an existing lead it refreshes those
fields and leaves **K–Q exactly as you left them**. It never deletes rows.

Column **D** always shows whatever post was actually captured. If it is older
than seven days it is shown anyway, explicitly marked `(date — older than 7
days)`, so a suggested comment in I is never left pointing at a post you cannot
see. A blank D means nothing was captured at all. The post's permalink sits on
its own in **E**, where Sheets renders it as a single clickable link instead of
burying it under a quoted paragraph.

**Degree (F)** is copied from the badge LinkedIn shows on the card or profile.
It is blank when no badge was visible, and never guessed. Everyone found through
your own connections list is 1st by definition. A 1st or 2nd degree contact
sorts higher in the list, because they are warmer — but those points are
**ranking only** and are left out of the score the accept threshold sees. Being
connected to someone is a reason to reach them sooner, never evidence that they
fit. A 3rd degree contact qualifies on everything else exactly as before.

**Score (G)** is column T divided by ten and rounded, nothing more. It exists
because "72" and "8 out of 10" take different amounts of effort to read at
speed, and the raw score is still there in T when you want it.

**Why Them (H)** is the scorer's own factor breakdown — "title matches
'Fractional COO'; in target geography 'United States'; recent (<=7d) activity
about 'capacity'" — so a 6 out of 10 can be argued with. It is not a summary of
their headline.

**Suggested Comment (I)** and **Suggested Intro DM (J)** are the only cells a
model writes. A run leaves them blank and captures the evidence instead; the
agent then drafts them from the post in column D, and `npm run validate-outreach`
checks each draft **in code** before it is written: under 280 characters (250 for
a comment), at least four consecutive words quoted from column D, no pipes, no
URLs, no word cut in half, and greeting the person column A names. A draft that
fails is left blank with the reason printed to the agent — never repaired, and
never explained in your Notes column, which nothing here writes.

That four-word rule is the point of the whole arrangement. A message about a post
nobody wrote reads perfectly well; quoting four consecutive words of a post is
something only a reader can do. When column D is blank the message may ask for
your prospect's view and say who you work with, and may claim nothing about them
— no post, no article, no "I saw you have been…". A comment is not written at
all in that state, because there is nothing to comment on.

Re-running a search never blanks I or J. Every other agent column is re-derived
from what that run saw; these two are left alone, so a scheduled run cannot erase
the messages you or your agent already wrote.

## The follow-up pass (Y–AB)

`npm run follow-up` — also the second half of `npm run daily` — opens three of
**your own** pages read-only: sent invitations, your connections list, and your
message list. It records who accepted and who wrote back. It clicks nothing that
accepts, withdraws, replies, sends, or withdraws an invite.

Only rows where **you** ticked **Reached Out (K)** are watched. Ticking that box
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

Leads are matched by the canonical LinkedIn URL (column V), falling back to
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
validation, and the static tabs but preserves Leads data, your K–Q tracking,
your ICP + Schedule inputs, and Run Log history. Clearing leads is a separate
action that requires typing `CLEAR` to confirm.

The builder places headers on **row 3** (data from row 4). The worker also
auto-detects the header row, so it can maintain a sheet whose headers sit
elsewhere and will add the R–AB system columns if they are simply missing.

It will **refuse to write a sheet built on the older 25-column layout.**
v4 inserted Post Link, Degree and Score inside the agent band, so every column
after D shifted; writing new values over old headers would put a suggested DM
where your "Reached Out" ticks live, across every row, with no undo. Instead the
run stops and tells you to re-run `buildAidgentOsSheet` from
Extensions > Apps Script (safe and data-preserving on an empty or fresh sheet)
or to take a fresh copy of the template.

## Sourcing from existing connections (optional)

By default the worker sources new people. Add `--connections` (alias
`--from-connections`) to instead research people you're already connected to who
match the persona. It reads your connections list read-only and writes the same
columns. Opt-in only; never the default.

You are also asked once during setup whether ordinary runs should mine your
existing connections first — the warm, low-hanging-fruit list nobody works. That
answer is saved as `include_connections` in your persona. When it is on, matches
found among your connections are searched first and labelled **Connection** in
Source Type (O), so warm rows are obvious at a glance.
