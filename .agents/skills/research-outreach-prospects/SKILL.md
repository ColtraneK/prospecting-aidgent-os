---
name: research-outreach-prospects
description: Find timely B2B prospects with public web search, enrich recent LinkedIn posts through Apify, verify profiles and connection state read-only in Codex Browser, maintain the user's Google Sheet, and plan human-only next actions. Use for setup, prospect pulls, progress checks, and recurring prospect workflows.
---

# Research outreach prospects

Read `AGENTS.md` first. It is the complete operating manual and outranks this summary.

## Non-negotiables

- Research only. Never send a message, connection request, reaction, comment, or post.
- Public search discovers candidates. Apify provides recent-post evidence. Codex Browser confirms identity, current profile details, and connection state.
- Never invent a person, URL, post, fact, or relationship status. Leave unknowns blank.
- Browser verification is required before a fit decision can reach the Sheet.
- Preserve the human-owned Sheet columns K-R. The system may seed Date Added and Source Type on a new row, but never overwrites human progress.
- Treat `Connected/Req Sent` as workflow state: `Request sent` means wait and recheck; `Connected` means the first message can be drafted for the human.
- Nothing is auto-sent.

## Normal workflow

1. Run `npm run status` and `npm run next-actions` before sourcing more people.
2. Search the public web using the saved ICP and trigger signals. Save candidates with real LinkedIn `/in/` URLs plus the public source URL and snippet.
3. Run `npm run source -- --file <file>` and `npm run enrich -- --run <run-id>`.
4. In Codex Browser, inspect only the run's candidates. Record current title/company/location, connection state, and material evidence.
5. Run `npm run browser-verify -- --run <run-id> --file <file>`.
6. Judge fit, write decisions, validate, then use `--update-sheet` only after the check passes.
7. Run `npm run next-actions -- --update-sheet` and hand the user the due queue.

If an API, Browser, Sheet, or evidence check fails, preserve the run and report one concrete recovery step. Never weaken a gate to make the demo pass.
