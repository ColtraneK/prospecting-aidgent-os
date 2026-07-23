# Aidgent OS

A local, scheduled, ICP-agnostic prospect-research system. It runs on your
machine through Codex desktop and a Playwright worker, researches LinkedIn
profiles, posts, and comments **read-only**, and maintains a Google Sheet. It
never sends, connects, reacts, comments, or posts. Every outward action is
yours.

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

1. Loads the active persona (titles, industries, geography, keywords, signals, exclusions).
2. Builds searches from the persona (no hardcoded terms).
3. Researches candidates read-only: confirms title/company/geography/fit, captures the canonical profile URL, and inspects recent activity.
4. Prefers activity from the **last 7 days** as a ranking boost, but still accepts strong ICP matches with older or no recent activity.
5. Writes an evidence-based **Why Them** and a short no-pitch **opener** — never fabricating activity, dates, quotes, titles, geography, or URLs.
6. Maintains the Google Sheet: dedupes by canonical URL (then name+company), appends new leads, refreshes existing ones, and **preserves your human columns G–M**.
7. Appends a Run Log row. On any login / CAPTCHA / checkpoint / rate-limit / expiry page it stops safely and exits nonzero.

## Quickstart

```bash
npm install                      # installs playwright + googleapis + js-yaml
cp .env.example .env             # fill values; keep secrets OUTSIDE the repo
npx playwright install chrome    # or use your installed Chrome channel

# Build a persona (or edit personas/example-generic.yaml into private/personas/)
npm run create-persona -- --from approved-icp.json --slug my-persona
npm run validate-persona -- --persona my-persona

# Bind YOUR existing sheet (or File > Make a copy of a template first, then bind
# the copy). This tool NEVER creates a new spreadsheet; it maintains this one.
npm run bind-sheet  -- --persona my-persona --sheet <your-sheet-id-or-url>
npm run check-sheet -- --persona my-persona

# One-time manual login into a dedicated Chrome profile
npm run setup-login -- --persona my-persona

# Pilot 10, review, then a full run that updates the Sheet
npm run pilot  -- --persona my-persona --headless
npm run source -- --persona my-persona --target 50 --headless --update-sheet
```

Offline demo (writes nothing, no network):

```bash
npm run dry-run -- --persona example-generic --fixture test/fixtures/dry-run.json
npm test
```

## Layout

```
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

An open starter kit from Aidgentic. aidgentic.com · MIT licensed.
