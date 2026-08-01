#!/usr/bin/env node
// cli.mjs — command dispatcher for the local prospect-research worker.
//
// The v6 run loop — the agent explores and judges; the code verifies, paces,
// and writes:
//
//   open      open ONE allowed LinkedIn URL, save HTML + screenshot for the agent
//   inspect   open every nominated profile, capture evidence first-hand
//   qualify   validate the agent's decisions + drafts, write fit rows to the sheet
//
// Setup and upkeep:
//   start | init-env | setup-login | check-login | save-persona | bind-sheet |
//   check-sheet | feedback
//
// Nothing outward is ever sent. See SECURITY.md.

import fs from "node:fs";
import path from "node:path";
import { parseFlags, resolveConfig, loadDotEnv, upsertDotEnv, DOTENV_PATH, REPO_ROOT } from "./config.mjs";
import { preflightSession, formatSessionRefusal, isPlaceholderProfilePath, shouldRememberProfile, writeSessionProof } from "./session.mjs";
import { recordSheetProof } from "./verified.mjs";
import {
  getPersona, personaSheetId,
  resolvePersonaPath, loadPersonaFile,
  extractSheetId, isPlaceholderSheetId, isSharedTemplateId, sheetSetupHelp,
  sheetUrlFor,
} from "./persona.mjs";
import { makeRunId, buildRunReport, formatRunReport } from "./runlog.mjs";
import { createBudget, formatBudgetRefusal, BUDGET_STATE_PATH } from "./budget.mjs";

const SELECTED_FILE = path.join(REPO_ROOT, "private", "selected-persona.txt");

async function main() {
  const [, , command, ...rest] = process.argv;
  const flags = parseFlags(rest);
  switch (command) {
    case "start": return cmdStart(flags);
    case "init-env": return cmdInitEnv();
    case "setup-login": return cmdSetupLogin(flags);
    case "check-login": return cmdCheckLogin(flags);
    case "open": return cmdOpen(flags);
    case "inspect": return cmdInspect(flags);
    case "qualify": return cmdQualify(flags);
    case "feedback": return cmdFeedback(flags);
    case "bind-sheet": return cmdBindSheet(flags);
    case "check-sheet": return cmdCheckSheet(flags);
    default:
      console.log("Unknown command. See: start | init-env | setup-login | check-login | open | inspect | qualify | feedback | bind-sheet | check-sheet");
      process.exit(2);
  }
}

/**
 * Refuse, before a browser exists, any run that cannot have a LinkedIn
 * session. Without this the first navigation lands on the login wall and the
 * report says `login: login page detected` — which reads as LinkedIn blocking
 * us, not as "this machine was never configured".
 */
function assertSession(config) {
  const v = preflightSession({ chromeProfile: config.chromeProfile, liAt: config.liAt });
  if (!v.ok) fail(formatSessionRefusal(v));
  return v;
}

/**
 * Write the profile path a command just PROVED works back into .env, so the
 * next command (a new shell, tomorrow's run) finds the same session. Only the
 * path is ever written; a pasted li_at cookie is a secret and stays wherever
 * the person put it.
 */
function rememberProfilePath(config, { quiet = false, proven = true } = {}) {
  if (proven && !shouldRememberProfile({ chromeProfile: config.chromeProfile, liAt: config.liAt })) return null;
  if (typeof config.chromeProfile !== "string") return null;
  const p = config.chromeProfile.trim();
  if (!p || isPlaceholderProfilePath(p)) return null;
  const fileEnv = loadDotEnv(DOTENV_PATH);
  const onFile = String(fileEnv.AIDGENT_CHROME_PROFILE || "").trim();
  const wanted = p.replace(/\\/g, "/");
  if (onFile.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() === wanted.replace(/\/+$/, "").toLowerCase()) return null;
  try {
    const r = upsertDotEnv("AIDGENT_CHROME_PROFILE", wanted);
    if (!quiet) {
      console.log(`Wrote AIDGENT_CHROME_PROFILE=${wanted} into .env, so the next command finds this session too.`);
    }
    return r;
  } catch (err) {
    console.error(`Could not update .env automatically (${err.message}).`);
    console.error(`Set this by hand or the next terminal will not have it:  AIDGENT_CHROME_PROFILE=${wanted}`);
    return null;
  }
}

function resolvePersonaSlug(flags) {
  const env = { ...loadDotEnv(), ...process.env };
  if (flags.persona) return flags.persona;
  if (env.AIDGENT_PERSONA) return env.AIDGENT_PERSONA;
  try { return fs.readFileSync(SELECTED_FILE, "utf8").trim(); } catch { return ""; }
}

/** `npm run start` — status only, imported lazily so this stays fast. */
async function cmdStart(flags = {}) {
  const { main: startMain } = await import("./start.mjs");
  return startMain(flags.json ? ["--json"] : []);
}

/**
 * init-env — create .env from .env.example, in Node so it runs identically on
 * Windows, macOS and Linux. Never overwrites: an existing .env holds real
 * setup work with no undo.
 */
function cmdInitEnv() {
  const dest = path.join(REPO_ROOT, ".env");
  const src = path.join(REPO_ROOT, ".env.example");
  if (fs.existsSync(dest)) {
    console.log(".env already exists — leaving it exactly as it is.");
    console.log("Nothing was changed. Edit the values in it rather than recreating it.");
    return;
  }
  if (!fs.existsSync(src)) fail("No .env.example in this repo, so there is nothing to copy from.");
  fs.copyFileSync(src, dest);
  console.log("Created .env from .env.example.");
  console.log("It holds placeholders, not settings. Fill them in as `npm run start` asks for them.");
}

async function cmdSetupLogin(flags) {
  const config = resolveConfig(flags);
  if (!config.chromeProfile) fail("Set AIDGENT_CHROME_PROFILE (a path OUTSIDE this repo) or pass --profile.");
  if (isPlaceholderProfilePath(config.chromeProfile)) {
    fail(formatSessionRefusal(preflightSession({ chromeProfile: config.chromeProfile })));
  }
  const { setupLogin } = await import("./worker.mjs");
  // Record the chosen path BEFORE the browser opens: this is the folder they
  // just told us to sign into, whatever happens next in the window.
  rememberProfilePath(config, { proven: false });
  console.log(`Opening a headed Chrome on profile: ${config.chromeProfile}`);
  const r = await setupLogin({ profilePath: config.chromeProfile, channel: config.chromeChannel });
  if (!r.ok) {
    console.error(`Not signed in: ${r.reason}`);
    console.error("Nothing was recorded. Run `npm run setup-login` again and leave the window open until your feed renders.");
    process.exit(1);
  }
  rememberProfilePath(config);
  writeSessionProof({ chromeProfile: config.chromeProfile, liAt: config.liAt });
  console.log(`OK: ${r.reason}`);
  console.log("Recorded. `npm run start` will now count this session as verified.");
}

/** Preflight: verify the LinkedIn session works before anything depends on it. */
async function cmdCheckLogin(flags) {
  const config = resolveConfig(flags);
  assertSession(config);
  const { checkLogin } = await import("./worker.mjs");
  const v = await checkLogin({ config });
  if (v.ok) {
    console.log(`OK: ${v.reason}`);
    // The session is known-good: write the path into .env and record the proof.
    rememberProfilePath(config);
    writeSessionProof({ chromeProfile: config.chromeProfile, liAt: config.liAt });
    return;
  }
  console.error(`NOT SIGNED IN (${v.kind}): ${v.reason}`);
  console.error("Fix: run `npm run setup-login` and sign in yourself, or paste a fresh li_at cookie into AIDGENT_LI_AT in .env.");
  process.exit(1);
}

/**
 * open — the agent's window onto LinkedIn.
 *
 * Opens ONE URL (linkedin.com only; message/connect/compose/checkpoint URLs
 * refused) with the signed-in session, read-only, and saves the rendered HTML
 * + a screenshot to run-artifacts. The agent reads the artifact and decides
 * what to open next. Budgeted and paced; nothing is extracted or written.
 *
 *   npm run open -- --url "https://www.linkedin.com/search/results/content/?..."
 */
async function cmdOpen(flags) {
  const config = resolveConfig(flags);
  const url = flags.url;
  if (!url || url === true) {
    fail('Usage: npm run open -- --url "https://www.linkedin.com/..." [--label name]\nSee references/linkedin-search-urls.md for the search URL grammar.');
  }
  assertSession(config);
  fs.mkdirSync(config.outDir, { recursive: true });
  const budget = openBudgetFor(config);
  const { openPage } = await import("./worker.mjs");
  const label = (flags.label && flags.label !== true ? String(flags.label) : "page").replace(/[^a-z0-9-]/gi, "-");
  const r = await openPage({ config, url: String(url), label, budget });
  if (r.ok) {
    console.log(`Saved: ${r.snapshot} (+ .html next to it)`);
    console.log("Read the HTML, decide who is worth opening, and write nominations.json.");
    return;
  }
  if (r.kind === "budget_exhausted") fail(formatBudgetRefusal("opens", r.budget));
  if (r.kind === "refused_url") fail(`Refused: ${r.reason}`);
  console.error(`BLOCKER (${r.kind}): ${r.reason}${r.snapshot ? `\nSaved a copy of the page: ${r.snapshot}` : ""}`);
  console.error("Stopped safely. Fix the blocker (see AGENTS.md), then try again.");
  process.exit(1);
}

/**
 * inspect — verify every nomination by opening it. The gate, then the browser.
 *
 *   npm run inspect -- --nominations nominations.json
 *
 * nominations.json: [{ "name", "url", "why_nominated", "source_url" }]
 * The gate refuses non-/in/ URLs, placeholder slugs, and people already in the
 * sheet. The worker then opens every profile + activity page itself, applies
 * hard disqualifiers only, and writes run-artifacts/evidence.json. Nothing is
 * written to the sheet by this command.
 */
async function cmdInspect(flags) {
  const config = resolveConfig(flags);
  const slug = resolvePersonaSlug(flags);
  if (!slug) fail("No persona. Save one first (see AGENTS.md), or pass --persona <slug>.");
  const file = flags.nominations;
  if (!file || file === true) {
    fail([
      "Usage: npm run inspect -- --nominations nominations.json",
      "",
      "nominations.json is the list of people YOU judged worth opening:",
      '  [{ "name": "Ada Lovelace", "url": "https://www.linkedin.com/in/ada...",',
      '     "why_nominated": "posted about onboarding drag this week", "source_url": "..." }]',
    ].join("\n"));
  }
  assertSession(config);
  const { persona } = await getPersona(slug);
  const sheetId = config.sheetId || personaSheetId(persona);
  if (isPlaceholderSheetId(sheetId)) {
    fail("No real Google Sheet is bound, so nominations cannot be deduped against it." + sheetSetupHelp());
  }
  fs.mkdirSync(config.outDir, { recursive: true });

  await warnUnappliedFeedback(config, sheetId);

  // Dedupe vs the sheet: a nominated person who already has a row is refused
  // at the gate rather than re-inspected on budget.
  const { getSheets, readLeads } = await import("./sheet.mjs");
  const sheets = await getSheets(config.credentialsPath);
  const existingSheet = await readLeads(sheets, sheetId);
  const { buildExistingIndex } = await import("./merge.mjs");
  const existingKeys = new Set(buildExistingIndex(existingSheet).keys());

  const { parseNominations, describeNominations } = await import("./nominations.mjs");
  const parsed = parseNominations(JSON.parse(fs.readFileSync(String(file), "utf8")), { existingKeys });
  console.log(describeNominations(parsed));
  if (!parsed.rows.length) {
    fail("No usable nominations. Every row needs a real linkedin.com/in/ URL you actually saw, for a person not already in the sheet.");
  }

  const budget = openBudgetFor(config);
  const { runInspect } = await import("./worker.mjs");
  const res = await runInspect({ nominations: parsed.rows, persona, config, budget });

  const evidencePath = path.join(config.outDir, "evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(res.evidence, null, 2));
  const disqualified = res.evidence.filter((e) => e.disqualified);
  const captured = res.evidence.filter((e) => e.post).length;
  console.log("");
  console.log(`Inspected ${res.inspected} of ${parsed.rows.length} nominated profile(s) first-hand.`);
  console.log(`  evidence written: ${evidencePath}`);
  console.log(`  with a captured post: ${captured}   hard-disqualified: ${disqualified.length}`);
  for (const d of disqualified.slice(0, 10)) console.log(`    - ${d.name || d.url}: ${d.disqualified.reason}`);
  console.log("");
  console.log("Next: read evidence.json, judge each candidate against the ICP, and write");
  console.log("decisions.json, then: npm run qualify -- --decisions decisions.json");

  if (res.blocker) {
    console.error(`BLOCKER: ${res.blocker.kind} — ${res.blocker.reason}. Stopped safely; the evidence captured so far is real and saved.`);
    process.exit(1);
  }
}

/**
 * qualify — the ONLY live-run sheet writer.
 *
 *   npm run qualify -- --decisions decisions.json               (check only)
 *   npm run qualify -- --decisions decisions.json --update-sheet
 *
 * decisions.json: [{ "key": "<canonical /in/ URL from evidence.json>",
 *   "fit": true, "score": 0-100, "why_them": "...",
 *   "suggested_comment": "...", "suggested_intro": "..." }]
 *
 * Every draft is validated against the captured post (grounding: four
 * consecutive words), hard disqualifiers are re-checked, and only fit=true
 * rows are written — columns A-J + R-X in one pass, drafts included. Failures
 * are reported for redraft, never written.
 */
async function cmdQualify(flags) {
  const config = resolveConfig(flags);
  const slug = resolvePersonaSlug(flags);
  if (!slug) fail("No persona. Save one first (see AGENTS.md), or pass --persona <slug>.");
  const file = flags.decisions;
  if (!file || file === true) {
    fail([
      "Usage: npm run qualify -- --decisions decisions.json [--update-sheet]",
      "",
      "decisions.json is your judgement on every candidate in evidence.json:",
      '  [{ "key": "https://www.linkedin.com/in/ada...", "fit": true, "score": 82,',
      '     "why_them": "...", "suggested_comment": "...", "suggested_intro": "..." }]',
      "",
      "Without --update-sheet this validates and reports only.",
    ].join("\n"));
  }
  const { persona } = await getPersona(slug);
  const sheetId = config.sheetId || personaSheetId(persona);
  if (isPlaceholderSheetId(sheetId)) {
    fail("No real Google Sheet is bound, so there is nowhere to write." + sheetSetupHelp());
  }

  await warnUnappliedFeedback(config, sheetId);

  const evidenceFile = flags.evidence && flags.evidence !== true
    ? String(flags.evidence)
    : path.join(config.outDir, "evidence.json");
  if (!fs.existsSync(evidenceFile)) {
    fail(`No evidence at ${evidenceFile}. Run \`npm run inspect\` first — qualify only writes people the worker actually opened.`);
  }
  const evidence = JSON.parse(fs.readFileSync(evidenceFile, "utf8"));

  const { parseDecisions, planQualify, formatRefused } = await import("./qualify.mjs");
  const parsedD = parseDecisions(JSON.parse(fs.readFileSync(String(file), "utf8")));
  for (const r of parsedD.rejected.slice(0, 10)) {
    const who = r.row && typeof r.row === "object" ? (r.row.key || r.row.url || "(no key)") : String(r.row);
    console.error(`decision dropped — ${who}: ${r.reason}`);
  }
  if (!parsedD.decisions.length) fail(`No usable decisions in ${file}.`);

  const { getSheets, readLeads, applyPlan, appendRunLog } = await import("./sheet.mjs");
  const sheets = await getSheets(config.credentialsPath);
  const existingSheet = await readLeads(sheets, sheetId);

  const nowIso = new Date().toISOString();
  const startedMs = Date.now();
  const { plan, counts, refused, skipped } = planQualify({
    persona, evidence, decisions: parsedD.decisions, existingSheet, nowMs: Date.parse(nowIso), nowIso,
  });

  console.log(`${parsedD.decisions.length} decision(s): ${plan.newRows.length} new row(s) ready, ${plan.updates.length} refresh(es), ${skipped} fit=false skipped, ${refused.length} refused.`);
  if (refused.length) console.error(formatRefused(refused));
  if (plan.outreachRejected.length) {
    const { formatOutreachRejections } = await import("./outreach.mjs");
    console.error("");
    console.error(formatOutreachRejections(plan.outreachRejected));
  }

  // Writing requires the flag to be PRESENT: checking first is the contract.
  const wantsWrite = flags["update-sheet"] === true || flags["update-sheet"] === "true";
  if (!wantsWrite) {
    console.log("\nNothing was written. Re-run with --update-sheet to write the rows above.");
    if (refused.length || plan.outreachRejected.length) process.exitCode = 1;
    return;
  }
  if (!plan.newRows.length && !plan.updates.length) {
    console.log("\nNothing qualified, so nothing was written.");
    process.exitCode = 1;
    return;
  }

  const applied = await applyPlan(sheets, sheetId, plan, {
    headerRow: existingSheet.headerRow || 3,
    firstDataRow: existingSheet.firstDataRow || 4,
    headers: existingSheet.rawHeaders,
  });
  const runId = makeRunId(nowIso, "qualify");
  const report = buildRunReport({
    runId, persona: slug, requestedTarget: parsedD.decisions.length, counts,
    blocker: refused.length ? `${refused.length} decision(s) refused` : "",
    startedMs, endedMs: Date.now(), nowIso,
  });
  await appendRunLog(sheets, sheetId, report);
  console.log(formatRunReport(report));
  console.log(`Applied: appended ${applied.appended}, updated ${applied.updated}`);

  const accepted = plan.newRows.length + plan.updates.length;
  const topScore = accepted
    ? Math.max(0, ...parsedD.decisions.filter((d) => d.fit).map((d) => Number(d.score) || 0))
    : null;
  console.log("");
  console.log(formatHandoff({
    sheetId,
    added: counts.newLeads,
    updated: counts.updatedLeads,
    topScore,
    nextStep: plan.outreachRejected.length
      ? "redraft the rejected message(s) against column D and re-run qualify"
      : "review the rows with the person; nominate more people for the next loop",
  }));
  if (plan.outreachRejected.length || refused.length) process.exitCode = 1;
}

/**
 * feedback — the Feedback tab's code path.
 *   --list                          show every row and its status (default)
 *   --apply <row> --changed "..."   stamp a row Applied with what changed
 *   --needs-decision <row> --reason "..."   stamp a row as waiting on the person
 */
async function cmdFeedback(flags) {
  const config = resolveConfig(flags);
  const slug = resolvePersonaSlug(flags);
  const persona = slug ? (await getPersona(slug)).persona : null;
  const sheetId = config.sheetId || (persona && personaSheetId(persona)) || "";
  if (isPlaceholderSheetId(sheetId)) {
    fail("No real Google Sheet is bound, so there is no Feedback tab to read." + sheetSetupHelp());
  }
  const { readFeedback, writeFeedbackStatus, formatFeedback, unappliedRows, needsDecisionRows,
    STATUS_APPLIED, STATUS_NEEDS_DECISION } = await import("./feedback.mjs");
  const { getSheets } = await import("./sheet.mjs");
  const sheets = await getSheets(config.credentialsPath);

  const applyRow = flags.apply;
  const decideRow = flags["needs-decision"];
  if (applyRow && applyRow !== true) {
    const changed = flags.changed;
    if (!changed || changed === true) fail('Usage: npm run feedback -- --apply <row> --changed "what you changed in the persona"');
    await writeFeedbackStatus(sheets, sheetId, applyRow, {
      status: STATUS_APPLIED,
      appliedOn: new Date().toISOString().slice(0, 10),
      changed: String(changed),
    });
    console.log(`Feedback row ${applyRow} marked Applied: ${changed}`);
    return;
  }
  if (decideRow && decideRow !== true) {
    const reason = flags.reason;
    if (!reason || reason === true) fail('Usage: npm run feedback -- --needs-decision <row> --reason "why this needs the person"');
    await writeFeedbackStatus(sheets, sheetId, decideRow, {
      status: STATUS_NEEDS_DECISION,
      appliedOn: "",
      changed: String(reason),
    });
    console.log(`Feedback row ${decideRow} marked Needs a decision: ${reason}`);
    return;
  }

  const { rows } = await readFeedback(sheets, sheetId);
  console.log(formatFeedback(rows));
  const waitingNew = unappliedRows(rows);
  const waiting = needsDecisionRows(rows);
  if (waitingNew.length) console.log(`\n${waitingNew.length} row(s) are waiting to be applied — do that before the next loop.`);
  if (waiting.length) console.log(`${waiting.length} row(s) are waiting on the person's decision.`);
}

async function cmdBindSheet(flags) {
  const slug = resolvePersonaSlug(flags);
  if (!slug) fail("Usage: npm run bind-sheet -- --persona <slug> --sheet <id-or-url>");
  const arg = flags.sheet || flags.url;
  if (!arg || arg === true) fail("Provide --sheet <google-sheet-id-or-url> (your EXISTING sheet)." + sheetSetupHelp());
  const p = resolvePersonaPath(slug);
  if (!p) fail(`persona not found: ${slug}. Save it first with save-persona.`);
  if (!p.includes(path.join("private", "personas"))) {
    console.warn(`Note: ${slug} is a PUBLIC persona (${p}). Binding a real sheet id here would be committed. Prefer a private persona under private/personas/.`);
  }
  const { default: YAML } = await import("js-yaml");
  const persona = await loadPersonaFile(p);
  const id = extractSheetId(arg);
  if (isSharedTemplateId(id)) {
    fail([
      "That is the shared TEMPLATE, not your own sheet. You only have view access to it,",
      "so every run would fail with a permission error.",
      "",
      "Open the template link, click File > Make a copy, then copy the URL of the NEW",
      "sheet from your browser's address bar and bind that one instead.",
      sheetSetupHelp(),
    ].join("\n"));
  }
  persona.sheet_id = id;
  delete persona.sheet_url;
  fs.writeFileSync(p, YAML.dump(persona, { lineWidth: 100 }));
  console.log(`Bound persona "${slug}" to existing sheet ${id}.`);
  console.log("Verify access with: npm run check-sheet -- --persona " + slug);
}

async function cmdCheckSheet(flags) {
  const config = resolveConfig(flags);
  const slug = resolvePersonaSlug(flags);
  const persona = slug ? (await getPersona(slug)).persona : null;
  const sheetId = config.sheetId || (persona && personaSheetId(persona)) || "";
  if (isPlaceholderSheetId(sheetId)) {
    fail("No real sheet bound. Run bind-sheet or set GOOGLE_SHEET_ID to your existing sheet." + sheetSetupHelp());
  }
  if (isSharedTemplateId(sheetId)) {
    fail("The bound sheet is the shared TEMPLATE, which you can only view. Bind your own copy instead." + sheetSetupHelp());
  }
  const { getSheets } = await import("./sheet.mjs");
  const sheets = await getSheets(config.credentialsPath);
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabs = (meta.data.sheets || []).map((s) => s.properties.title);
  // Getting here means the service account opened the sheet as itself, which
  // is the only evidence the share step was actually done. Record it.
  recordSheetProof({ sheetId });
  console.log(`OK: will USE existing sheet "${meta.data.properties.title}" (${sheetId}).`);
  console.log(`Tabs: ${tabs.join(", ")}`);
  if (!tabs.includes("Leads")) console.log('Note: no "Leads" tab yet. Take a fresh copy of the template, or the worker will need a Leads tab to maintain.');
  console.log("This tool maintains THIS sheet in place and never creates a new spreadsheet.");
}

// --- helpers ---------------------------------------------------------------

/** The daily budget, persisted in private/budget-state.json. */
function openBudgetFor(config) {
  return createBudget({
    file: BUDGET_STATE_PATH,
    openLimit: config.openBudget,
    inspectLimit: config.inspectBudget,
  });
}

/**
 * Unapplied Feedback rows never brick a run — they are said LOUDLY at the
 * start of inspect and qualify instead, so the agent applies them inline (it
 * edits the persona anyway) and stamps them via `feedback --apply`.
 */
async function warnUnappliedFeedback(config, sheetId) {
  try {
    const { readFeedback, unappliedRows, needsDecisionRows, formatWarning } = await import("./feedback.mjs");
    const { getSheets } = await import("./sheet.mjs");
    const sheets = await getSheets(config.credentialsPath);
    const { rows } = await readFeedback(sheets, sheetId);
    const warning = formatWarning(unappliedRows(rows), needsDecisionRows(rows));
    if (warning) console.error(warning);
  } catch (err) {
    console.error(`Could not read the Feedback tab (${err.message}). Continuing — check it by hand.`);
  }
}

/** The sheet, as a link, on its own line. Empty when nothing is bound. */
function sheetLine(sheetId) {
  const url = sheetUrlFor(sheetId);
  return url ? `Sheet: ${url}` : "";
}

/**
 * The last thing a run prints, and the thing the agent must relay: where the
 * rows are, what landed, and the single next step. Printed by code so it
 * cannot go missing when an agent paraphrases.
 */
export function formatHandoff({ sheetId, added = 0, updated = 0, topScore = null, nextStep = "" }) {
  const lines = [];
  const link = sheetLine(sheetId);
  if (link) lines.push(link);
  const top = topScore === null || topScore === undefined || topScore === "" ? "n/a" : topScore;
  lines.push(`Rows: ${added} added, ${updated} updated this run. Top fit score: ${top}.`);
  if (nextStep) lines.push(`Next: ${nextStep}`);
  return lines.join("\n");
}

function fail(msg) { console.error(msg); process.exit(2); }

main().catch(async (e) => {
  // An old-layout sheet already carries the whole explanation and the fix.
  if (e && e.name === "LeadsLayoutError") {
    console.error(e.message);
    process.exit(1);
  }
  try {
    const cfg = resolveConfig(parseFlags(process.argv.slice(3)));
    const { explainSheetsError } = await import("./sheet.mjs");
    const said = explainSheetsError(e, { sheetId: cfg.sheetId, credentialsPath: cfg.credentialsPath });
    if (said) { console.error(said); process.exit(1); }
  } catch { /* fall through to the raw error below */ }
  console.error(e.stack || e.message);
  process.exit(1);
});
