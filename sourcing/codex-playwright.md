# Codex + Playwright — source from LinkedIn

When you are driving this from Codex, you can source directly from LinkedIn instead of the public web. The trick is to drive a browser **you are already logged into**, over the Chrome DevTools Protocol (CDP), so Playwright never handles your password and never logs in on your behalf. You are doing assisted research on pages you can see yourself, and you review every row before anything happens.

Use this responsibly: it is your own session, human-reviewed, paced politely, and it never messages, connects, or comments. Respect LinkedIn's terms and keep volumes low. If you would not do it by hand at a human pace, do not script it.

## The method

1. **Start Chrome with remote debugging and log in yourself.**

   ```bash
   # macOS
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 --user-data-dir="$HOME/.aidgent-chrome"

   # Windows (PowerShell)
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
     --remote-debugging-port=9222 --user-data-dir="$env:USERPROFILE\.aidgent-chrome"
   ```

   In that Chrome window, sign into LinkedIn normally. Leave it open.

2. **Tell Codex to connect and source.** Point Codex at this repo and paste:

   > Read sourcing/codex-playwright.md and sourcing/linkedin_source.mjs. Connect Playwright to my already-open, logged-in Chrome over CDP at http://localhost:9222 (do not store credentials, do not log in for me). Using my locked ICP, open LinkedIn people-search results built from my titles, geography, and keywords. For each of 25 people, capture Name, Title / Company, profile URL, a recent post or activity link if visible, a one-line Why Them, and a short no-pitch opener. Write them to leads.csv in that order. Add a polite delay between profiles, do not message or connect with anyone, and stop at 25 for my review.

3. **Codex adapts the selectors.** LinkedIn's HTML changes often, so `linkedin_source.mjs` is a working scaffold, not a guarantee. Let Codex read the live DOM and adjust the selectors. That is exactly the kind of thing Codex is good at.

4. **Review `leads.csv`, then paste into the Leads tab** (columns A to F). Fill the human-tracking columns (G to M) as you work each person.

## Guardrails

- Your own logged-in session over CDP. No stored credentials, no automated login.
- Read-only. The script collects public-to-you profile data. It does not click Connect, send messages, or leave comments.
- Pace it. A short randomized delay between profiles, a small daily cap. This is research, not scraping.
- You are the only actor who reaches out. The agent drafts; you decide and send.

## Why not the cloud browser for LinkedIn

A hosted cloud browser cannot sign into sites, so it cannot see logged-in LinkedIn search. That is why the default method (Method A) uses the public web, and why LinkedIn sourcing uses your own local session through Playwright instead.
