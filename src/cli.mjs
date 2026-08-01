#!/usr/bin/env node
// cli.mjs — command dispatcher for the local prospect-research worker.
//
// Commands:
//   start             where am I? a checklist and exactly one next step
//   setup-login       headed: open Chrome so YOU sign into LinkedIn manually
//   source            add 25 qualified leads + maintain the Sheet (the scheduled command)
//   follow-up         read-only: did they accept / did they reply (fills Y-AB)
//   daily             source, then follow-up — one command for the daily schedule
//   pilot             a 10-lead run to sanity-check before full 25-lead runs
//   dry-run           plan only; writes nothing; use --fixture for an offline demo
//   list-personas     list available personas (private + public)
//   select-persona    set the active persona for later runs
//   validate-persona  load + validate one persona
//   create-persona    scaffold a private persona from an approved ICP JSON
//
// Nothing outward is ever sent. See SECURITY.md.

import fs from "node:fs";
import path from "node:path";
import { parseFlags, resolveConfig, loadDotEnv, upsertDotEnv, DOTENV_PATH, REPO_ROOT } from "./config.mjs";
import { preflightSession, formatSessionRefusal, isPlaceholderProfilePath, shouldRememberProfile, writeSessionProof } from "./session.mjs";
import { recordSheetProof } from "./verified.mjs";
import {
  getPersona, validatePersona, listPersonaSlugs, personaSheetId,
  personaTemplate, PRIVATE_PERSONA_DIR, resolvePersonaPath, loadPersonaFile,
  extractSheetId, isPlaceholderSheetId, isSharedTemplateId, sheetSetupHelp,
  sheetUrlFor, formatPersonaWarnings,
} from "./persona.mjs";
import { runPipeline } from "./pipeline.mjs";
import { toCsv } from "./csv.mjs";
import { LEADS_HEADERS } from "./schema.mjs";
import { rowArray } from "./sheetPlan.mjs";
import { makeRunId, buildRunReport, formatRunReport } from "./runlog.mjs";
import { planFollowUp, formatFollowUpReport } from "./followup.mjs";

const SELECTED_FILE = path.join(REPO_ROOT, "private", "selected-persona.txt");

async function main() {
  const [, , command, ...rest] = process.argv;
  const flags = parseFlags(rest);
  switch (command) {
    case "start": return cmdStart(flags);
    case "setup-login": return cmdSetupLogin(flags);
    case "check-login": return cmdCheckLogin(flags);
    case "snapshot": return cmdSnapshot(flags);
    case "feedback": return cmdFeedback(flags);
    case "source": return cmdSource(flags, {});
    case "follow-up": return cmdFollowUp(flags);
    case "daily": return cmdDaily(flags);
    case "pilot": return cmdSource({ ...flags, target: flags.target || "10" }, { pilot: true });
    case "dry-run": return cmdSource({ ...flags, "dry-run": true }, {});
    case "list-personas": return cmdListPersonas();
    case "select-persona": return cmdSelectPersona(flags);
    case "validate-persona": return cmdValidatePersona(flags);
    case "create-persona": return cmdCreatePersona(flags);
    case "bind-sheet": return cmdBindSheet(flags);
    case "check-sheet": return cmdCheckSheet(flags);
    case "validate-outreach": return cmdValidateOutreach(flags);
    case "init-env": return cmdInitEnv();
    default:
      console.log("Unknown command. See: start | init-env | setup-login | check-login | feedback | source | follow-up | daily | pilot | dry-run | list-personas | select-persona | validate-persona | create-persona | bind-sheet | check-sheet | validate-outreach");
      process.exit(2);
  }
}

/**
 * Refuse, before a browser exists, any run that cannot have a LinkedIn
 * session. Without this the first navigation lands on the login wall and the
 * run report says `login: login page detected` — which reads as LinkedIn
 * blocking us, not as "this machine was never configured".
 *
 * Offline paths (`--fixture`) never call this: the fixture demo has to keep
 * working on a laptop with no session and no network at all.
 */
function assertSession(config) {
  const v = preflightSession({ chromeProfile: config.chromeProfile, liAt: config.liAt });
  if (!v.ok) fail(formatSessionRefusal(v));
  return v;
}

/**
 * Write the profile path a command just PROVED works back into .env.
 *
 * A session verified through --profile or a shell variable is real, but it
 * belongs to that one terminal. Persisting it is what stops `npm run start`
 * from reporting READY on a configuration the next command cannot reproduce.
 * Only the path is ever written; a pasted li_at cookie is a secret and stays
 * wherever the person put it.
 */
function rememberProfilePath(config, { quiet = false, proven = true } = {}) {
  // `proven` means a session was actually demonstrated through this profile,
  // which is the bar for check-login. setup-login passes proven:false: the
  // folder is about to be signed into, so it cannot pass the signed-in test
  // yet, but it is unambiguously the path the person chose.
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
    // Never fatal: a read-only .env is a worse reason to fail than the thing
    // this is trying to prevent. Say it plainly and let the run continue.
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

/**
 * `npm run start` — status only. Imported lazily so this command stays fast and
 * so nothing in the status engine can affect the other commands.
 */
async function cmdStart(flags = {}) {
  const { main: startMain } = await import("./start.mjs");
  return startMain(flags.json ? ["--json"] : []);
}

/**
 * init-env — create .env from .env.example.
 *
 * This exists because the checklist used to name `cp .env.example .env`, and
 * `cp` is a Unix command. PowerShell happens to define it as an alias, so it
 * works there by luck; the older cmd.exe does not, and an agent driving that
 * shell stalls on step three of a first install with an error about an
 * unrecognised command. That is the worst possible place to stall, because the
 * person watching has no way to tell a missing shell command from something
 * they did wrong.
 *
 * Node runs identically on every machine this repo targets, so the copy happens
 * in Node. One command, same spelling on Windows, macOS and Linux.
 *
 * Never overwrites: an existing .env holds the paths and possibly the li_at
 * cookie somebody already filled in, and clobbering that would undo real setup
 * work with no undo.
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
  // Signing into the placeholder would "succeed" — Chrome creates the folder —
  // and leave a signed-in profile at a path nobody meant, while every later
  // run keeps reading the same placeholder and finding nothing.
  if (isPlaceholderProfilePath(config.chromeProfile)) {
    fail(formatSessionRefusal(preflightSession({ chromeProfile: config.chromeProfile })));
  }
  const { setupLogin } = await import("./worker.mjs");
  // Write the chosen path into .env BEFORE opening the browser, not after.
  // setupLogin waits forever by design — the person ends it with Ctrl+C or by
  // closing the window — so nothing after the await ever runs. Recording it
  // here is also the more honest moment: this is the folder they just told us
  // to sign into, whatever happens next in the window.
  if (typeof config.chromeProfile === "string" && !isPlaceholderProfilePath(config.chromeProfile)) {
    rememberProfilePath(config, { proven: false });
  }
  console.log(`Opening a headed Chrome on profile: ${config.chromeProfile}`);
  const r = await setupLogin({ profilePath: config.chromeProfile, channel: config.chromeChannel });
  if (!r.ok) {
    console.error(`Not signed in: ${r.reason}`);
    console.error("Nothing was recorded. Run `npm run setup-login` again and leave the window open until your feed renders.");
    process.exit(1);
  }
  // Only now is there anything worth believing. Record the proof so the
  // checklist can stop inferring a session from files on disk.
  rememberProfilePath(config);
  writeSessionProof({ chromeProfile: config.chromeProfile, liAt: config.liAt });
  console.log(`OK: ${r.reason}`);
  console.log("Recorded. `npm run start` will now count this session as verified.");
}

/** Preflight: verify the LinkedIn session works before anything depends on it. */
async function cmdCheckLogin(flags) {
  const config = resolveConfig(flags);
  // Answer from local facts first. Opening a browser to discover that the
  // profile path is a placeholder wastes the person's time and returns a
  // verdict about LinkedIn for a problem that is entirely in .env.
  assertSession(config);
  const { checkLogin } = await import("./worker.mjs");
  const v = await checkLogin({ config });
  if (v.ok) {
    console.log(`OK: ${v.reason}`);
    // This is the moment the session is known-good. Pin down both the path and
    // the fact that it was actually proved, not merely configured.
    rememberProfilePath(config);
    writeSessionProof({ chromeProfile: config.chromeProfile, liAt: config.liAt });
    return;
  }
  console.error(`NOT SIGNED IN (${v.kind}): ${v.reason}`);
  console.error("Fix: run `npm run setup-login` and sign in yourself, or paste a fresh li_at cookie into AIDGENT_LI_AT in .env.");
  process.exit(1);
}

/**
 * snapshot — save a read-only copy (HTML + screenshot) of ONE LinkedIn page to
 * run-artifacts, using the signed-in session. For turning live-DOM extraction
 * misses into fixtures. Usage: npm run snapshot -- --url <url> [--label name]
 */
async function cmdSnapshot(flags) {
  const config = resolveConfig(flags);
  const url = flags.url;
  if (!url || url === true || !/^https:\/\/(www\.)?linkedin\.com\//.test(String(url))) {
    fail("Usage: npm run snapshot -- --url https://www.linkedin.com/... [--label profile]");
  }
  // A snapshot taken without a session saves a picture of the login wall and
  // files it as a fixture, which then teaches the extractor the wrong shape.
  assertSession(config);
  const { savePageCopy } = await import("./worker.mjs");
  const label = (flags.label && flags.label !== true ? String(flags.label) : "page").replace(/[^a-z0-9-]/gi, "-");
  const r = await savePageCopy({ config, url: String(url), label });
  if (r.ok) {
    console.log(`Saved: ${r.snapshot} (+ .html next to it)`);
  } else {
    console.error(`Could not copy the page (${r.kind}): ${r.reason}`);
    process.exit(1);
  }
}

/**
 * feedback — the Feedback tab's code path.
 *   --list                          show every row and its status (default)
 *   --apply <row> --changed "..."   stamp a row Applied with what changed
 *   --needs-decision <row> --reason "..."   stamp a row as waiting on the person
 * Translating a note into persona fields stays an agent job (AGENTS.md 4b);
 * this command is how that work is recorded so a run can trust the tab.
 */
async function cmdFeedback(flags) {
  const config = resolveConfig(flags);
  const slug = resolvePersonaSlug(flags);
  const persona = slug ? (await getPersona(slug)).persona : null;
  const sheetId = config.sheetId || (persona && personaSheetId(persona)) || "";
  if (isPlaceholderSheetId(sheetId)) {
    fail("No real Google Sheet is bound, so there is no Feedback tab to read." + sheetSetupHelp());
  }
  const { readFeedback, writeFeedbackStatus, formatFeedback, blockingRows, needsDecisionRows,
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
  const blocking = blockingRows(rows);
  const waiting = needsDecisionRows(rows);
  if (blocking.length) console.log(`\n${blocking.length} row(s) still block the next sourcing run.`);
  if (waiting.length) console.log(`${waiting.length} row(s) are waiting on the person's decision.`);
}

async function cmdListPersonas() {
  const slugs = listPersonaSlugs();
  if (!slugs.length) { console.log("No personas found. Create one with: npm run create-persona -- --from icp.json"); return; }
  for (const s of slugs) console.log(`${s.slug}\t[${s.scope}]\t${s.path}`);
}

function cmdSelectPersona(flags) {
  const slug = flags.persona || flags._ || flags.slug;
  if (!slug || slug === true) fail("Usage: npm run select-persona -- --persona <slug>");
  fs.mkdirSync(path.dirname(SELECTED_FILE), { recursive: true });
  fs.writeFileSync(SELECTED_FILE, String(slug).trim() + "\n");
  console.log(`Active persona set to "${slug}" (stored locally, git-ignored).`);
  console.log("Runs will use it unless --persona or AIDGENT_PERSONA overrides.");
}

async function cmdValidatePersona(flags) {
  const slug = resolvePersonaSlug(flags);
  if (!slug) fail("No persona given. Use --persona <slug> or select-persona first.");
  try {
    const { persona, path: p } = await getPersona(slug);
    console.log(`OK: ${slug} is valid (${p}). Sheet: ${personaSheetId(persona) || "(none)"}`);
    console.log(`Buyer titles: ${(persona.buyer_titles || []).join(", ") || "(none)"}`);
    console.log(`Exclusions:   ${(persona.exclusions || []).join(", ") || "(none)"}`);
    console.log(`Warm-first:   ${persona.include_connections === true ? "yes — your existing connections are searched too" : "no — net-new people only"}`);
    // Valid is not the same as well-aimed. A persona full of one-word titles
    // passes every schema check and matches half of LinkedIn. Last, so it is
    // the thing still on screen.
    const warn = formatPersonaWarnings(validatePersona(persona).warnings);
    if (warn) console.error(warn);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

async function cmdCreatePersona(flags) {
  const from = flags.from;
  if (!from) fail("Usage: npm run create-persona -- --from approved-icp.json [--slug my-persona]");
  const icp = JSON.parse(fs.readFileSync(from, "utf8"));
  const persona = personaTemplate(icp);
  const { valid, errors, warnings } = validatePersona(persona);
  const slug = (flags.slug || slugify(persona.persona || "persona"));
  const { default: YAML } = await import("js-yaml");
  fs.mkdirSync(PRIVATE_PERSONA_DIR, { recursive: true });
  const dest = path.join(PRIVATE_PERSONA_DIR, slug + ".yaml");
  fs.writeFileSync(dest, YAML.dump(persona, { lineWidth: 100 }));
  console.log(`Wrote private persona: ${dest}`);
  if (!valid) console.log(`Note: fill these before running:\n- ${errors.join("\n- ")}`);
  // Say the targeting back at the moment it is written down, not after a run
  // has spent seven minutes finding the wrong people.
  console.log("");
  console.log("Read these back to the person and get an explicit yes on the TITLES:");
  console.log(`  Buyer titles: ${(persona.buyer_titles || []).join(", ") || "(none)"}`);
  console.log(`  Exclusions:   ${(persona.exclusions || []).join(", ") || "(none)"}`);
  console.log(`  Warm-first:   ${persona.include_connections === true ? "yes — existing connections are searched too" : "no — net-new people only"}`);
  const warn = formatPersonaWarnings(warnings);
  if (warn) console.error(warn);
}

async function cmdBindSheet(flags) {
  const slug = resolvePersonaSlug(flags);
  if (!slug) fail("Usage: npm run bind-sheet -- --persona <slug> --sheet <id-or-url>");
  const arg = flags.sheet || flags.url;
  if (!arg || arg === true) fail("Provide --sheet <google-sheet-id-or-url> (your EXISTING sheet)." + sheetSetupHelp());
  const p = resolvePersonaPath(slug);
  if (!p) fail(`persona not found: ${slug}. Create it first with create-persona.`);
  if (!p.includes(path.join("private", "personas"))) {
    console.warn(`Note: ${slug} is a PUBLIC persona (${p}). Binding a real sheet id here would be committed. Prefer a private persona under private/personas/.`);
  }
  const { default: YAML } = await import("js-yaml");
  const persona = await loadPersonaFile(p);
  const id = extractSheetId(arg);
  // Pasting the template link instead of your own copy is the easiest mistake
  // here, and it does not surface until the first Sheets call fails with a
  // permission error that looks like the service-account step went wrong.
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
  persona.last_updated = new Date().toISOString().slice(0, 10);
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
  // is the only evidence that the share step was actually done. Record it: the
  // checklist cannot observe a Google sharing setting from this machine.
  recordSheetProof({ sheetId });
  console.log(`OK: will USE existing sheet "${meta.data.properties.title}" (${sheetId}).`);
  console.log(`Tabs: ${tabs.join(", ")}`);
  if (!tabs.includes("Leads")) console.log('Note: no "Leads" tab yet. Run buildAidgentOsSheet inside THIS sheet (Extensions > Apps Script), or the worker will need a Leads tab to maintain.');
  console.log("This tool maintains THIS sheet in place and never creates a new spreadsheet.");
}

/**
 * validate-outreach — the code gate on the one thing a model may now write.
 *
 * v5's boundary is: a model may write WORDS, never pick PEOPLE. Sourcing and
 * scoring stay deterministic, and columns I and J become agent-drafted. This is
 * what makes that safe. The agent reads the evidence already in each row — the
 * post verbatim in D, its link in E, the scorer's reasons in H — drafts a
 * comment and an intro DM, and hands them back in a JSON file. Every draft is
 * then checked in code against that row's own evidence before a cell is written.
 *
 * The check that matters is grounding: the draft must quote four consecutive
 * words that really appear in column D. Fluency cannot fake that. A draft that
 * fails is left BLANK and the reason is printed here — never written into the
 * person's Notes column, which the system does not write, and never silently
 * reworded into something nobody composed.
 *
 *   npm run validate-outreach -- --persona <slug> --drafts drafts.json
 *   npm run validate-outreach -- --persona <slug> --drafts drafts.json --update-sheet
 *
 * drafts.json: [{ "url": "https://www.linkedin.com/in/…", "comment": "…", "dm": "…" }]
 */
async function cmdValidateOutreach(flags) {
  const config = resolveConfig(flags);
  const slug = resolvePersonaSlug(flags);
  const file = flags.drafts;
  if (!file || file === true) {
    fail([
      'Usage: npm run validate-outreach -- --persona <slug> --drafts drafts.json [--update-sheet]',
      "",
      "drafts.json is a list of the messages YOU drafted for rows already in the sheet:",
      '  [{ "url": "https://www.linkedin.com/in/someone", "comment": "…", "dm": "…" }]',
      "",
      "Each one is checked against that row's own column D before anything is written.",
    ].join("\n"));
  }
  const persona = slug ? (await getPersona(slug)).persona : null;
  const sheetId = config.sheetId || (persona && personaSheetId(persona)) || "";
  if (isPlaceholderSheetId(sheetId)) {
    fail("No real Google Sheet is bound, so there are no rows to write these onto." + sheetSetupHelp());
  }

  const raw = JSON.parse(fs.readFileSync(String(file), "utf8"));
  const drafts = Array.isArray(raw) ? raw : (raw.drafts || []);
  if (!drafts.length) fail(`No drafts in ${file}.`);

  const { planOutreachWrites } = await import("./outreach.mjs");
  const { canonicalKey } = await import("./url.mjs");
  const { getSheets, readLeads, applyPlan } = await import("./sheet.mjs");
  const sheets = await getSheets(config.credentialsPath);
  const existingSheet = await readLeads(sheets, sheetId);

  const { updates, failures, unmatched } = planOutreachWrites({
    rows: existingSheet.rows, drafts, keyOf: canonicalKey,
  });
  const passed = updates.length;
  console.log(`${drafts.length} draft(s) checked: ${passed} row(s) ready to write, ${failures.length} row(s) with a rejected message.`);
  if (unmatched.length) {
    console.error(`\n${unmatched.length} draft(s) matched no row in the sheet and were ignored:`);
    for (const u of unmatched.slice(0, 10)) console.error(`  ${u}`);
    console.error("A draft can only be written onto a row this system already researched.");
  }
  if (failures.length) {
    console.error("");
    for (const f of failures) {
      for (const r of f.rejected) {
        console.error(`  row ${f.rowNumber} ${f.name} — ${r.field} left blank: ${r.reasons.join("; ")}`);
      }
    }
    console.error("");
    console.error("Redraft these against the post in column D of that row. Quote it — four");
    console.error("consecutive words is the bar, and it is the whole anti-fabrication check.");
  }

  // Writing requires the flag to be PRESENT, not merely un-negated.
  // `resolveConfig` defaults updateSheet to true for the sourcing commands,
  // where a run that researched a hundred people and wrote nothing is a waste.
  // Here the default has to be the opposite way round: checking drafts is the
  // thing you do first, and the usage text promises a look before a write.
  const wantsWrite = flags["update-sheet"] === true || flags["update-sheet"] === "true";
  if (!wantsWrite || config.dryRun) {
    console.log("\nNothing was written. Re-run with --update-sheet to apply the ones that passed.");
    if (failures.length) process.exitCode = 1;
    return;
  }
  if (!updates.length) {
    console.log("\nNothing passed, so nothing was written.");
    process.exitCode = 1;
    return;
  }
  const applied = await applyPlan(sheets, sheetId, { newRows: [], updates }, {
    headerRow: existingSheet.headerRow || 3,
    firstDataRow: existingSheet.firstDataRow || 4,
    headers: existingSheet.rawHeaders,
  });
  console.log(`Sheet: updated ${applied.updated} cell range(s) across ${updates.length} row(s).`);
  console.log(sheetLine(sheetId));
  if (failures.length) process.exitCode = 1;
}

async function cmdSource(flags, { pilot, exitOnBlocker = true } = {}) {
  const config = resolveConfig(flags);
  const slug = resolvePersonaSlug(flags);
  if (!slug) fail("No persona. Use --persona <slug>, AIDGENT_PERSONA, or select-persona.");

  // Before the Sheet, before the feedback gate, before anything opens: can
  // this run have a LinkedIn session at all? --fixture is exempt because the
  // offline demo must run on a machine with no session and no network.
  if (!flags.fixture) assertSession(config);

  // A fixture may pin the clock so the offline demo stays deterministic as real
  // time passes. Live runs always use the real clock.
  const nowIso = fixtureNowIso(flags) || new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  // Duration is measured on the real wall clock even when a fixture pins nowIso.
  const startedMs = Date.now();
  const runId = makeRunId(nowIso, pilot ? "pilot" : "");
  fs.mkdirSync(config.outDir, { recursive: true });

  // 1) Persona
  const { persona } = await getPersona(slug);
  const sheetId = config.sheetId || personaSheetId(persona);
  // Never create a new spreadsheet. A live run must be bound to an existing one.
  if (!flags.fixture && isPlaceholderSheetId(sheetId)) {
    fail(
      "No real Google Sheet is bound, so nothing would be maintained.\n" +
      "This tool NEVER creates a new spreadsheet. Bind your existing sheet:\n" +
      `  npm run bind-sheet -- --persona ${slug} --sheet <your-sheet-id-or-url>\n` +
      "or set GOOGLE_SHEET_ID / persona.sheet_id, then: npm run check-sheet -- --persona " + slug +
      sheetSetupHelp()
    );
  }

  // 1b) The Feedback tab gates every live run. The person's corrections are
  // instructions; sourcing while they sit unapplied teaches them the tab is
  // decorative. This is code, not doctrine, so it cannot be skipped by accident.
  if (!flags.fixture && !config.dryRun) {
    const { readFeedback, blockingRows, needsDecisionRows, formatRefusal, formatFeedback } = await import("./feedback.mjs");
    const { getSheets } = await import("./sheet.mjs");
    const sheets = await getSheets(config.credentialsPath);
    const { rows } = await readFeedback(sheets, sheetId);
    const blocking = blockingRows(rows);
    if (blocking.length) fail(formatRefusal(blocking));
    const waiting = needsDecisionRows(rows);
    if (waiting.length) {
      console.log("Feedback rows still waiting on the person's decision (not blocking):");
      console.log(formatFeedback(waiting));
    }
  }

  // 2) Candidates + existing sheet: fixture (offline) or live worker + Sheets.
  //
  // The sheet is read FIRST on the live paths, because `--target` now counts
  // rows ADDED, and "added" is only knowable against the rows already there.
  let candidates, existingSheet, blocker = null, inspected = 0, added = null, shortfall = null;
  if (flags.fixture) {
    const fx = JSON.parse(fs.readFileSync(flags.fixture, "utf8"));
    candidates = fx.candidates || [];
    existingSheet = fx.existingSheet || { headers: LEADS_HEADERS, rows: [] };
    inspected = candidates.length;
    console.log(`[fixture] ${flags.fixture}: ${candidates.length} candidates, ${existingSheet.rows.length} existing rows`);
  } else {
    if (!sheetId) fail("No Google Sheet id (persona.sheet_id/url or GOOGLE_SHEET_ID).");
    const { getSheets, readLeads } = await import("./sheet.mjs");
    const sheets = await getSheets(config.credentialsPath);
    existingSheet = await readLeads(sheets, sheetId);

    // The worker's stop condition. This is the SAME pure scorer the pipeline
    // runs, on the same clock, over facts the worker's own browser observed —
    // so moving it inside the collection loop changes when we stop walking and
    // nothing at all about who qualifies.
    const { buildExistingIndex } = await import("./merge.mjs");
    const { scoreCandidate } = await import("./scoring.mjs");
    const existingKeys = new Set(buildExistingIndex(existingSheet).keys());
    const accept = (c) => scoreCandidate(persona, c, { nowMs }).accepted;

    if (flags.observed) {
      // AGENT-READ path. The agent read the search page in its own browser and
      // wrote the rows to a file; we verify every URL by opening it ourselves.
      const { parseObserved, describeObserved } = await import("./observed.mjs");
      const parsed = parseObserved(JSON.parse(fs.readFileSync(flags.observed, "utf8")));
      console.log(describeObserved(parsed));
      if (!parsed.rows.length) {
        fail("No usable rows in " + flags.observed + ". Every row needs a real linkedin.com/in/ URL that you actually saw on the page.");
      }
      const { runAgentRead } = await import("./worker.mjs");
      const res = await runAgentRead({ observed: parsed.rows, config, accept, existingKeys });
      candidates = res.candidates;
      blocker = res.blocker;
      inspected = res.inspected;
      added = res.added;
      shortfall = res.shortfall;
      if (res.unreachable?.length) {
        console.error(`${res.unreachable.length} profile(s) could not be opened and were dropped rather than guessed at.`);
      }
    } else {
      // LIVE path (local-linkedin) — never runs during automated tests.
      const { runResearch } = await import("./worker.mjs");
      const res = await runResearch({ persona, config, accept, existingKeys });
      candidates = res.candidates;
      blocker = res.blocker;
      inspected = res.inspected;
      added = res.added;
      shortfall = res.shortfall;
      // When nothing was found, say what each search page actually looked like.
      if (!candidates.length && Array.isArray(res.sourceReports) && res.sourceReports.length) {
        console.error("\nWhat each search page looked like:");
        for (const r of res.sourceReports.slice(0, 8)) {
          console.error(`  ${r.kind}${r.profileLinks ? ` (${r.profileLinks} profile links)` : ""} — ${r.url}`);
        }
        console.error("");
      }
    }
  }

  // 2b) An unreadable activity page must be said out loud: those candidates are
  // being scored WITHOUT their recent posts, which silently costs them recency
  // points and blanks column D — the exact defect that once emptied a pilot.
  // Each one now carries a NAMED verdict rather than a bare "unreadable", so
  // "they do not post" and "we could not read the page" stop looking alike.
  const unreadableRows = (candidates || []).filter((c) => c.activityStatus === "unreadable");
  const unreadable = unreadableRows.length;
  if (unreadable > 0) {
    const kinds = {};
    for (const c of unreadableRows) {
      const k = (c.activityVerdict && c.activityVerdict.kind) || "unreadable";
      kinds[k] = (kinds[k] || 0) + 1;
    }
    console.error(`WARNING: recent-activity pages could not be read for ${unreadable} of ${candidates.length} candidate(s) ` +
      `(${Object.entries(kinds).map(([k, n]) => `${n}× ${k}`).join(", ")}). ` +
      "Their column D is blank and their recency points were lost — that is a fact about this " +
      "parser, not about whether those people post. Save one activity page into test/fixtures/ " +
      "and fix extractUpdatesFromDom.");
    const first = unreadableRows.find((c) => c.activityVerdict);
    if (first) console.error(`  ${first.activityVerdict.reason}`);
  }

  // 3) Score + plan (pure).
  //
  // composeOpeners is false on every LIVE path: the run writes the evidence and
  // leaves columns I and J blank for the agent to draft against it, then
  // `npm run validate-outreach` checks those drafts in code before they become
  // cells. Offline paths keep the templates so a dry-run still shows a full row.
  const sourceType = "LinkedIn";
  const composeOpeners = !!(flags.fixture || config.dryRun);
  const { scored, plan, counts } = runPipeline({ persona, existingSheet, candidates, nowMs, nowIso, sourceType, composeOpeners });

  // 4) Always write a CSV artifact of accepted new/updated leads.
  const csvRows = [
    ...plan.newRows.map((r) => rowArray(r.cells)),
    ...plan.updates.map((u) => existingRowWithSet(existingSheet, u)),
  ];
  const csvPath = path.join(config.outDir, `${runId}.csv`);
  fs.writeFileSync(csvPath, toCsv(LEADS_HEADERS, csvRows));

  // A run that stopped short of its target says so in the Blocker / Failure
  // column. Not because a short day is a failure — it is the correct outcome
  // when the cap bites — but because "14" sitting next to a target of 25 with
  // an empty reason column is how a number quietly becomes a mystery.
  const blockerText = blocker
    ? `${blocker.kind}: ${blocker.reason}`
    : (shortfall ? `${shortfall.kind}: ${shortfall.text}` : "");

  // 5) Apply to the Sheet unless dry-run / csv-only.
  let applied = null;
  if (!config.dryRun && !config.csvOnly && config.updateSheet && !flags.fixture) {
    const { getSheets, applyPlan, appendRunLog } = await import("./sheet.mjs");
    const sheets = await getSheets(config.credentialsPath);
    applied = await applyPlan(sheets, sheetId, plan, {
      headerRow: existingSheet.headerRow || 3,
      firstDataRow: existingSheet.firstDataRow || 4,
      headers: existingSheet.rawHeaders,
    });
    const report0 = buildRunReport({ runId, persona: slug, requestedTarget: config.target, counts, blocker: blockerText, startedMs, endedMs: Date.now(), nowIso });
    await appendRunLog(sheets, sheetId, report0);
  }

  // 6) Report.
  const report = buildRunReport({
    runId, persona: slug, requestedTarget: config.target, counts,
    blocker: blockerText,
    startedMs, endedMs: Date.now(), nowIso,
  });
  fs.writeFileSync(path.join(config.outDir, `${runId}.report.json`), JSON.stringify({ report, activityUnreadable: unreadable, added, shortfall, plan, rejected: plan.rejected.map(r => ({ name: r.candidate.name, reason: r.reason })) }, null, 2));
  console.log(formatRunReport(report));
  if (shortfall) console.log(`  ${shortfall.text}`);
  console.log(`CSV: ${csvPath}`);
  if (config.dryRun || flags.fixture) console.log("(dry-run / fixture: no Sheet was modified)");
  else if (applied) console.log(`Applied: appended ${applied.appended}, updated ${applied.updated}`);

  // Drafts this run blanked, said out loud. Never written into Notes (column Q).
  if (plan.outreachRejected && plan.outreachRejected.length) {
    const { formatOutreachRejections } = await import("./outreach.mjs");
    console.error("");
    console.error(formatOutreachRejections(plan.outreachRejected));
  }

  // The handoff. Where the rows are, what landed, and the one next step —
  // printed by the code so it cannot go missing when an agent paraphrases.
  const topScore = plan.newRows.length || plan.updates.length
    ? Math.max(0, ...scored.filter((s) => s.accepted).map((s) => Number(s.score) || 0))
    : null;
  const nextStep = blocker
    ? "fix the blocker above, then run the pilot again"
    : composeOpeners
      ? "this was offline — bind a sheet and run a real pilot to get live rows"
      : counts.newLeads
        ? `draft columns I and J for the ${counts.newLeads} new row(s) from the post in column D, then npm run validate-outreach -- --persona ${slug} --drafts drafts.json --update-sheet`
        : "review the rows with the person and adjust the persona before the next run";
  console.log("");
  console.log(formatHandoff({
    sheetId: flags.fixture ? "" : sheetId,
    added: counts.newLeads,
    updated: counts.updatedLeads,
    topScore,
    nextStep,
  }));

  if (blocker) {
    console.error(`BLOCKER: ${blocker.kind} — ${blocker.reason}. Stopped safely.`);
    if (exitOnBlocker) process.exit(1);
  }
  return { blocker };
}

/**
 * follow-up — the "did it land?" pass.
 *
 * For every row where YOU ticked "Reached Out" (column K), this looks at your
 * own LinkedIn pages read-only and fills in four columns: whether they accepted
 * the connection, whether they replied, the verbatim text of their latest
 * message, and the date checked. It never sends, accepts, withdraws or replies
 * to anything, and it never writes your columns K:Q.
 */
async function cmdFollowUp(flags) {
  const config = resolveConfig(flags);
  // Follow-up reads LinkedIn too. Without this it would record a confident
  // "no reply" for everyone, sourced entirely from a login page.
  if (!flags.fixture) assertSession(config);
  const slug = resolvePersonaSlug(flags);
  const nowIso = fixtureNowIso(flags) || new Date().toISOString();
  fs.mkdirSync(config.outDir, { recursive: true });

  const persona = slug ? (await getPersona(slug)).persona : null;
  const sheetId = config.sheetId || (persona && personaSheetId(persona)) || "";

  // Observations + current sheet: fixture (offline) or the live read-only pass.
  let existingSheet, observations, blocker = null;
  if (flags.fixture) {
    const fx = JSON.parse(fs.readFileSync(flags.fixture, "utf8"));
    existingSheet = fx.existingSheet || { headers: LEADS_HEADERS, rows: [] };
    observations = fx.observations || {};
    console.log(`[fixture] ${flags.fixture}: ${existingSheet.rows.length} existing rows`);
  } else {
    if (isPlaceholderSheetId(sheetId)) {
      fail(
        "No real Google Sheet is bound, so there is nothing to follow up on.\n" +
        `  npm run bind-sheet -- --persona ${slug || "<slug>"} --sheet <your-sheet-id-or-url>` +
        sheetSetupHelp(),
      );
    }
    const { getSheets, readLeads } = await import("./sheet.mjs");
    const sheets = await getSheets(config.credentialsPath);
    existingSheet = await readLeads(sheets, sheetId);
    const { runFollowUp } = await import("./worker.mjs");
    observations = await runFollowUp({ config });
    blocker = observations.blocker || null;
  }

  const { updates, counts, skipped } = planFollowUp(existingSheet, observations, { nowIso });

  // Apply — updates only, no new rows, Y:AB only (followup.mjs asserts that).
  let applied = null;
  if (!config.dryRun && !config.csvOnly && config.updateSheet && !flags.fixture && updates.length) {
    const { getSheets, applyPlan } = await import("./sheet.mjs");
    const sheets = await getSheets(config.credentialsPath);
    applied = await applyPlan(sheets, sheetId, { newRows: [], updates }, {
      headerRow: existingSheet.headerRow || 3,
      firstDataRow: existingSheet.firstDataRow || 4,
      headers: existingSheet.rawHeaders,
    });
  }

  console.log(formatFollowUpReport(counts, skipped));
  if (config.dryRun || flags.fixture) console.log("(dry-run / fixture: no Sheet was modified)");
  else if (applied) console.log(`Sheet: updated ${applied.updated} cell range(s).`);
  else console.log("Nothing to write.");

  if (blocker) {
    console.error(`BLOCKER: ${blocker.kind} — ${blocker.reason}. Stopped safely.`);
    process.exit(1);
  }
}

/**
 * daily — what the scheduled task runs: find today's people, then check what
 * happened to the ones you already reached out to. A blocker in sourcing still
 * lets the follow-up pass report, and the exit code reflects the failure.
 */
async function cmdDaily(flags) {
  let failed = false;
  try {
    const { blocker } = await cmdSource(flags, { exitOnBlocker: false });
    if (blocker) failed = true;
  } catch (e) {
    failed = true;
    console.error(`source failed: ${e.message}`);
  }
  console.log("");
  await cmdFollowUp(flags);
  if (failed) process.exit(1);
}

// --- helpers ---------------------------------------------------------------

/** The sheet, as a link, on its own line. Empty when nothing is bound. */
function sheetLine(sheetId) {
  const url = sheetUrlFor(sheetId);
  return url ? `Sheet: ${url}` : "";
}

/**
 * The last thing a run prints, and the thing the agent must relay.
 *
 * Three facts, always in this order: where the rows are, what landed, and the
 * single next step. Printing it here rather than trusting a doc means it cannot
 * go missing when an agent paraphrases — the pilot that prompted v5 ended its
 * final message without the sheet link, so the person had ten researched leads
 * and nowhere to go and look at them.
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

/** A fixture's pinned clock, if it has one. Fixtures only — never a live run. */
function fixtureNowIso(flags) {
  if (!flags.fixture || flags.fixture === true) return "";
  try {
    const fx = JSON.parse(fs.readFileSync(flags.fixture, "utf8"));
    return typeof fx.nowIso === "string" && !isNaN(Date.parse(fx.nowIso)) ? fx.nowIso : "";
  } catch {
    return "";
  }
}

function existingRowWithSet(existingSheet, update) {
  const row = (existingSheet.rows || []).find((r) => r.rowNumber === update.rowNumber);
  const cells = { ...(row ? row.cells : {}) };
  for (const [k, v] of Object.entries(update.set)) cells[k] = v;
  return rowArray(cells);
}
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function fail(msg) { console.error(msg); process.exit(2); }

main().catch(async (e) => {
  // An old-layout sheet already carries the whole explanation and the fix, and
  // a stack trace under it would only bury them.
  if (e && e.name === "LeadsLayoutError") {
    console.error(e.message);
    process.exit(1);
  }
  // A raw GaxiosError stack here is the single least useful thing we could show
  // a non-developer, and the two common causes have exact, sayable fixes.
  try {
    const cfg = resolveConfig(parseFlags(process.argv.slice(3)));
    const { explainSheetsError } = await import("./sheet.mjs");
    const said = explainSheetsError(e, { sheetId: cfg.sheetId, credentialsPath: cfg.credentialsPath });
    if (said) { console.error(said); process.exit(1); }
  } catch { /* fall through to the raw error below */ }
  console.error(e.stack || e.message);
  process.exit(1);
});
