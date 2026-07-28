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
npm run source -- --persona my-persona --target 25 --headless --update-sheet
```

Stop after the pilot and actually read the rows. Do the suggested comments sound
like you? Are these the right people? Fix the persona and pilot again if not — a
second pilot is far cheaper than fifty rows you will not use.

Each candidate is confirmed against the persona (title, company, geography, fit),
its canonical profile URL is captured, and recent activity is inspected. A post
or relevant comment about a core topic in the **last 7 days** is **prioritized**
as a ranking boost, but a strong ICP match with older or no recent activity is
still allowed. Why Them, the verbatim recent post (column D), the Suggested
Comment (F), and the Suggested Intro DM (G) are built only from verified evidence.
If the newest post found is older than seven days it is still written to column D
and marked `(date — older than 7 days)`, so a suggested comment never refers to a
post that is missing from your sheet.

The worker appends new leads and refreshes existing ones in the Sheet, preserves
your human columns H–N, and writes a Run Log row. On any login / CAPTCHA /
checkpoint / rate-limit / expiry page it **stops safely and exits nonzero** —
re-run `setup-login` or wait.

## Modes

- **Local LinkedIn (default):** signed-in dedicated profile, richest activity. Requires the computer on and awake and Codex desktop running. Does NOT run with the computer off.
- **Public-web fallback (`--public-web`):** no signed-in session; public profiles and external sources; lower activity visibility.
- **Existing connections (`--connections`):** research people you're already connected to who match the persona, read-only. Opt-in only — add the flag when you want it; it is never the default. Setup also asks whether *ordinary* runs should mine your connections first; that answer is saved as `include_connections` in the persona and those rows are labelled **Connection** in Source Type.

## Check back: who accepted, who replied

Once you have started reaching out, tick **Reached Out (H)** on the rows you
contacted. That tick is what opts a person into the follow-up pass:

```bash
npm run follow-up -- --persona my-persona --update-sheet
```

It opens three of **your own** pages read-only — sent invitations, connections,
and your message list — and fills columns **V–Y**: Connection Status, Reply
Status, Last Reply, and the date it checked. It clicks nothing that accepts,
withdraws, replies, or sends.

A page it could not read is recorded as `unknown`, never as a guessed "no
reply", and anything it did not observe is left alone rather than blanked.

Both halves in one command:

```bash
npm run daily -- --persona my-persona --target 25 --headless --update-sheet
```

## Offline check

```bash
npm run dry-run -- --persona example-generic --fixture test/fixtures/dry-run.json
```

Plans a Sheet update from fixtures and writes nothing.

Next: [Step 4 — Schedule it](4-schedule.md)
