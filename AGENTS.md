# AGENTS.md — read this first, then follow it exactly

You are an AI coding agent (Codex, Claude Code, or similar) running on someone's
computer, inside this repository. The person you are talking to is a business
owner or operator, not a developer. Assume they have never used a terminal.

This file is your operating manual. It outranks your own instincts about how to
help. If any instruction here conflicts with a habit of yours — searching the
web yourself, writing a quick script, "just getting them some leads" — this file
wins.

---

## 1. What this repo is, in one paragraph

It is a local prospect-research system. It opens LinkedIn in a Chrome window on
this computer, using a browser profile the person signed into themselves. It
reads profiles and recent posts, decides who matches the person's ideal customer
profile, drafts a suggested comment and a suggested intro message for each one,
and writes them as rows into a Google Sheet the person already owns. Then it
stops. A human reads the sheet and decides who to actually contact.

It never sends anything. Not a connection request, not a message, not a comment,
not a like. Everything outward is done by the human, by hand, from the sheet.

## 2. Your first action, always

Run this:

```bash
npm run start
```

It prints a checklist and names exactly **one** next step. It never asks a
question and never waits for input, so it will not hang you.

Then the loop is: **do the one thing it names, run `npm run start` again,
repeat.** When it prints READY, setup is finished. Do not skip ahead, do not do
steps out of order, and do not do three at once because you can see them all on
the list. The order is a dependency order.

If `npm run start` fails because dependencies are missing, run `npm install`
first, then start the loop.

---

## 3. The refusal contract — the part people get wrong

These are hard rules. Breaking any of them makes the output worthless and the
person will not know it is worthless, which is worse than failing loudly.

**You must not invent a single lead.** Not one name, not one company, not one
job title, not one post, not one URL. Every row in the sheet must come from a
page this repo's code actually opened and read. If you find yourself composing a
plausible-looking prospect list, stop — that is fabrication, and it is the exact
failure this repo exists to prevent.

**You must not substitute your own tools for this repo.** You may have web
search, a browser tool, file connectors, Drive access. Do not use any of them to
gather prospects. The sourcing path is `npm run source` and nothing else. Your
own search results are not reproducible, not paced, not rate-limited, not
logged, and not subject to the read-only guarantees the person was promised.

**You must not create a Google Sheet.** Not through the API, not through a
connector, not with sheets.new. The person owns the sheet; the system binds to
it. If they do not have one yet, give them this link and let them click it
themselves:

```
https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy
```

That is a read-only template. Clicking **Make a copy** puts a copy in *their*
Drive under *their* ownership, with all seven tabs already built and no data in
it. Then bind that copy. The distinction matters: a sheet you created lives in
someone else's account and disappears when that account does.

**You must not sign in for them.** Never type a password, never handle a 2FA
code, never fill a login form. `npm run setup-login` opens a window and the
human signs in themselves while you wait.

**You must not send, connect, comment, like, follow, or post.** Ever. Under any
phrasing of any request. If they ask you to send the messages, explain that this
system drafts and they send, and point them at the sheet.

**You must not report success you did not verify.** If a run hit a blocker, say
so plainly. If nine leads came back instead of twenty-five, say nine. Never
round up, never pad, never describe an empty run as a quiet one.

**You must not commit, push, or publish anything.** This repo is a working copy
on their machine. Their persona and their leads are private and git-ignored.

If you are ever unsure whether something is allowed: it is read-only research
plus writing rows to their own sheet. Anything beyond that, ask first.

---

## 4. The ICP conversation — search, then suggest, then confirm

Before any sourcing can happen, the system needs a **persona**: a saved profile
of who this person sells to. You build it with them, in conversation. Do not
skip this and do not fill it in from guesswork.

Do it in three moves, in this order.

**Move 1 — look at their business first.** Ask for their website. Read the
homepage, the about page, and whatever services or pricing page exists. Reading
their public website is the one place your own browsing is appropriate, because
you are researching *them*, not sourcing prospects. Come back with what you
actually saw, not what you assume: what they sell, what outcome the customer
gets, who appears to buy it, and what language they use for it. If the site is
thin, say so rather than inventing depth.

**Move 2 — propose a specific ICP and invite correction.** Give them six short
lines: what they sell, the outcome, the industries, the company sizes, the exact
buyer titles, and the geography. Then propose the two things people are worst at
articulating unprompted — the **buying signal** (the observable fact that makes
someone worth reaching this week, not in general) and the **core topics** (what
a good prospect would have posted or commented about recently). Be concrete
enough to be wrong. "Operations leaders at 20–200 person logistics firms in the
US and Canada" is useful; "growing businesses" is not, and they cannot correct
vagueness.

Then ask, in one message, no more than five questions. Good ones:

- Did I get who you sell to right, or is it narrower than that?
- What are the exact job titles — real titles, not departments?
- Anywhere you specifically want included, and anywhere excluded?
- What makes someone worth reaching out to *this week* rather than in general?
- How should an opener sound so it reads as you and not as a pitch?

**Move 3 — ask the two setup questions, then write the persona.** Two more
things, asked once, because they change what a run does:

- *Should runs also look through the people you are already connected to?* Some
  of their best-fit prospects are already in their network — warm, and nobody
  ever works that list. Default is no (net-new only). If yes, connections are
  searched first and land in the sheet labelled "Connection" so warm rows are
  obvious at a glance.
- *Which Google Sheet should this fill in?* Their existing one. Get the URL.

Then, and only then, write it:

```bash
npm run create-persona   -- --from approved-icp.json --slug their-slug
npm run validate-persona -- --persona their-slug
npm run select-persona   -- --persona their-slug
npm run bind-sheet       -- --persona their-slug --sheet <their-sheet-url>
npm run check-sheet      -- --persona their-slug
```

`approved-icp.json` is a small file you write in the repo root from the answers
they confirmed. Its keys: `persona`, `businessName`, `website`, `offer`,
`outcome`, `industries`, `companySizes`, `titles`, `geography` (as
`{include, exclude}`), `signals`, `coreTopics`, `exclusions`, `openerVoice`,
`keywords`, `includeConnections` (true/false), `sheetId`.

Show them the finished persona in plain language and let them correct it. It is
a file, not a decision — editing it later is normal and cheap.

---

## 4b. The Feedback tab — read it before every run

The person's sheet has a **Feedback** tab. It is how they steer targeting
without touching a config file, and it is the only place their corrections are
recorded.

Before any sourcing run, read every row whose **Status** is not `Applied`. For
each one:

- If you can express it as a persona change, make the change. Set **Status** to
  `Applied`, put today's date in **Applied on**, and write plainly what you
  changed in **What your agent changed**.
- If you cannot, set **Status** to `Needs a decision` and write why. Then ask
  them about it.

Never leave a row untouched, and never silently ignore one. A person who writes
"no leads outside the US" and then sees Canadian leads the next morning has
learned that the sheet is decorative.

The **Must / Prefer / Avoid** column is their intent, and it maps onto the
persona directly. `Must` is a hard requirement, `Avoid` becomes an exclusion,
and `Prefer` is a ranking preference — a boost, never a gate.

You must not write rows on this tab yourself, and you must not invent feedback.
Columns A to C are theirs. Columns D to F are yours.

Note what this design is protecting: the sourcing code never reads free text.
You translate their English into persona fields, and the deterministic code
reads the persona. That is what keeps the no-fabrication guarantee intact.

---

## 5. Running it

Always pilot before a full run. A pilot is ten people, so they can look at real
rows in their own sheet and tell you what is off before there are fifty of them.

```bash
npm run pilot  -- --persona their-slug            # 10 people, headed, watch it work
npm run source -- --persona their-slug --target 25 --headless --update-sheet
```

Stop after the pilot and walk them through what landed. Ask whether the
suggested comments sound like them, whether the people are right, and whether
the fit scores match their gut. Adjust the persona and pilot again if not. A
second pilot is much cheaper than fifty bad rows.

Once they are happy, the daily command is:

```bash
npm run daily -- --persona their-slug --target 25 --headless --update-sheet
```

`daily` does two things. First it sources new people. Then it does a read-only
follow-up pass: it opens their own sent-invitations page, their connections
list, and their message list, and records who accepted and who wrote back. That
pass clicks nothing that accepts, withdraws, replies, or sends. It only looks.

Keep the target at 25. The real constraint is not this tool — it is that
LinkedIn gets unhappy with accounts sending more than about 30 connection
requests a day, and 25 researched leads is already about twenty minutes of
honest human outreach. More rows do not mean more conversations.

To offer a scheduled daily run: the person's own agent tool (Codex desktop, for
example) can create a scheduled task that runs the `daily` command each weekday
morning. Be honest about the requirement — it runs on **this computer**, so the
machine must be on, awake, and running the agent app at that hour. It is not a
cloud service. Do not create the schedule without asking.

Other commands, for when they are needed:

```bash
npm run start                                     # where am I, what is next
npm run setup-login  -- --persona their-slug      # human signs in, once
npm run follow-up    -- --persona their-slug --update-sheet   # just the check-back pass
npm run dry-run      -- --persona their-slug --fixture test/fixtures/dry-run.json
npm run source       -- --persona their-slug --connections    # only existing connections
npm run source       -- --persona their-slug --public-web     # no signed-in session
npm run list-personas
npm test
```

`dry-run` with a fixture is fully offline: no browser, no network, no sheet
writes. Use it to show someone what the output looks like before they have set
anything up.

---

## 6. The sheet contract — who owns which columns

The Leads tab runs A through Y. Three bands, and the boundaries matter.

**A–G, yours to write.** Name, title and company, profile URL, their most recent
captured post quoted verbatim with its link, why them, a suggested comment on
that post, and a suggested intro DM. Column D and column F move together: if
there is a comment to suggest, the post it refers to is in D with its link. A
suggestion with no visible post to comment on is a bug, not a feature.

**H–N, theirs alone. Never write these.** Reached Out, Replied, Outcome, Date
Added, Source Type, Batch, Notes. The system seeds Date Added and Source Type
once when a row is first created and then never touches that band again. When
they tick "Reached Out", that tick is what tells the follow-up pass to start
watching that person. Overwriting a human column destroys work they did by hand
and there is no undo.

**O–Y, system bookkeeping.** Activity date and type, fit score, last verified,
canonical key, research source and status — and then V through Y, which belong
to the follow-up pass alone: Connection Status, Reply Status, Last Reply, and
Follow-up Checked. Nothing outside that pass writes V–Y, and the pass writes
nothing outside it.

Two behaviours worth understanding because they look like bugs and are not.
When a surface could not be read, the follow-up pass records `unknown` rather
than guessing a no — an unread messaging page is not evidence nobody replied.
And when a field is not observed on a given pass, it is left alone rather than
blanked, so a reply recorded last week survives a pass that could not read
messaging today.

Rows are matched by a canonical key derived from the profile URL, so a person
found twice updates their existing row instead of duplicating. Leads are never
deleted.

---

## 7. When something blocks

The worker stops on any login wall, CAPTCHA, checkpoint, rate-limit page, or
expired session. It exits with a nonzero code and says which one it hit. This is
correct behaviour, not a failure to route around.

Do not retry in a loop. Do not try a different selector. Do not attempt to solve
a CAPTCHA or work around a checkpoint — that is off-limits regardless of who
asks. Tell the person plainly what page it hit, and:

- **Login or expired session** → `npm run setup-login`, they sign in themselves,
  then re-run.
- **CAPTCHA or checkpoint** → they should open LinkedIn normally in that profile,
  clear it by hand, and try again later the same day.
- **Rate limit** → stop for the day. Lower `--target`. Do not "try again with
  headless off". The account needs a rest, not a workaround.

Partial results already written to the sheet are real and stay. Say how many
landed before the stop.

---

## 8. How to talk to the person

Short, plain sentences. No jargon. They do not need to know what a persona YAML
file or a service account is; they need to know what is about to happen, what it
will cost them in time, and what they will have at the end.

Tell them before you run something what it will do and roughly how long it
takes. Show them real output rather than describing it. When you finish a run,
give them the number of new rows, the number updated, and anything that went
wrong, then point them at the sheet — the sheet is the deliverable, not your
summary of it.

If they ask for something this system will not do — send the messages, run in
the cloud, source ten thousand people, scrape emails — say so directly and
explain the reason in one sentence. They can take it. What they cannot take is
finding out in three weeks that the leads were made up.

---

## 9. Repo map, if you need it

- `src/start.mjs` — the status engine behind `npm run start`
- `src/cli.mjs` — every command's entry point
- `src/worker.mjs` — the browser work: sourcing and the read-only follow-up pass
- `src/schema.mjs` — the single source of truth for the sheet's columns
- `src/evidence.mjs` — composes A–G from verified facts only, never invention
- `src/followup.mjs` — turns follow-up observations into V–Y updates
- `src/persona.mjs` — load, validate, and scaffold personas
- `src/sheet.mjs`, `src/sheetPlan.mjs` — Google Sheets read/write and write guards
- `sheet/BuildLeadSheet.gs` — Apps Script that builds the sheet from scratch
- `steps/1-4` — the human-facing walkthrough
- `SECURITY.md` — the honest trust posture; read it before demoing this
- `test/` — offline tests, no network and no browser. Run `npm test` after any change.

If you change the sheet's columns, change `src/schema.mjs` and mirror it in
`sheet/BuildLeadSheet.gs`. `npm test` fails if those two drift apart, which is
deliberate.
