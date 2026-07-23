# Aidgent OS

Build a human-approved outreach agent in an afternoon. Point an AI at a business, confirm who its buyers are in a few questions, and have it source real, matching prospects into a simple Google Sheet. Then put it on a schedule. The agent reads and drafts. It never sends, connects, comments, or posts. Every outward action is something you do yourself.

This repo is the follow-along for a live build. Work the four steps in order.

## The four steps

1. [Scan the business](steps/1-scan-business.md) - the AI reads a website and drafts your ICP.
2. [Confirm the ICP](steps/2-confirm-icp.md) - five quick questions lock who to look for.
3. [Source leads](steps/3-source-leads.md) - find real, matching people from scratch.
4. [Schedule it](steps/4-schedule.md) - the same job every weekday, hands-off.

All four prompts, ready to copy, are in [PROMPTS.md](PROMPTS.md).

## Two ways to source (Step 3)

- **Public web (default, most reliable).** Works in any browsing AI, including scheduled runs with your computer off. No sign-ins: public profiles that surface in search, company team pages, directories, podcast and conference listings.
- **Codex + Playwright (LinkedIn).** If you are driving this from Codex, source directly from LinkedIn using your own logged-in browser via Playwright. Codex writes and runs the script; it connects to a browser you are already signed into, so no credentials are stored and you review every row. See [sourcing/codex-playwright.md](sourcing/codex-playwright.md).

Both methods produce the same six columns and feed the same sheet.

## The sheet

Leads land in a Google Sheet. Columns A to F are the agent's output; G to M are your human tracking. Full schema and a one-click builder are in [sheet/](sheet/SHEET.md).

## The one rule

The agent reads and drafts. You approve and act. Nothing sends without you. See [SECURITY.md](SECURITY.md).

## Quickstart

1. Build or copy the Lead Sheet (see [sheet/](sheet/SHEET.md)).
2. Open [PROMPTS.md](PROMPTS.md). Run prompt 1 with a website, answer the five questions, run prompt 2.
3. Run prompt 3 to source. Paste the rows into the Leads tab starting at the first empty row under the headers.
4. When it works, run prompt 4 to put it on a schedule.

---

An open starter kit from Aidgentic. aidgentic.com · MIT licensed.
