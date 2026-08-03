# Start here — workshop edition

This template turns Codex into a read-only B2B prospecting assistant. It discovers people from the public web, uses Apify to retrieve recent LinkedIn posts, asks you to confirm profile and connection details in Codex Browser, and maintains a Google Sheet. You remain responsible for every connection request and message.

## Paste this into a fresh Codex task

```text
Set up this prospecting system with me. I am nontechnical, so lead me one step at a time and explain only the action I need to take now.

1. If this repository is not already open, create a local folder, clone https://github.com/ColtraneK/prospecting-aidgent-os.git into it, and work inside the cloned repository. If it is already open, do not clone another copy.
2. Read AGENTS.md and follow it exactly.
3. Run npm install, npm run init-env, and npm run start.
4. Help me copy or build the Google Sheet, create a Google Cloud service account, share my Sheet with its client_email as Editor, bind it, and prove access with npm run check-sheet.
5. Help me add my Apify API token locally. Never print it back or commit it.
6. Open Codex Browser. Let me sign in to LinkedIn myself, then perform the read-only Browser verification step. Never send, connect, react, comment, or post.
7. Review my website and interview me briefly about my offer, ideal customer, buyer roles, exclusions, geography, timely trigger signals, and voice. Propose the ICP for my approval and save it.
8. Run a small demo: find candidates through public web search, source them, enrich recent posts with Apify, let me verify the profiles in Browser, qualify only evidence-backed leads, and update my Sheet.
9. Show me the due follow-up queue. Then help me create a recurring Codex scheduled task using the prompt in references/scheduled-task-prompt.md. Use this local project and do not auto-send anything.
```

## You will need

- Node.js 20 or newer.
- A Google account and Google Cloud service-account JSON key.
- An Apify account and API token.
- Codex Browser with you manually signed in to LinkedIn.
- Your website or a plain-language description of your business and ideal buyer.

Starter Sheet: <https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy>

Your credentials, ICP, run data, and downloaded evidence stay in git-ignored local files. Revoke any credential that is ever pasted into a chat, issue, or commit.

## The human part

The system drafts and prioritizes; it does not perform outreach. In the Sheet:

- Set **Connected/Req Sent** to `Request sent` after you invite someone.
- Change it to `Connected` when LinkedIn confirms the connection.
- Check **Replied** when they answer.
- Record the result in **Outcome** and useful context in **Notes**.

On later runs, `npm run next-actions` uses those fields to surface people who should be contacted or rechecked before it looks for more names.
