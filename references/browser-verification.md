# Codex Browser verification

Use the separate Codex Browser profile. The user signs in to LinkedIn manually.

For every candidate in the current run:

1. Open the exact LinkedIn profile URL from the run artifact.
2. Confirm the profile represents the named person.
3. Record visible headline/title, company, and location. Leave anything not visible blank.
4. Record the visible relationship as `1st`, `2nd`, `3rd+`, `Pending`, or `Unknown`.
5. Note material profile evidence that affects ICP fit or contradicts the public source/Apify record.
6. Do not click Connect, Message, Follow, React, Comment, Share, or Post.

Save JSON like:

```json
{
  "verifications": [
    {
      "url": "https://www.linkedin.com/in/example-person/",
      "name": "Example Person",
      "headline": "Visible headline",
      "title": "Visible role",
      "company": "Visible company",
      "location": "Visible location",
      "degree": "2nd",
      "connection_status": "2nd",
      "notes": "Any conflict or useful corroboration"
    }
  ]
}
```

The verification command adds the checked timestamp. If LinkedIn blocks access or the identity cannot be confirmed, stop the candidate and record the blocker rather than guessing.
