# Prompts

These build a **persona**. Sourcing and scheduling are run via the Codex skill
and the npm commands, not by pasting prompts. Placeholders: `{{URL}}`,
`{{ANSWERS}}`, `{{SLUG}}`.

## 1. Scan (draft the ICP)

> Scan this business and tell me who its best-fit prospects are. Website: {{URL}}. Read the homepage, about, and services or pricing pages. Draft a tight ICP I can correct: what they sell, the outcome, who buys it (industry, size, titles), where they are, and the one buying signal. Six short lines. Then ask me five quick questions to lock it. Do not contact anyone.

## 2. Lock the ICP → create a private persona

> Here are my corrections: {{ANSWERS}}. Lock the ICP in five lines (who I sell to, exact titles, geography, buying signal, opener voice). Then create a private persona at private/personas/{{SLUG}}.yaml with target_industries, company_sizes, buyer_titles, geography (include/exclude), buying_signals, core_topics (the topics I want prospects to have posted or commented about recently), exclusions, search_keywords, research_sources, and my Google Sheet id. Validate it. Do not source yet.

## 3. Source (run the skill)

> Use the research-outreach-prospects skill with persona {{SLUG}}. Pilot 10 first, let me review, then run headless with --update-sheet. Read-only research only: prioritize people with a post or relevant comment about my core topics in the last 7 days but allow strong ICP matches without recent activity. For each lead put the verbatim recent post + link in column D, a Suggested Comment in F, and a Suggested Intro DM in G. Never send/connect/react/comment, never touch my human columns H–N, and stop on any login / CAPTCHA / checkpoint / rate-limit page.

## 4. Schedule (local)

> Create a local Codex scheduled task that runs `npm run source -- --persona {{SLUG}} --target 50 --headless --update-sheet` every weekday at my chosen time. Remind me it needs the computer on and awake and Codex desktop running.

## Commands (the real entry points)

```bash
npm run list-personas
npm run select-persona   -- --persona {{SLUG}}
npm run validate-persona -- --persona {{SLUG}}
npm run create-persona   -- --from approved-icp.json --slug {{SLUG}}
npm run setup-login      -- --persona {{SLUG}}          # headed manual login
npm run pilot            -- --persona {{SLUG}} --headless
npm run source           -- --persona {{SLUG}} --target 50 --headless --update-sheet
npm run dry-run          -- --persona {{SLUG}} --fixture test/fixtures/dry-run.json
npm run source           -- --persona {{SLUG}} --csv-only     # CSV-only fallback
npm run source           -- --persona {{SLUG}} --public-web   # no signed-in session
npm run source           -- --persona {{SLUG}} --connections  # research existing connections (opt-in)
```
