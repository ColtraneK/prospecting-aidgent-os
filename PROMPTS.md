# Prompts

These build a **persona**. Sourcing and scheduling are run via the Codex skill
and the npm commands, not by pasting prompts. Placeholders: `{{URL}}`,
`{{ANSWERS}}`, `{{SLUG}}`.

If you are just getting started, you do not need this file:
[START-HERE.md](START-HERE.md) has one paste block that covers everything, and
your agent then follows [AGENTS.md](AGENTS.md). These prompts are here for when
you want to drive a single step by hand.

## 1. Scan (draft the ICP)

> Scan this business and tell me who its best-fit prospects are. Website: {{URL}}. Read the homepage, about, and services or pricing pages. Draft a tight ICP I can correct: what they sell, the outcome, who buys it (industry, size, titles), where they are, and the one buying signal. Six short lines. Then ask me five quick questions to lock it. Do not contact anyone.

## 2. Lock the ICP → create a private persona

> Here are my corrections: {{ANSWERS}}. Lock the ICP in five lines (who I sell to, exact titles, geography, buying signal, opener voice). Ask me two more things first: whether ordinary runs should also mine the people I am already connected to (include_connections), and which existing Google Sheet to fill in. Then create a private persona at private/personas/{{SLUG}}.yaml with target_industries, company_sizes, buyer_titles, geography (include/exclude), buying_signals, core_topics (the topics I want prospects to have posted or commented about recently), exclusions, search_keywords, research_sources, include_connections, and my Google Sheet id. Validate it and bind my sheet. Never create a new spreadsheet. Do not source yet.

## 3. Source (run the skill)

> Use the research-outreach-prospects skill with persona {{SLUG}}. Pilot 10 first, let me review, then run headless with --update-sheet. Read-only research only: prioritize people with a post or relevant comment about my core topics in the last 7 days but allow strong ICP matches without recent activity. For each lead put the verbatim recent post + link in column D, a Suggested Comment in F, and a Suggested Intro DM in G. Never send/connect/react/comment, never touch my human columns H–N, and stop on any login / CAPTCHA / checkpoint / rate-limit page.

## 4. Check back (read-only follow-up)

> Run the follow-up pass for persona {{SLUG}} and update my sheet. Read-only: open my sent invitations, my connections list, and my message list, and fill columns V–Y for the rows where I ticked Reached Out. Never accept, withdraw, reply, or send anything. If a page cannot be read, record unknown rather than guessing that nobody replied.

## 5. Schedule (local)

> Create a local Codex scheduled task that runs `npm run daily -- --persona {{SLUG}} --target 25 --headless --update-sheet` every weekday at my chosen time. Remind me it needs the computer on and awake and Codex desktop running, and that scheduled tasks need a paid plan.

## Commands (the real entry points)

```bash
npm run start                                            # where am I, what is next
npm run list-personas
npm run select-persona   -- --persona {{SLUG}}
npm run validate-persona -- --persona {{SLUG}}
npm run create-persona   -- --from approved-icp.json --slug {{SLUG}}
npm run setup-login      -- --persona {{SLUG}}          # headed manual login
npm run pilot            -- --persona {{SLUG}} --headless
npm run source           -- --persona {{SLUG}} --target 25 --headless --update-sheet
npm run follow-up        -- --persona {{SLUG}} --update-sheet  # who accepted / who replied
npm run daily            -- --persona {{SLUG}} --target 25 --headless --update-sheet
npm run dry-run          -- --persona {{SLUG}} --fixture test/fixtures/dry-run.json
npm run source           -- --persona {{SLUG}} --csv-only     # CSV-only fallback
npm run check-login                                            # is the LinkedIn session alive
npm run feedback         -- --list                             # what the Feedback tab is waiting on
npm run source           -- --persona {{SLUG}} --connections  # research existing connections (opt-in)
```
