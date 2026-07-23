# Step 3 — Source leads (local worker)

Goal: research real people who fit the active persona and maintain the Sheet.
Read-only. Human-approved outreach. Nothing is sent.

## Bind your existing sheet first (do not create a new one)

Use the sheet you already have (or `File > Make a copy` of a template, then use
the copy). Bind it and confirm access — the tool never creates a new spreadsheet:

```bash
npm run bind-sheet  -- --persona my-persona --sheet <your-sheet-id-or-url>
npm run check-sheet -- --persona my-persona
```

Then run `buildAidgentOsSheet` from inside that sheet's Apps Script if it does
not yet have the Leads / system tabs (safe, preserves data).

## One-time: sign in to a dedicated Chrome profile

```bash
npm run setup-login -- --persona my-persona
```

A headed Chrome opens on a dedicated profile (path from `AIDGENT_CHROME_PROFILE`,
kept outside the repo). Sign into LinkedIn yourself, including MFA. The tool never
types your credentials. That profile holds your session — protect it like a
password (see [SECURITY.md](../SECURITY.md)).

## Pilot, then run

```bash
npm run pilot  -- --persona my-persona --headless          # 10 people; review first
npm run source -- --persona my-persona --target 50 --headless --update-sheet
```

Each candidate is confirmed against the persona (title, company, geography, fit),
its canonical profile URL is captured, and recent activity is inspected. A post
or relevant comment about a core topic in the **last 7 days** is **prioritized**
as a ranking boost, but a strong ICP match with older or no recent activity is
still allowed. Why Them, the verbatim recent post (column D), the Suggested
Comment (F), and the Suggested Intro DM (G) are built only from verified evidence.

The worker appends new leads and refreshes existing ones in the Sheet, preserves
your human columns H–N, and writes a Run Log row. On any login / CAPTCHA /
checkpoint / rate-limit / expiry page it **stops safely and exits nonzero** —
re-run `setup-login` or wait.

## Modes

- **Local LinkedIn (default):** signed-in dedicated profile, richest activity. Requires the computer on and awake and Codex desktop running. Does NOT run with the computer off.
- **Public-web fallback (`--public-web`):** no signed-in session; public profiles and external sources; lower activity visibility.
- **Existing connections (`--connections`):** research people you're already connected to who match the persona, read-only. Opt-in only — add the flag when you want it; it is never the default.

## Offline check

```bash
npm run dry-run -- --persona example-generic --fixture test/fixtures/dry-run.json
```

Plans a Sheet update from fixtures and writes nothing.

Next: [Step 4 — Schedule it](4-schedule.md)
