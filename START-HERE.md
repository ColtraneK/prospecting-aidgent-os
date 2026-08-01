# Start here

You do not need a GitHub account or any coding. You need about 30–45 minutes,
a LinkedIn account you already use, and a Google account.

## Before you paste: let your agent work

Run your agent (Codex, Claude Code, or similar) with **workspace-write sandbox
and on-request approvals for this folder**. A research run is dozens of small
file reads and commands; approving each one by hand turns a ten-minute pilot
into 41 permission prompts. Scope the trust to this folder only.

## The paste block

```
Set up my prospect research system.

1. Make a folder called prospecting in my home directory and work inside it.
2. Get the code:
   git clone https://github.com/ColtraneK/prospecting-aidgent-os.git .
   If git is not available, download and unzip
   https://github.com/ColtraneK/prospecting-aidgent-os/archive/refs/heads/main.zip
   into that folder instead.
3. Read AGENTS.md in the repo root and follow it exactly.
4. Run `npm install`, then `npm run start`, and work the checklist it prints
   one step at a time until it says READY.
5. Do the Google Sheet and the service account FIRST: I copy the sheet
   template myself (Make a copy), you walk me through the service-account
   key, I share the sheet with its client_email as EDITOR, and you prove it
   with `npm run check-sheet` before anything else.
6. Then the LinkedIn session, proven with `npm run check-login`. Never type
   my password or touch my 2FA.
7. Then interview me about my business ONCE: look at my website, propose an
   ICP, let me correct it, confirm it back to me, and save the persona.
8. Never invent leads and never use your own web search to find prospects.
   Everything comes from this repo's commands.
```

## What happens after setup

Each run is a short loop your agent drives (see AGENTS.md):

1. It crafts LinkedIn searches for your topics and opens them with
   `npm run open` — read-only, paced, budgeted.
2. It nominates the people it judges worth a look, and `npm run inspect`
   opens every profile itself and captures what they actually posted,
   word for word.
3. It judges each candidate against your ICP, drafts a comment and an intro
   message that quote the person's own post, and `npm run qualify` checks
   every draft in code before writing rows to your sheet.

Then it stops. **Nothing is sent.** You open the sheet, pick the people worth
your time, and send things yourself. Every message suggestion must quote at
least four consecutive words of the person's real post — a message about a
post nobody wrote cannot reach your sheet.

You steer it in plain English on the sheet's **Feedback** tab; your agent
applies each note to the ICP and records what changed.

## The honest limitations

It runs on your computer, not in the cloud: machine on, awake, agent running.
If LinkedIn shows a CAPTCHA or rate-limit page, the tool stops and tells you —
clear it by hand, try later. Daily budgets (120 page opens, 60 profile
inspections) are safety rails, not settings. The signed-in Chrome profile and
the `li_at` cookie are real credentials; keep them out of shared drives.

If something goes wrong, ask your agent where you are up to — `npm run start`
names exactly one next step, and AGENTS.md obliges it to tell you the truth
about what happened.

[SECURITY.md](SECURITY.md) is worth reading before you demo this to anyone.
