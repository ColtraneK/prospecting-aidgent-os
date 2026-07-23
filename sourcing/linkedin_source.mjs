// linkedin_source.mjs — DEPRECATED shim.
//
// The old localhost-CDP scaffold (attach to an already-open Chrome on port 9222,
// hardcoded "founder" keyword, CSV-only output) has been replaced by the local
// worker in ../src/worker.mjs, which drives a DEDICATED PERSISTENT Chrome profile
// you sign into manually, is persona-driven, read-only, blocker-aware, and
// maintains the Google Sheet in place.
//
// This file is kept only so older instructions that import it still resolve. Use
// the CLI instead:
//   npm run setup-login -- --persona <slug>
//   npm run source      -- --persona <slug> --target 50 --headless --update-sheet
// See ../src/worker.mjs and ../sourcing/codex-playwright.md.

export { setupLogin, runResearch, FORBIDDEN_ACTION_LABELS, BlockerError } from "../src/worker.mjs";

export const DEPRECATED = true;
export const REPLACEMENT = "src/worker.mjs";
