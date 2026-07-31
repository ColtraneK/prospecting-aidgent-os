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
5. Do the Google Sheet and the service account FIRST, before anything about
   LinkedIn or my ICP. Walk me through it in this order and do not skip ahead:
   a. Have me open the template link and click Make a copy, so the sheet is
      mine, in my Drive. Never build one from a blank sheet.
   b. Walk me through creating a Google service-account key and have me put
      the full path to its .json file in GOOGLE_APPLICATION_CREDENTIALS.
   c. Tell me to open that .json, copy the client_email value, then open my
      sheet, click Share, paste that address, set it to EDITOR, and Send.
      Say this as its own step and wait for me to confirm I have done it.
      The service account is a different Google identity from my own login,
      so being able to open the sheet myself proves nothing.
   d. Run `npm run check-sheet` and show me the result. If it fails with a
      permission error, I did not finish step c. Do not continue until it
      passes.
6. Only then set up the LinkedIn session, and verify it with
   `npm run check-login`. Do not tell me the setup is ready because the
   checklist says so; tell me what check-login and check-sheet actually said.
7. Interview me about my business and my ideal customer before sourcing anything.
   Look at my website first, propose an ICP, and let me correct it.
8. Do not invent any leads. Do not use your own web search to find prospects.
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

**It installs the pieces the code needs.** `npm install` pulls down a browser
engine along with the Google and YAML libraries, so on a normal connection it
takes a few minutes and prints very little while it works. That is the one step
in the whole setup that looks like it has frozen when it has not. Leave it
alone until it gives you your prompt back.

**It points your AI agent at a file called `AGENTS.md`.** That file is the real
instruction manual — several pages of rules the agent has to follow, including a
list of things it is not allowed to do. That is the whole design: the
complicated parts live in the repo, so the thing you paste stays twelve lines
long. If you are curious, `AGENTS.md` is worth a read; it is written in plain
English on purpose.

**It starts a checklist.** `npm run start` looks at what is set up so far and
tells you the single next thing to do. Then you do that one thing and run it
again. It never asks you a question you have to answer in a terminal, and it
never gets stuck waiting. You will run it about eleven times during setup, and
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
walk you through it — `npm run start` prints every step when you get there, and
`README.md` has the same list.

**Your Google Sheet.** Your own sheet — this system will never create one for
you. If you do not have one yet, open the template below and click **Make a
copy**. The copy is yours, in your Drive, with all seven tabs, columns, and
dropdowns already built and nothing in it:

<https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy>

**And then you must share that sheet with the service account.** This is a
separate action from making the sheet, in a different Google product, and it is
the single step people skip. Open the `.json` key file, copy the `client_email`
value — it ends in `.iam.gserviceaccount.com` — then open your sheet, click
**Share**, paste that address, set it to **Editor**, and Send. Confirm it worked
with `npm run check-sheet`; nothing on your computer can tell whether you did
it, so that command is the only thing that knows.

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

It keeps researching until 25 qualified leads have been added, and writes them into your
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
