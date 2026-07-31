# Aidgent OS

A local, scheduled, ICP-agnostic prospect-research system. It runs on your
machine through Codex desktop and a Playwright worker, researches LinkedIn
profiles, posts, and comments **read-only**, and maintains a Google Sheet. It
never sends, connects, reacts, comments, or posts. Every outward action is
yours.

> **New here?** Read [START-HERE.md](START-HERE.md) — one paste block, no GitHub
> account needed. If you are an AI agent working in this repo, read
> [AGENTS.md](AGENTS.md) and follow it exactly.

## Current state — 31 July 2026

Read this before you trust anything below it.

**Working and verified.** A clean clone installs, passes 197 offline tests, and
runs the offline demo with no session, no credentials and no network. The Leads
sheet is at layout **v4**: 28 columns, with Post Link, Degree and Score added
inside the agent band. The Feedback tab is enforced in code — a run refuses to
start while a correction sits unapplied — not merely documented. The setup
checklist has 11 steps and names exactly one next action at a time.

**Setup order.** The Google Sheet, the service-account key and — stated as its
own step — **sharing that sheet with the key's `client_email` as Editor** come
first, before LinkedIn and before the ICP conversation. That sharing step is a
separate action in a different Google product, nothing on your machine can
observe whether you did it, and skipping it fails every run with a permission
error that looks like a bug here. `npm run check-sheet` is the only thing that
knows, so the checklist requires it to have passed.

**Just fixed.** Two ways the setup could claim to be ready and not be. A run
with no session used to fail at the login wall and report `login: login page
detected`, which reads as LinkedIn blocking you when the truth was that `.env`
still held the example placeholder — Playwright creates any profile directory
it is handed, so an unreal path became a brand-new signed-out Chrome. And the
checklist used to infer "signed in" from a cookie file inside the profile
folder, which Chrome creates the instant it launches. A profile someone opened
and abandoned passed. Now every command that would open a browser checks
locally first and refuses with a named reason, and READY requires a session
that was actually proved against LinkedIn.

**Not yet verified.** A full pilot has never completed against live LinkedIn —
every run so far stopped on setup, not on LinkedIn. Expect the first real run to
be the first true test of the extractors. `sheet/BuildLeadSheet.gs` has also
never been executed inside Apps Script; the shared template was built through
the Sheets API instead. Neither blocks setup, and both fail loudly rather than
silently if they are wrong.

**Requires.** Node 20 or newer, a LinkedIn account you already use, a Google
account, and a Chrome or Edge install. Roughly 30–60 minutes for a first setup,
most of it the Google service account and the ICP conversation.

## Where am I? — `npm run start`

```bash
npm run start
```

Prints a plain-English checklist of everything setup needs and names exactly
**one** next step. It never asks a question and never blocks, so it is safe
inside an agent harness. Do the one thing, run it again, repeat until READY.
Expect to run it about ten times during a first setup.

It exits nonzero until every item is done. That is deliberate — it is how your
agent knows there is work left — and it is not an error.

The ICP is never hardcoded. One reusable Codex skill loads a **private,
switchable persona**, so you can change businesses or audiences without touching
the sourcing code.

## The session (honest)

Every run drives a real browser carrying **your own signed-in LinkedIn
session**, read-only. Two ways to give it one — either is enough:

**1. Paste your `li_at` cookie (simplest).** Copy the `li_at` cookie from a
browser where you are signed into LinkedIn into `AIDGENT_LI_AT` in `.env`
(`.env.example` shows exactly where to find it). Runs are headless from the
first one; no login window ever opens. Verify with `npm run check-login`.

**2. A dedicated Chrome profile.** `npm run setup-login` opens a window, you
sign in yourself once, and the profile keeps the session for later headless runs.

No session means no run: `npm run source` stops with a named reason rather than
degrading into some other way of finding people.

### Set it in `.env`, not in your shell

This is the one rule worth internalising. Settings can come from a `--flag`,
from a variable exported in the terminal you happen to be standing in, or from
`.env` — and **only `.env` survives into the next command.** A session
configured in a shell makes `npm run start` print READY and the very next run
stop at a LinkedIn login page, because that run read `.env` and found the
example placeholder.

So: put the value in `.env`. The checklist has a step for exactly this, and
`setup-login` and `check-login` write the profile path into `.env` themselves —
the first before it opens anything, the second once it has proved the session
works. Only the path is ever written; an `li_at` cookie is a secret and stays
wherever you put it.

### Verified, not inferred

`npm run start` opens no browser and makes no network calls, so it cannot ask
LinkedIn anything. It therefore does not guess. `setup-login` and `check-login`
record what they actually proved in `private/session-verified.json`, and the
checklist reads that: the step is **"That session is proven to work"** and it
stays unmet until a real run loaded your feed.

That record is tied to the session it proved, so changing the profile path or
pasting a different cookie invalidates it rather than inheriting a green tick,
and it expires after 14 days because LinkedIn sessions do. The `li_at` cookie is
fingerprinted, never stored.

`npm run setup-login` no longer asks you to press Ctrl+C. It waits for your feed
to load, closes the browser itself — which is what makes Chrome flush its cookie
store — and records the result. The old version parked forever and told you to
Ctrl+C, which killed the process with the browser still open, so a sign-in you
completed correctly could fail to reach disk.

### When it refuses before opening a browser

These are local problems, not LinkedIn's, and none of them are fixed by
retrying. Each one prints its own fix:

- **`no_session_configured`** — neither `AIDGENT_CHROME_PROFILE` nor
  `AIDGENT_LI_AT` is set anywhere.
- **`placeholder_profile`** — `.env` still carries the `.env.example` line,
  which is a description of a path rather than a path. Do not create that folder
  to silence it; replace the line.
- **`profile_missing`** — the path is real-looking but not on this machine.
  Usually a `.env` copied from another computer. The profile itself is a
  credential and is not copied between machines.
- **`profile_never_signed_in`** — the folder exists with no cookie store, so
  `npm run setup-login` was never completed in it.

Runs happen on **your** computer — on and awake, agent app running. This does
**not** run with the computer off.

## What it does each run

1. Loads the active persona (titles, industries, geography, keywords, core topics, signals, exclusions).
2. Builds searches from the persona (no hardcoded terms).
3. Researches candidates read-only: confirms title/company/geography/fit, captures the canonical profile URL, and inspects recent activity.
4. **Prioritizes** prospects with a post or relevant comment about a core topic in the **last 7 days**, but still accepts strong ICP matches with older or no recent activity.
5. For each lead it writes, never fabricating activity, dates, quotes, titles, geography, or URLs:
   - the **verbatim recent post** with its date, in column **D**, and its bare permalink in **E**;
   - the observed connection **Degree** (F) and the fit score at 1-10 scale (G);
   - an evidence-based **Why Them** (H);
   - a **Suggested Comment** — a specific reply to their recent post/comment (I);
   - a short no-pitch **Suggested Intro DM** (J).
6. Maintains the Google Sheet: dedupes by canonical URL (then name+company), appends new leads, refreshes existing ones, and **preserves your human tracking columns K–Q**.
7. Appends a Run Log row. On any login / CAPTCHA / checkpoint / rate-limit / expiry page it stops safely and exits nonzero.

### Columns

- **A–J — the agent fills these:** Name, Title / Company, LinkedIn URL, Recent Post (verbatim + date), Post Link, Degree, Score (1-10), Why Them, Suggested Comment, Suggested Intro DM.
- **K–Q — yours to edit; the agent never overwrites them:** Reached Out, Replied, Outcome, Date Added, Source Type, Batch, Notes.
- **R–X — system research metadata:** Activity Date, Activity Type, Fit Score, Last Verified, Canonical Key, Research Source, Research Status.
- **Y–AB — the follow-up pass, read-only:** Connection Status, Reply Status, Last Reply, Follow-up Checked.

Ticking **Reached Out (K)** is what tells the system to start watching whether
that person accepted and whether they replied. Nothing else you do in the sheet
starts the follow-up pass.

Column D shows whatever post was actually captured. An older post is shown and
explicitly marked `(date — older than 7 days)` rather than dropped, so a
suggested comment in I never points at a post that is missing from the sheet.

## Steering it — the Feedback tab

Write a sentence, not a config change. Add a row with the date, what you want
different in plain English, and whether it is a Must, a Prefer or an Avoid —
"no leads outside the US, Must", "stop showing me recruiters, Avoid".

Your agent reads that tab **before every run** and **refuses to start** while a
row is unapplied. It fills the last three columns with whether it applied the
note, when, and exactly what changed; if it cannot do what you asked it marks
the row `Needs a decision` with a reason rather than quietly ignoring you.
`npm run feedback` is how that gets recorded.

Being straight about it: this is not the system learning from your results.
Nothing watches who replied and adjusts targeting on its own. What you get is
the controls today, in plain English, with a record of why your targeting looks
the way it does.

## Did they accept? Did they reply?

```bash
npm run follow-up -- --persona my-persona --update-sheet
```

Opens three of **your own** pages read-only — sent invitations, connections, and
your message list — and fills **Y–AB** with what it saw. It clicks nothing that
accepts, withdraws, replies, or sends.

It only watches rows where **you** ticked **Reached Out (K)**. A surface it could
not read records `unknown`, never a guessed `no_reply`, and a field it did not
observe is left alone rather than blanked — so a reply recorded last week
survives a pass that could not read messaging today.

## One command a day

```bash
npm run daily -- --persona my-persona --target 25 --headless --update-sheet
```

Adds new leads, then runs the follow-up pass. A sourcing blocker no longer kills
the follow-up half; the exit code still reflects the failure.

`--target` counts **rows added**, not profiles opened, so `inspected` and `added`
are reported separately and are meant to differ. A hard cap of 120 inspections a
day outranks the target: a run that hits it stops and reports the true count.

Keep the target near 25. The binding constraint is not this tool — LinkedIn
objects to accounts sending much more than ~30 connection requests a day, and 25
researched leads is already about twenty minutes of honest human outreach.

### Sourcing from your existing connections (optional)

By default the system sources *new* people who match your persona. If you'd rather
research people you're **already connected to** who fit the ICP, add `--connections`
(alias `--from-connections`). It reads your connections list read-only and researches
matches the same way. This is opt-in and never the default.

```bash
npm run source -- --persona my-persona --connections --headless --update-sheet
```

You are also asked once during setup whether *ordinary* runs should mine your
existing connections first. That answer is saved as `include_connections` in the
persona; when it is on, connections are searched first and those rows are
labelled **Connection** in Source Type so warm leads stand out.

## A run that finds nobody is a failure, not a quiet success

There is no such thing as a successful run that inspected zero people. When one
comes back empty it names which of these applied, and only the first is benign:

- **`no_results`** — LinkedIn itself said there were no matches. The persona is
  too narrow; widen it.
- **`parse_failed`** — the page was full of profile links and the collector read
  none of them. LinkedIn changed its markup; a screenshot and the page HTML land
  in `run-artifacts/`. Do not hand-edit selectors mid-run.
- **`page_not_rendered`** / **`no_results_visible`** — the page loaded but was
  not the search page.

The worker stops after two unreadable pages in a row rather than walking every
search. A run that ends in twenty seconds with a reason is worth more than one
that ends in four minutes with a zero.

## Quickstart

```bash
npm install                      # installs playwright + googleapis + js-yaml
cp .env.example .env             # fill values; keep secrets OUTSIDE the repo
npx playwright install chrome    # or use your installed Chrome channel

# Build a persona (or edit personas/example-generic.yaml into private/personas/)
npm run create-persona -- --from approved-icp.json --slug my-persona
npm run validate-persona -- --persona my-persona

# Bind YOUR sheet. No sheet yet? Open the template below and click "Make a
# copy" — you get your own, in your own Drive, tabs already built:
#   https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy
# This tool NEVER creates a spreadsheet itself; it maintains the one you bind.
#
# THEN SHARE IT with the service account: open the .json key, copy client_email,
# open your sheet > Share > paste it > Editor > Send. Separate step, different
# product, and the one people skip. check-sheet is what proves you did it.
npm run bind-sheet  -- --persona my-persona --sheet <your-sheet-id-or-url>
npm run check-sheet -- --persona my-persona

# One-time manual login into a dedicated Chrome profile
npm run setup-login -- --persona my-persona
npm run check-login

# Pilot adds 10 leads; review, then a full run that adds 25 and updates the Sheet
npm run pilot  -- --persona my-persona --headless
npm run source -- --persona my-persona --target 25 --headless --update-sheet

# Once you are reaching out: source + check who accepted and who replied
npm run daily  -- --persona my-persona --target 25 --headless --update-sheet
```

Stuck at any point? `npm run start` will tell you which piece is missing.

## Letting it write to your Sheet

This is the step where first-time setups stall, so here it is in full. You need
a **service account** — a robot Google account that this tool authenticates as.
About five minutes, once. `npm run start` prints these same steps when you
reach them, so you never have to come find this page.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign
   in. Create a new project; any name works.
2. Search the top bar for **Google Sheets API**, open it, click **Enable**.
3. Search the top bar for **Credentials**. Click **Create credentials** →
   **Service account**. Any name, then Create and continue → Done.
4. Click the service account you just made → **Keys** tab → **Add key** →
   **Create new key** → **JSON** → Create. A `.json` file downloads.
5. Move that file somewhere **outside this repo** (home folder, Documents) and
   set `GOOGLE_APPLICATION_CREDENTIALS` in `.env` to its full path.
6. Open the `.json` in any text editor and copy the `client_email` value — it
   looks like `something@your-project.iam.gserviceaccount.com`.
7. Open your Google Sheet → **Share** → paste that `client_email` → set it to
   **Editor** → Send.

Step 7 is the one people skip. The service account is a *different identity*
from your own Google login, so an unshared sheet fails every run with a
permission error that looks like a bug in this tool.

Offline demo — writes nothing, opens no browser, makes no network calls, and
works before any of the setup above is done:

```bash
npm run dry-run -- --persona example-generic --fixture test/fixtures/dry-run.json
npm test
```

`npm test` never launches a browser. The browser-backed extractor tests live
separately in `npm run test:dom`, so a non-technical install stays browser-free.

## Layout

```
START-HERE.md                                          the paste block for a new user
AGENTS.md                                              the manual your AI agent follows
.agents/skills/research-outreach-prospects/SKILL.md   the one reusable skill
personas/example-generic.yaml                          public FAKE example
private/personas/<slug>.yaml                            your real personas (git-ignored)
src/session.mjs                                         is there a session, and can .env reproduce it
src/                                                    worker + pure logic + CLI
sheet/BuildLeadSheet.gs, sheet/SHEET.md                 the 7-tab workbook
steps/1..4                                              scan ICP → build persona → source → schedule
sourcing/codex-playwright.md                            the persistent-profile method
test/                                                   fixture-based tests (no network)
.env.example                                            variable names only
```

Nothing in `.env`, `private/`, `approved-icp.json` or `run-artifacts/` is
tracked by git, so a fresh clone never carries anyone else's persona, sheet or
credentials — and deleting the folder takes your persona with it.

## Safety

Read-only research; human-approved outreach. See [SECURITY.md](SECURITY.md).

---

An open, ICP-agnostic starter kit. Configure it for any business — it asks for your site and ICP and saves them as a private persona. MIT licensed.
