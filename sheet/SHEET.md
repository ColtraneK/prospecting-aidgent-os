# The Lead Sheet

Copy the hosted template. It is already built; attendees never run Apps Script.
Nothing is ever sent automatically.

Starter Sheet: <https://docs.google.com/spreadsheets/d/1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g/copy>

The visible **Leads** fields are: Name, Title / Company, LinkedIn/profile URL,
Recent Signal, Evidence Link, Why Them, Suggested Opener, Fit Score,
Verification / Connection, Verified On, Next Step, Next Follow-up, Connection
Status, Reached Out On, Replied, Outcome, Date Added, and Notes.

The last six are the person's working record. Codex never changes their values
on an existing row. Research details and durable run metadata live locally in
ignored files, not in a maze of extra Sheet columns.

## Adapting a changed Sheet

Codex maps the live header row every time it reads or writes. You may reorder
fields, add columns, and use familiar alternatives such as `Recent Signal`,
`Evidence Link`, `Suggested Opener`, `Connection Status`, and `Next Step`.
Unrecognized columns remain untouched.

The system must still identify a person and a profile URL. For an unusual custom
name, Codex can create a private mapping file and run:

```bash
npm run map-sheet -- --file mapping.json
```

This mapping is local and git-ignored. It does not rename columns or modify
existing lead data. Never rebuild a live Sheet.
