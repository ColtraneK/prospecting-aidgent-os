# The Lead Sheet

The Google Sheet is the human-readable system of record. Research can be refreshed; human progress must be preserved.

## Tabs

- **Start Here** — plain-language operating notes.
- **Leads** — working prospect list.
- **Feedback** — ICP corrections and preferences.
- **ICP + Schedule** — confirmed business profile and cadence.
- **Prompt Library** and **Lists** — reusable guidance and dropdown values.
- **Run Log** — one summary row per write run.

## Leads columns

| Col | Field | Owner |
|---|---|---|
| A | Name | system |
| B | Title / Company | system |
| C | LinkedIn (or profile URL) | system |
| D | Recent Post (verbatim + date) | system |
| E | Post Link | system |
| F | Degree | system, observed only |
| G | Score (1-10) | system |
| H | Why Them | system |
| I | Suggested Comment | system draft |
| J | Suggested Intro DM | system draft |
| K | Reached Out On | human |
| L | Connected/Req Sent | human (`Request sent` or `Connected`) |
| M | Replied | human checkbox |
| N | Outcome | human |
| O | Date Added | seeded once, then human |
| P | Source Type | seeded once, then human |
| Q | Batch | human |
| R | Notes | human |
| S | Activity Date | system |
| T | Activity Type | system |
| U | Fit Score | system (0-100) |
| V | Last Verified | system |
| W | Canonical Key | system dedupe key |
| X | Research Source | system |
| Y | Research Status | system |
| Z | Browser Connection Status | system observation |
| AA | Connection Checked On | system |
| AB | Next Action | system suggestion |
| AC | Next Action Due | system |

The worker preserves **K-R** on refresh. It seeds O and P only when inserting a new row. It never deletes a lead and never sends the action in AB.

## Human workflow

After acting manually:

1. Put the date in **Reached Out On** when you send the first message.
2. Choose `Request sent` in **Connected/Req Sent** after a connection invite.
3. Change it to `Connected` once the connection is confirmed.
4. Check **Replied** when the person answers.
5. Record the result in **Outcome** and context in **Notes**.

`npm run next-actions` reads those fields. A pending request is rechecked after two days; a connected person with no outreach is ready for a first message; an unreplied message is surfaced for follow-up after five days.

## Build or repair the template

The CLI validates the exact A-AC header contract and refuses a mismatched layout to prevent shifted writes. In a blank Sheet copy, open **Extensions → Apps Script**, paste [BuildLeadSheet.gs](BuildLeadSheet.gs), save, and run `buildLeadSheet`. Then:

```bash
npm run bind-sheet -- --sheet <your-sheet-url>
npm run check-sheet
```

The tool never creates a Google Sheet in somebody else's Drive. The user owns the Sheet and explicitly shares it with the service account.
