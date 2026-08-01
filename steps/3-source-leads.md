# Step 3 — Source leads (local worker)

Goal: research real people who fit the active persona and maintain the Sheet.
Read-only. Human-approved outreach. Nothing is sent.

## Bind your sheet first (the tool never creates one)

Use the sheet you already have. If you do not have one, open the template and
click **Make a copy** — the copy lands in your own Drive, owned by you, with all
seven tabs built and nothing in it:

<https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy>

Bind it and confirm access:

```bash
npm run bind-sheet  -- --persona my-persona --sheet <your-sheet-id-or-url>
npm run check-sheet -- --persona my-persona
```

If you brought your own sheet rather than copying the template, run
`buildAidgentOsSheet` from inside that sheet's Apps Script to add the Leads /
system tabs (safe, preserves data). Copies of the template already have it.

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
npm run pilot  -- --persona my-persona --headless          # adds 10 leads; review first
npm run source -- --persona my-persona --target 25 --headless --update-sheet
```

`--target` counts **leads added to your sheet**, not profiles opened. Getting to
25 added usually means inspecting fifty to a hundred people, because most of them
will not match and some are already in your list. The run reports both numbers.

There is a hard daily cap of 120 profiles inspected, and a deliberate 3.5 to 9
second pause between pages. If the cap is reached first, the run stops there and
says so (`14 of 25 added; stopped at the daily inspection cap`). That is working
as intended. A short day is much cheaper than a restricted LinkedIn account.

Stop after the pilot and actually read the rows. Do the suggested comments sound
like you? Are these the right people? Fix the persona and pilot again if not — a
second pilot is far cheaper than fifty rows you will not use.

A run looks for **recent posts first**. It searches LinkedIn content on your
persona's core topics, filtered to the past week, and only then falls back to
searching people by job title. Someone found because of a post they wrote on
Tuesday arrives with that post already captured; someone found by their headline
may not have posted in two years.

Each candidate is confirmed against the persona (title, company, geography, fit),
its canonical profile URL is captured, and recent activity is inspected. A post
or relevant comment about a core topic in the **last 7 days** is **prioritized**
as a ranking boost, but a strong ICP match with older or no recent activity is
still allowed. Why Them (H) is the scorer's own reasons, not a summary of their
headline. Degree (F) is copied from the badge on the page when one is shown, and
left blank when it is not — it ranks warmer people higher and does not, on its
own, qualify anybody.
If the newest post found is older than seven days it is still written to column D
and marked `(date — older than 7 days)`, so a suggested comment never refers to a
post that is missing from your sheet.

## The two message columns

A run leaves **Suggested Comment (I)** and **Suggested Intro DM (J)** blank and
writes the evidence instead. Your agent then drafts those two from the post in
column D and submits them:

```bash
npm run validate-outreach -- --persona my-persona --drafts drafts.json --update-sheet
```

Without `--update-sheet` it checks the drafts and writes nothing, so you can look
first.

Every draft is checked before it reaches a cell: length, no pipes, no URLs, no
word cut in half, the right first name, and — the one that matters — at least
four consecutive words quoted from the post in column D. A message about a post
nobody wrote reads perfectly well, and quoting four words of one does not. A
draft that fails is left blank with the reason printed, rather than tidied up
into something nobody actually wrote. Where no post was captured at all, a
message may ask for their view and may claim nothing about them.

Re-running a search never overwrites columns I and J, so a scheduled daily run
cannot erase messages you have already written or edited.

The worker appends new leads and refreshes existing ones in the Sheet, preserves
your human columns K–Q, and writes a Run Log row. On any login / CAPTCHA /
checkpoint / rate-limit / expiry page it **stops safely and exits nonzero** —
re-run `setup-login` or wait.

## Modes

- **Local LinkedIn (default):** your own signed-in session — a dedicated profile signed into once, or an `li_at` cookie in `.env` (verify with `npm run check-login`). Requires the computer on and awake and the agent app running. Does NOT run with the computer off. No session means the run refuses to start rather than sourcing some other way.
- **Existing connections (`--connections`):** research people you're already connected to who match the persona, read-only. Opt-in only — add the flag when you want it; it is never the default. Setup also asks whether *ordinary* runs should mine your connections first; that answer is saved as `include_connections` in the persona and those rows are labelled **Connection** in Source Type.

## Check back: who accepted, who replied

Once you have started reaching out, tick **Reached Out (K)** on the rows you
contacted. That tick is what opts a person into the follow-up pass:

```bash
npm run follow-up -- --persona my-persona --update-sheet
```

It opens three of **your own** pages read-only — sent invitations, connections,
and your message list — and fills columns **Y–AB**: Connection Status, Reply
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
