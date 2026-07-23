# The Lead Sheet

One Google Sheet is the system of record. The research worker maintains it in
place over the Sheets API: it appends new leads and refreshes research on
existing ones, and it never touches your human tracking. Nothing is auto-sent.

## Tabs (built by `BuildLeadSheet.gs`)

- **Start Here** — how the local system runs and the daily loop.
- **Leads** — the working list. A–F agent output, G–M your tracking, N–T system research.
- **ICP + Schedule** — your business snapshot, the locked five-line ICP, and run settings. Mirrors a persona.
- **Personas** — how to list/select/validate/create the private personas that drive sourcing.
- **Prompt Library** — prompts to build a persona; sourcing and scheduling run via the skill / npm, not by pasting.
- **Lists** — dropdown values and the quality bar.
- **Run Log** — one row per run (appended by the worker).

## Leads columns

| Col | Field | Who writes it |
|---|---|---|
| A | Name | agent |
| B | Title / Company | agent |
| C | LinkedIn (or profile URL) | agent (canonical) |
| D | Latest Post (or relevant link) | agent |
| E | Why Them | agent |
| F | Suggested Opener | agent |
| G | Reached Out | you (checkbox) |
| H | Replied | you (checkbox) |
| I | Outcome | you (No response / Neutral / Positive / Not a fit / Follow up) |
| J | Date Added | you / seeded on insert |
| K | Source Type | you / seeded on insert |
| L | Batch | you |
| M | Notes | you |
| N | Activity Date | system |
| O | Activity Type | system (post / comment) |
| P | Fit Score | system |
| Q | Last Verified | system |
| R | Canonical Key | system (dedup key) |
| S | Research Source | system |
| T | Research Status | system (New / Refreshed / Needs review) |

The worker writes **A–F and N–T only**. On an existing lead it refreshes those
fields and leaves **G–M exactly as you left them**. It never deletes rows.

## Dedup and merge

Leads are matched by the canonical LinkedIn URL (column R), falling back to
normalized name + company. A match becomes an in-place refresh; a non-match
becomes a new appended row; within-run duplicates are collapsed to the highest
fit score.

## Which sheet does it use?

**Your existing one.** Never `sheets.new`. Either open the sheet you already use,
or `File > Make a copy` of a template first, then **bind that sheet** so the
worker maintains it:

```bash
npm run bind-sheet  -- --persona <slug> --sheet <your-sheet-id-or-url>
npm run check-sheet -- --persona <slug>   # confirms access + lists the tabs
```

`check-sheet` prints the sheet title and tabs and confirms it will be used in
place. A live run refuses to start if no real sheet is bound — the tool never
creates a new spreadsheet.

## Build / refresh

Open **that** Sheet (the one you bound) → Extensions > Apps Script → paste
`BuildLeadSheet.gs` → run `buildAidgentOsSheet`. The script is container-bound and
only edits the spreadsheet it lives in. **Re-running is safe:** it refreshes headers, formatting,
validation, and the static tabs but preserves Leads data, your G–M tracking,
your ICP + Schedule inputs, and Run Log history. Clearing leads is a separate
action that requires typing `CLEAR` to confirm.

The builder places headers on **row 3** (data from row 4). The worker also
auto-detects the header row, so it can maintain a sheet whose headers sit
elsewhere and will add the N–T columns if they are missing.
