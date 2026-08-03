# Public web sourcing

The goal is a small, timely candidate set with evidence — not a large directory export.

## Search construction

Combine a public LinkedIn profile constraint with one buyer role or problem and one timely signal. Examples:

```text
site:linkedin.com/in/ "operations director" "hiring"
site:linkedin.com/in/ founder "client onboarding" "automation"
site:linkedin.com/in/ "VP Sales" "new role"
```

Also use company sites, event speaker pages, association directories, podcasts, and credible news when they identify a professional and explain why the timing matters. The saved candidate still needs a real LinkedIn `/in/` profile URL for Apify enrichment.

## Candidate file

Save JSON like:

```json
{
  "candidates": [
    {
      "name": "Example Person",
      "url": "https://www.linkedin.com/in/example-person/",
      "source_url": "https://example.com/source-page",
      "source_query": "site:linkedin.com/in/ example trigger",
      "source_snippet": "Short public snippet supporting the nomination",
      "why_nominated": "The specific ICP and timing signal"
    }
  ]
}
```

Do not invent missing fields. Reject directory pages, `/company/` URLs, placeholder profiles, and candidates whose only justification is a title. Deduplicate before enrichment. Use `refresh: true` only when intentionally rechecking a person already in the Sheet.

## Evidence discipline

- A snippet nominates; it does not confirm current employment or connection state.
- Apify post text supports recent-activity claims, with its post URL and date.
- Codex Browser confirms the current profile and visible connection state.
- Conflicts are recorded, not silently reconciled. Current first-party profile information normally wins for identity fields, while the original source remains in provenance.
