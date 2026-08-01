# Aidgent OS

A local prospect-research system, v6. It runs on your machine through an AI
coding agent and a Playwright worker, researches LinkedIn **read-only**, and
maintains a Google Sheet you own. It never sends, connects, reacts, comments,
or posts. Every outward action is yours.

> **New here?** Read [START-HERE.md](START-HERE.md) — one paste block. If you
> are an AI agent working in this repo, read [AGENTS.md](AGENTS.md) and follow
> it exactly.

## The v6 shape

**The agent explores and judges; the code verifies, paces, and writes.**

The agent crafts LinkedIn search URLs itself, reads the pages, and decides who
is worth a look — no brittle search parser, no point-scoring formula. The
fabrication protection moved into verified evidence: nothing reaches the sheet
unless this repo's own browser opened the profile and captured the facts
verbatim, and every drafted message must quote 4+ consecutive words of the
captured post.

A run touches LinkedIn with exactly two commands, then writes with a third:

```bash
npm run open    -- --url "<a LinkedIn search URL you crafted>"   # saves HTML+screenshot
npm run inspect -- --nominations nominations.json                # verifies every nominee first-hand
npm run qualify -- --decisions decisions.json --update-sheet     # checked writes, fit rows only
```

- `open` — linkedin.com only, refuses message/connect/compose/checkpoint
  URLs, paced, budgeted. The agent reads the artifact in `run-artifacts/`.
- `inspect` — gates the nominations (`/in/` URLs only, no placeholder slugs,
  dedupe vs the sheet), then opens every profile + activity page itself and
  writes `run-artifacts/evidence.json`: headline, company, location, degree
  badge, the newest post verbatim with date and permalink. Hard disqualifiers
  only (exclusion substrings, geography when set) — that is ALL code decides.
- `qualify` — the only live-run sheet writer. Validates every draft with the
  grounding rules, re-checks disqualifiers, writes only fit=true rows
  (columns A–J + R–X in one pass). Failing drafts are reported for redraft,
  never written. Without `--update-sheet` it validates and reports only.

Safety, all in code: 3.5–9s pacing between navigations; daily budgets
persisted across invocations (120 page opens, 60 inspections — exhausted
budgets refuse loudly with the reset time); blocker stops (login, CAPTCHA,
checkpoint, rate-limit → stop, save artifacts); human columns K–Q never
written; refresh never blanks I/J; no login automation, no CAPTCHA
workarounds, nothing ever auto-sent.

## Setup

```bash
npm install
npm run start        # a ~5-step checklist; do the one thing it names, repeat
```

In order: the Google Sheet (you copy the template, share it with the service
account's `client_email` as Editor, `npm run check-sheet` proves it), the
LinkedIn session (`npm run setup-login` or an `li_at` cookie,
`npm run check-login` proves it and writes the value into `.env` itself), and
one ICP conversation that ends in `npm run save-persona -- --file <yaml>`.

The sheet template (copy it; this tool never creates a spreadsheet):

<https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy>

READY means proved, not configured: the checklist reads the records
`check-sheet` and `check-login` wrote when they actually reached Google and
LinkedIn. Forging those records is forbidden.

## The columns

- **A–J — agent output:** Name, Title/Company, URL, Recent Post (verbatim +
  date), Post Link, Degree (observed badge, never inferred), Score 1–10 (the
  agent's 0–100 score at reading scale), Why Them (the agent's rationale),
  Suggested Comment, Suggested Intro DM.
- **K–Q — yours alone; never written:** Reached Out, Replied, Outcome, Date
  Added, Source Type, Batch, Notes (Date Added and Source Type are seeded
  once on insert).
- **R–AB — system:** activity date/type, the raw 0–100 score, verification
  stamps, canonical key, research source/status. Y–AB are reserved and
  unwritten in v6.

Details: [sheet/SHEET.md](sheet/SHEET.md). Steering: write plain English on
the sheet's **Feedback** tab; the agent applies each note to the persona and
stamps what changed (`npm run feedback`). An unapplied note warns loudly at
the start of every run — it never bricks one.

## References

- `references/linkedin-search-urls.md` — the search URL grammar the agent uses
- `references/trigger-signals.md` — what makes someone worth opening this week
- `references/outreach-rules.md` — value-first first touches, and what the
  grounding validator enforces

## Tests

```bash
npm test           # offline, no network, never launches a browser
npm run test:dom   # the DOM extractor against saved LinkedIn pages (browser)
```

## Layout

```
START-HERE.md                     the paste block for a new user
AGENTS.md                         the manual your AI agent follows
references/                       search grammar, trigger signals, outreach rules
personas/example-generic.yaml     public FAKE example persona
private/                          your real persona, proofs, budget state (git-ignored)
src/                              worker + pure logic + CLI
sheet/SHEET.md                    the sheet contract
test/                             offline tests + DOM fixtures
```

Nothing in `.env`, `private/` or `run-artifacts/` is tracked by git. Requires
Node 20+, a Chrome/Edge install, a LinkedIn account, a Google account. MIT
licensed; see [SECURITY.md](SECURITY.md) for the honest trust posture.
