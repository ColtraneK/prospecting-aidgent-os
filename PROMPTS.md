# Prompts

Replace the `{{PLACEHOLDERS}}`, then copy the block. Every prompt is draft-only and keeps outward action human-approved. Placeholders: `{{URL}}`, `{{ANSWERS}}`, `{{GEO}}`, `{{TIME}}`, `{{TIMEZONE}}`.

## 1. Scan

> Scan this business and tell me who its best-fit prospects are. Website: {{URL}}. Read the homepage, the about page, and the services or pricing pages. Then draft a tight ICP I can correct: what they sell, the outcome they deliver, who buys it (industry, size, titles), where those buyers are, and the one signal that says someone is a fit. Six short lines. Do not contact anyone.
>
> Then ask me five quick questions: did you get who I sell to right, which exact titles, what geography, what signal means someone is worth reaching, and how should the opener sound?

## 2. Lock the ICP

> Here are my corrections: {{ANSWERS}}. Lock the ICP in 5 lines: who I sell to, the exact titles, the geography, the buying signal, and my opener voice. Then wait; do not source until I say go.

## 3. Source from scratch (public web, default)

> Using the locked ICP, find me 25 real prospects from scratch using public web search only. Do not sign into LinkedIn or any site. Good sources: public LinkedIn profiles that show up in search, company team and about pages, industry directories, podcast guest lists, and conference speaker pages. For each person: confirm they fit and are in {{GEO}}; capture a public profile link and, if visible, something recent they said or did; write a one-line Why Them; and draft a short, no-pitch opener that reacts to something specific. Return each row in this exact order: Name, Title / Company, LinkedIn (or profile URL), Latest Post (or a relevant link), Why Them, Suggested Opener. Leave workflow fields empty. Draft only; contact no one. Stop at 25 and show me.

## 3b. Source from LinkedIn (Codex + Playwright)

See [sourcing/codex-playwright.md](sourcing/codex-playwright.md) for the full method. The one-line kickoff:

> Read sourcing/codex-playwright.md and sourcing/linkedin_source.mjs. Connect Playwright to my already-open, logged-in Chrome over CDP (do not store credentials, do not log in for me). Using my locked ICP, collect 25 people from LinkedIn search results, capture Name, Title / Company, profile URL, a recent post or activity link, a one-line Why Them, and a short no-pitch opener. Write them to leads.csv in the Name, Title / Company, LinkedIn, Latest Post, Why Them, Suggested Opener order. Pace requests politely, do not message or connect with anyone, and stop at 25 for my review.

## 4. Flip to a schedule

> Save this exact sourcing job as a scheduled task that runs every weekday at {{TIME}} {{TIMEZONE}} and appends 50 fresh prospects matching my locked ICP to the Leads tab, using public web search only and no sign-ins. Fresh means the name and profile URL are not already in the sheet. Do not erase or overwrite existing rows or human tracking. Do not message, connect, comment, or post; only add verified lead rows in columns A:F. Leave all workflow fields empty for me.
