# The Lead Sheet

A simple Google Sheet is the home base. The agent writes the first six columns; you track the rest. Nothing auto-sends.

## Tabs

- **Start Here** - the daily loop and first-time setup at a glance.
- **Leads** - the working list. Agent output in A to F, your tracking in G to M.
- **ICP + Schedule** - your locked ICP and the sourcing settings (counts, weekdays, run time, timezone, allowed sources).
- **Prompt Library** - the four prompts with your placeholders filled in.
- **Lists** - dropdown values and the lead-quality bar.

## Leads columns

| Col | Field | Who fills it |
|---|---|---|
| A | Name | agent |
| B | Title / Company | agent |
| C | LinkedIn (or profile URL) | agent |
| D | Latest Post (or relevant link) | agent |
| E | Why Them | agent |
| F | Suggested Opener | agent |
| G | Reached Out | you (checkbox) |
| H | Replied | you (checkbox) |
| I | Outcome | you (No response / Neutral / Positive / Not a fit / Follow up) |
| J | Date Added | you or the run |
| K | Source Type | you (Public web / LinkedIn / Referral / Other) |
| L | Batch | you (e.g. a date or run label) |
| M | Notes | you |

The sourcing prompts return exactly A to F, in that order, so a paste lands clean.

## Build one

Two options:

- **Run the script.** Open a new sheet at [sheets.new](https://sheets.new), then Extensions > Apps Script, paste [`BuildLeadSheet.gs`](BuildLeadSheet.gs), and run `buildLeadSheet`. It creates the Leads and Start Here tabs, branded, with the columns above.
- **By hand.** Make a sheet with a Leads tab whose row 1 headers match the table above.

Share it as a template by swapping `/edit` at the end of the share link for `/copy`, so everyone who opens it gets their own copy.
