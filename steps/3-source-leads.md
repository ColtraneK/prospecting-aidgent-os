# Step 3 — Source leads from scratch

Goal: from nothing but the locked ICP, find real people who fit and write them into the sheet. Pick the method that matches your tool.

Both methods return the same six columns, in this exact order, matching columns A to F of the Leads tab:

`Name · Title / Company · LinkedIn (or profile URL) · Latest Post (or relevant link) · Why Them · Suggested Opener`

Leave the workflow fields (G to M) empty. Those are your human tracking.

---

## Method A — Public web (default, most reliable)

Use this in ChatGPT agent mode, or any browsing AI, and for scheduled runs. It needs no sign-in, so it never stalls on a login wall and it runs with your computer off.

1. Paste prompt 3 from [PROMPTS.md](../PROMPTS.md).
2. It searches the public web: public LinkedIn profiles that surface in search, company team and about pages, industry directories, podcast guest lists, conference speaker pages.
3. It returns 25 verified rows. Paste them into the Leads tab under the headers.

Frame it out loud: assisted, human-reviewed research, not bulk scraping. You review every row.

---

## Method B — Codex + Playwright (LinkedIn)

Use this when you are driving from Codex and want to source directly from LinkedIn. Codex writes and runs a Playwright script that connects to a browser you are already logged into, so no credentials are stored and nothing is automated on your behalf beyond reading pages you can see yourself.

Full method and a ready script: [sourcing/codex-playwright.md](../sourcing/codex-playwright.md) and [sourcing/linkedin_source.mjs](../sourcing/linkedin_source.mjs).

Short version:

1. Start Chrome with remote debugging and log into LinkedIn yourself.
2. Tell Codex to connect Playwright to that browser over CDP, run your ICP search, and extract the six columns to `leads.csv`.
3. Review `leads.csv`, then paste into the Leads tab.

This drives your own session for research you review. Pace requests politely, respect each platform's terms, and never message or connect automatically.

---

Next: [Step 4 — Schedule it](4-schedule.md)
