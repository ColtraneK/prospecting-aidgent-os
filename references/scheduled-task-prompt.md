# Scheduled task prompt

Test the full workflow manually before scheduling it. Create the Codex task against this local project; the computer must remain on and awake.

Suggested weekly prompt:

```text
Read AGENTS.md and operate this prospecting system read-only.

1. Run npm run status and report any blocked or incomplete run.
2. Run npm run next-actions. Prioritize existing Sheet rows: replied conversations, connected people not yet contacted, connection requests due for recheck, and unreplied outreach due for follow-up.
3. Do not send, connect, react, comment, or post. Draft only for human review.
4. If the existing queue is manageable and setup is healthy, use the saved ICP to find a small batch of timely candidates through public web search. Preserve source URLs, snippets, and why-now signals.
5. Run the source and Apify enrichment stages. Use Codex Browser read-only to verify every profile and visible connection state before qualification.
6. Qualify only evidence-backed candidates, update the Google Sheet, calculate next actions, and append the run log.
7. Finish with: setup health, run status, rows added/refreshed, leads requiring human action now, blocked items, and the single best next step.

If login, CAPTCHA, API, Sheet, or evidence verification blocks progress, preserve the run, do not weaken safeguards, and report the exact recovery step.
```

A daily cadence suits active outreach; weekly is safer for a workshop demo. Keep batch sizes small enough that the user can actually review and act on the queue.
