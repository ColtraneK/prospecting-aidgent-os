# Aidgent OS

A local, scheduled, ICP-agnostic prospect-research system. It runs on your
machine through Codex desktop and a Playwright worker, researches LinkedIn
profiles, posts, and comments **read-only**, and maintains a Google Sheet. It
never sends, connects, reacts, comments, or posts. Every outward action is
yours.

> **New here?** Read [START-HERE.md](START-HERE.md) — one paste block, no GitHub
> account needed. If you are an AI agent working in this repo, read
> [AGENTS.md](AGENTS.md) and follow it exactly.

## Where am I? — `npm run start`

```bash
npm run start
```

Prints a plain-English checklist of everything setup needs and names exactly
**one** next step. It never asks a question and never blocks, so it is safe
inside an agent harness. Do the one thing, run it again, repeat until READY.

The ICP is never hardcoded. One reusable Codex skill loads a **private,
switchable persona**, so you can change businesses or audiences without touching
the sourcing code.

## Two modes (honest)

**1. Local LinkedIn mode (default).**
Codex desktop + this local repo + a dedicated persistent Chrome profile you sign
into once. Later runs can be headless. It sees signed-in LinkedIn activity, so it
gets the richest, most recent evidence.
Requires: **computer on and awake, Codex desktop running.** This does **not** run
with the computer off.

**2. Public-web fallback (`--public-web`).**
No signed-in LinkedIn session. Uses public profiles and external sources
(company pages, directories, podcasts, conferences). Lower activity visibility,
but no login needed.

## What it does each run

1. Loads the active persona (titles, industries, geography, keywords, core topics, signals, exclusions).
2. Builds searches from the persona (no hardcoded terms).
3. Researches candidates read-only: confirms title/company/geography/fit, captures the canonical profile URL, and inspects recent activity.
4. **Prioritizes** prospects with a post or relevant comment about a core topic in the **last 7 days**, but still accepts strong ICP matches with older or no recent activity.
5. For each lead it writes, never fabricating activity, dates, quotes, titles, geography, or URLs:
   - the **verbatim recent post** (if within 7 days) plus its link, in column **D**;
   - an evidence-based **Why Them** (E);
   - a **Suggested Comment** — a specific reply to their recent post/comment (F);
   - a short no-pitch **Suggested Intro DM** (G).
6. Maintains the Google Sheet: dedupes by canonical URL (then name+company), appends new leads, refreshes existing ones, and **preserves your human tracking columns H–N**.
7. Appends a Run Log row. On any login / CAPTCHA / checkpoint / rate-limit / expiry page it stops safely and exits nonzero.

### Columns

- **A–G — the agent fills these:** Name, Title / Company, LinkedIn URL, Recent Post (verbatim + link), Why Them, Suggested Comment, Suggested Intro DM.
- **H–N — yours to edit; the agent never overwrites them:** Reached Out, Replied, Outcome, Date Added, Source Type, Batch, Notes.
- **O–U — system research metadata:** Activity Date, Activity Type, Fit Score, Last Verified, Canonical Key, Research Source, Research Status.
- **V–Y — the follow-up pass, read-only:** Connection Status, Reply Status, Last Reply, Follow-up Checked.

Column D shows whatever post was actually captured. An older post is shown and
explicitly marked `(date — older than 7 days)` rather than dropped, so a
suggested comment in F never points at a post that is missing from the sheet.

## Did they accept? Did they reply?

```bash
npm run follow-up -- --persona my-persona --update-sheet
```

Opens three of **your own** pages read-only — sent invitations, connections, and
your message list — and fills **V–Y** with what it saw. It clicks nothing that
accepts, withdraws, replies, or sends.

It only watches rows where **you** ticked **Reached Out (H)**. A surface it could
not read records `unknown`, never a guessed `no_reply`, and a field it did not
observe is left alone rather than blanked — so a reply recorded last week
survives a pass that could not read messaging today.

## One command a day

```bash
npm run daily -- --persona my-persona --target 25 --headless --update-sheet
```

Sources new people, then runs the follow-up pass. A sourcing blocker no longer
kills the follow-up half; the exit code still reflects the failure.

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
npm run bind-sheet  -- --persona my-persona --sheet <your-sheet-id-or-url>
npm run check-sheet -- --persona my-persona

# One-time manual login into a dedicated Chrome profile
npm run setup-login -- --persona my-persona

# Pilot 10, review, then a full run that updates the Sheet
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

Offline demo (writes nothing, no network):

```bash
npm run dry-run -- --persona example-generic --fixture test/fixtures/dry-run.json
npm test
```

## Layout

```
START-HERE.md                                          the paste block for a new user
AGENTS.md                                              the manual your AI agent follows
.agents/skills/research-outreach-prospects/SKILL.md   the one reusable skill
personas/example-generic.yaml                          public FAKE example
private/personas/<slug>.yaml                            your real personas (git-ignored)
src/                                                    worker + pure logic + CLI
sheet/BuildLeadSheet.gs, sheet/SHEET.md                 the 7-tab workbook
steps/1..4                                              scan ICP → build persona → source → schedule
sourcing/codex-playwright.md                            the persistent-profile method
test/                                                   fixture-based tests (no network)
.env.example                                            variable names only
```

## Safety

Read-only research; human-approved outreach. See [SECURITY.md](SECURITY.md).

---

An open, ICP-agnostic starter kit. Configure it for any business — it asks for your site and ICP and saves them as a private persona. MIT licensed.
