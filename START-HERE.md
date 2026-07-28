# Start here

You do not need a GitHub account. You do not need to know how to code. You need
about 30 to 60 minutes, a LinkedIn account you already use, and a Google Sheet.

---

## The paste block

Open Codex (or Claude Code) on your computer and paste this, exactly as it is:

```
Set up my prospect research system.

1. Make a folder called prospecting in my home directory and work inside it.
2. Get the code:
   git clone https://github.com/ColtraneK/prospecting-aidgent-os.git .
   If git is not available or that fails, download and unzip
   https://github.com/ColtraneK/prospecting-aidgent-os/archive/refs/heads/main.zip
   into that folder instead.
3. Read AGENTS.md in the repo root and follow it exactly, start to finish.
4. Run `npm install`, then `npm run start`, and work the checklist it prints
   one step at a time until it says READY.
5. Interview me about my business and my ideal customer before sourcing anything.
   Look at my website first, propose an ICP, and let me correct it.
6. Do not invent any leads. Do not use your own web search to find prospects.
   Everything comes from the repo's commands.
```

That is all you have to do. Everything below is just so you know what is
happening to your computer and your accounts.

---

## What that paste block actually does

**It downloads a public folder of code onto your machine.** `git clone` copies a
public repository — no account, no login, nothing shared back. If your computer
does not have `git`, the ZIP link is the same files in a zip archive. The repo
is public and readable in a browser if you want to look before you run it:
[github.com/ColtraneK/prospecting-aidgent-os](https://github.com/ColtraneK/prospecting-aidgent-os).

**It points your AI agent at a file called `AGENTS.md`.** That file is the real
instruction manual — several pages of rules the agent has to follow, including a
list of things it is not allowed to do. That is the whole design: the
complicated parts live in the repo, so the thing you paste stays twelve lines
long. If you are curious, `AGENTS.md` is worth a read; it is written in plain
English on purpose.

**It starts a checklist.** `npm run start` looks at what is set up so far and
tells you the single next thing to do. Then you do that one thing and run it
again. It never asks you a question you have to answer in a terminal, and it
never gets stuck waiting. You will run it maybe eight times during setup, and
after that whenever you want to check the system is still healthy.

---

## What you will be asked for along the way

**A separate Chrome profile.** An empty folder that becomes a Chrome profile
used only by this tool. Your normal browser, bookmarks, and other logins are
untouched.

**A one-time LinkedIn sign-in.** A Chrome window opens and you sign in yourself,
including any two-factor step. The tool never types your password and never
touches your 2FA. It just waits for you to finish and closes.

**A Google service-account key.** This is the fiddliest part, and it is a
one-time thing: a small JSON file from Google Cloud that lets the tool write to
your sheet without you being logged in. You share your sheet with an email
address from that file, exactly like sharing with a colleague. Your agent will
walk you through it, and `README.md` has the steps.

**Your Google Sheet.** Your own, existing sheet. This system will never create
one for you. If you do not have one yet, `sheet/BuildLeadSheet.gs` builds the
whole thing — tabs, columns, dropdowns — in a blank sheet in about a minute.

**About twenty minutes of conversation about your business.** Your agent reads
your website, proposes who it thinks your ideal customer is, and you correct it.
This is the part that determines whether the leads are any good, so it is worth
the twenty minutes. It ends up saved as a file you can edit later.

---

## What happens after setup

You run one command a day, or schedule it to run itself:

```
npm run daily
```

It researches about 25 people who match your ICP, and writes them into your
sheet with, for each one: their name and role, their profile link, their most
recent post quoted word for word with a link to it, why they are a fit, a
suggested comment on that post, and a suggested intro message.

Then it checks back on the people you already reached out to — who accepted your
connection request and who wrote back — and records that in the sheet too.

Then it stops. **Nothing is sent.** No connection requests, no messages, no
comments, no likes. You open the sheet, pick the people worth your time, and
send things yourself. That is roughly twenty minutes of work against a list that
took you nothing to build.

Twenty-five a day is deliberate. LinkedIn starts objecting to accounts sending
much more than thirty connection requests a day, and twenty-five well-researched
people is already more than most people follow up on properly.

---

## The honest limitations

It runs on your computer, not in the cloud. A scheduled daily run needs the
machine on, awake, and running your agent app at that hour. If your laptop is
shut, nothing happens — you just run it when you open it.

Scheduled tasks need a paid agent plan (OpenAI Plus, if you are using Codex).
Without one, everything still works, you just start the run yourself.

If LinkedIn shows a CAPTCHA, a checkpoint, or a rate-limit page, the tool stops
and tells you. It will not try to get around it, and you should not ask it to.
Clear it by hand in that browser profile and try again later.

The signed-in Chrome profile is a real credential. Anyone with that folder can
act as you on LinkedIn. Keep it somewhere sensible and do not put it in a shared
drive.

---

## If something goes wrong

Run `npm run start`. Nine times out of ten it will name the problem and the fix.

If it does not, tell your agent exactly what you saw. It has `AGENTS.md`, which
has a section on what to do when a run is blocked — and, importantly, a rule
that it has to tell you the truth about what happened rather than paper over it.

---

Next: [Step 1 — Scan the business](steps/1-scan-business.md) ·
[SECURITY.md](SECURITY.md) is worth reading before you demo this to anyone.
