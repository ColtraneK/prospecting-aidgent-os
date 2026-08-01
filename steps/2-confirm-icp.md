# Step 2 — Confirm the ICP and create a persona

Goal: turn the draft into a five-line contract and save it as a **private
persona** that drives every run.

Answer these five, then paste prompt 2 from [PROMPTS.md](../PROMPTS.md):

1. Did it get who you sell to right, or is it narrower?
2. Which exact titles? Real job titles, not departments.
3. What geography matters — include and exclude?
4. What is the buying signal, the observable fact that makes someone worth reaching?
5. How should the opener sound so it is yours, not a pitch?

Two more, asked once, because they change what a run does:

6. Should ordinary runs also mine the people you are **already connected to**?
   Some of your best-fit prospects are already in your network — warm, and
   nobody works that list. Default is no. Saved as `include_connections`; when
   it is on, those rows are labelled **Connection** in Source Type so they stand
   out.
7. Which Google Sheet should this fill in? This system never creates one — it
   only writes to a sheet you own. If you do not have one, open the template
   below and click **Make a copy**; the copy is yours, in your Drive, with the
   seven tabs already built and no data in it.

   <https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy>

## Before you save it, say the titles out loud

Titles are matched as **substrings**. "Founder" matches "Founder & Fractional
CMO", "Co-Founder", "Founding Partner", and a large fraction of everyone on
LinkedIn. That is how one pilot run built for operations leaders came back with
ten marketers.

So before the persona is written, your agent reads the exact `buyer_titles` and
`exclusions` back to you as a list, and gets a yes on **the titles specifically**.
Saying "you suggest and proceed" earlier in the conversation does not count; that
is agreement to a proposal, not to a list you have not seen.

`npm run create-persona` and `npm run validate-persona` both print the titles,
the exclusions and the warm-first setting, and both print a **TARGETING WARNING**
for any one-word generic title. A warning is not a refusal, since a short title is
sometimes genuinely right, but it should never be sailed past in silence.

Then create the persona (private, git-ignored) and bind your sheet:

```bash
npm run create-persona -- --from approved-icp.json --slug my-persona
npm run validate-persona -- --persona my-persona
npm run select-persona -- --persona my-persona
npm run bind-sheet -- --persona my-persona --sheet <your-sheet-id-or-url>
npm run check-sheet -- --persona my-persona
```

Personas support: business + website, offer, customer outcome, target
industries, company sizes, buyer titles, geography, buying signals, **core
topics**, exclusions, opener voice, **audience phrase**, search keywords,
research sources, the Google Sheet id, and created / last-updated dates. See
`personas/example-generic.yaml` for the shape (fake).

Two of those do more work than they look like they do.

**Core topics** is what a run searches for. Sourcing walks LinkedIn content
searches on those topics, filtered to the past week, before it searches anyone by
job title. A topic missing here is a topic nobody gets found by, so make them the
words a good prospect would actually write, rather than category labels.

**Audience phrase** is how a message describes your audience when there is no
post to react to, like "fractional operators" or "independent advisory
principals". Leave it out and it falls back to "people in <your first title>
roles". It exists so a message never has to interpolate the prospect's own
headline, which is where "how Award-Winning Founder | 500+ Speaking Engagements |
…s are approaching this" came from.

Next: [Step 3 — Source leads](3-source-leads.md)
