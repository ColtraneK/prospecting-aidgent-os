# Step 2 — Confirm the ICP and create a persona

Goal: turn the draft into a five-line contract and save it as a **private
persona** that drives every run.

Answer these five, then paste prompt 2 from [PROMPTS.md](../PROMPTS.md):

1. Did it get who you sell to right, or is it narrower?
2. Which exact titles? Real job titles, not departments.
3. What geography matters — include and exclude?
4. What is the buying signal, the observable fact that makes someone worth reaching?
5. How should the opener sound so it is yours, not a pitch?

Then create the persona (private, git-ignored):

```bash
npm run create-persona -- --from approved-icp.json --slug my-persona
npm run validate-persona -- --persona my-persona
npm run select-persona -- --persona my-persona
```

Personas support: business + website, offer, customer outcome, target
industries, company sizes, buyer titles, geography, buying signals, exclusions,
opener voice, search keywords, research sources, the Google Sheet id, and created
/ last-updated dates. See `personas/example-generic.yaml` for the shape (fake).

Next: [Step 3 — Source leads](3-source-leads.md)
