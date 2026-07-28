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

Then create the persona (private, git-ignored) and bind your sheet:

```bash
npm run create-persona -- --from approved-icp.json --slug my-persona
npm run validate-persona -- --persona my-persona
npm run select-persona -- --persona my-persona
npm run bind-sheet -- --persona my-persona --sheet <your-sheet-id-or-url>
npm run check-sheet -- --persona my-persona
```

Personas support: business + website, offer, customer outcome, target
industries, company sizes, buyer titles, geography, buying signals, exclusions,
opener voice, search keywords, research sources, the Google Sheet id, and created
/ last-updated dates. See `personas/example-generic.yaml` for the shape (fake).

Next: [Step 3 — Source leads](3-source-leads.md)
