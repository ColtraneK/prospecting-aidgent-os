#!/usr/bin/env node
// cli.mjs — command dispatcher for the local prospect-research worker.
//
// Commands:
//   setup-login       headed: open Chrome so YOU sign into LinkedIn manually
//   source            run research + maintain the Sheet (the scheduled command)
//   pilot             a 10-person run to sanity-check before 25/50 runs
//   dry-run           plan only; writes nothing; use --fixture for an offline demo
//   list-personas     list available personas (private + public)
//   select-persona    set the active persona for later runs
//   validate-persona  load + validate one persona
//   create-persona    scaffold a private persona from an approved ICP JSON
//
// Nothing outward is ever sent. See SECURITY.md.

import fs from "node:fs";
import path from "node:path";
import { parseFlags, resolveConfig, loadDotEnv, REPO_ROOT } from "./config.mjs";
import {
  getPersona, validatePersona, listPersonaSlugs, personaSheetId,
  personaTemplate, PRIVATE_PERSONA_DIR, resolvePersonaPath, loadPersonaFile,
  extractSheetId, isPlaceholderSheetId,
} from "./persona.mjs";
import { runPipeline } from "./pipeline.mjs";
import { toCsv } from "./csv.mjs";
import { LEADS_HEADERS } from "./schema.mjs";
import { rowArray } from "./sheetPlan.mjs";
import { makeRunId, buildRunReport, formatRunReport } from "./runlog.mjs";

const SELECTED_FILE = path.join(REPO_ROOT, "private", "selected-persona.txt");

async function main() {
  const [, , command, ...rest] = process.argv;
  const flags = parseFlags(rest);
  switch (command) {
    case "setup-login": return cmdSetupLogin(flags);
    case "source": return cmdSource(flags, {});
    case "pilot": return cmdSource({ ...flags, target: flags.target || "10" }, { pilot: true });
    case "dry-run": return cmdSource({ ...flags, "dry-run": true }, {});
    case "list-personas": return cmdListPersonas();
    case "select-persona": return cmdSelectPersona(flags);
    case "validate-persona": return cmdValidatePersona(flags);
    case "create-persona": return cmdCreatePersona(flags);
    case "bind-sheet": return cmdBindSheet(flags);
    case "check-sheet": return cmdCheckSheet(flags);
    default:
      console.log("Unknown command. See: setup-login | source | pilot | dry-run | list-personas | select-persona | validate-persona | create-persona | bind-sheet | check-sheet");
      process.exit(2);
  }
}

function resolvePersonaSlug(flags) {
  const env = { ...loadDotEnv(), ...process.env };
  if (flags.persona) return flags.persona;
  if (env.AIDGENT_PERSONA) return env.AIDGENT_PERSONA;
  try { return fs.readFileSync(SELECTED_FILE, "utf8").trim(); } catch { return ""; }
}

async function cmdSetupLogin(flags) {
  const config = resolveConfig(flags);
  if (!config.chromeProfile) fail("Set AIDGENT_CHROME_PROFILE (a path OUTSIDE this repo) or pass --profile.");
  const { setupLogin } = await import("./worker.mjs");
  console.log(`Opening a headed Chrome on profile: ${config.chromeProfile}`);
  console.log("Sign in to LinkedIn manually. This tool never types your credentials or MFA.");
  await setupLogin({ profilePath: config.chromeProfile, channel: config.chromeChannel });
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
  const { valid, errors } = validatePersona(persona);
  const slug = (flags.slug || slugify(persona.persona || "persona"));
  const { default: YAML } = await import("js-yaml");
  fs.mkdirSync(PRIVATE_PERSONA_DIR, { recursive: true });
  const dest = path.join(PRIVATE_PERSONA_DIR, slug + ".yaml");
  fs.writeFileSync(dest, YAML.dump(persona, { lineWidth: 100 }));
  console.log(`Wrote private persona: ${dest}`);
  if (!valid) console.log(`Note: fill these before running:\n- ${errors.join("\n- ")}`);
}

async function cmdBindSheet(flags) {
  const slug = resolvePersonaSlug(flags);
  if (!slug) fail("Usage: npm run bind-sheet -- --persona <slug> --sheet <id-or-url>");
  const arg = flags.sheet || flags.url;
  if (!arg || arg === true) fail("Provide --sheet <google-sheet-id-or-url> (your EXISTING sheet).");
  const p = resolvePersonaPath(slug);
  if (!p) fail(`persona not found: ${slug}. Create it first with create-persona.`);
  if (!p.includes(path.join("private", "personas"))) {
    console.warn(`Note: ${slug} is a PUBLIC persona (${p}). Binding a real sheet id here would be committed. Prefer a private persona under private/personas/.`);
  }
  const { default: YAML } = await import("js-yaml");
  const persona = await loadPersonaFile(p);
  const id = extractSheetId(arg);
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
    fail("No real sheet bound. Run bind-sheet or set GOOGLE_SHEET_ID to your existing sheet. This tool never creates a new one.");
  }
  const { getSheets } = await import("./sheet.mjs");
  const sheets = await getSheets(config.credentialsPath);
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabs = (meta.data.sheets || []).map((s) => s.properties.title);
  console.log(`OK: will USE existing sheet "${meta.data.properties.title}" (${sheetId}).`);
  console.log(`Tabs: ${tabs.join(", ")}`);
  if (!tabs.includes("Leads")) console.log('Note: no "Leads" tab yet. Run buildAidgentOsSheet inside THIS sheet (Extensions > Apps Script), or the worker will need a Leads tab to maintain.');
  console.log("This tool maintains THIS sheet in place and never creates a new spreadsheet.");
}

async function cmdSource(flags, { pilot } = {}) {
  const config = resolveConfig(flags);
  const slug = resolvePersonaSlug(flags);
  if (!slug) fail("No persona. Use --persona <slug>, AIDGENT_PERSONA, or select-persona.");

  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
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
      "or set GOOGLE_SHEET_ID / persona.sheet_id, then: npm run check-sheet -- --persona " + slug
    );
  }

  // 2) Candidates + existing sheet: fixture (offline) or live worker + Sheets.
  let candidates, existingSheet, blocker = null, inspected = 0;
  if (flags.fixture) {
    const fx = JSON.parse(fs.readFileSync(flags.fixture, "utf8"));
    candidates = fx.candidates || [];
    existingSheet = fx.existingSheet || { headers: LEADS_HEADERS, rows: [] };
    inspected = candidates.length;
    console.log(`[fixture] ${flags.fixture}: ${candidates.length} candidates, ${existingSheet.rows.length} existing rows`);
  } else {
    // LIVE path (local-linkedin) — never runs during automated tests.
    const { runResearch } = await import("./worker.mjs");
    const res = await runResearch({ persona, config });
    candidates = res.candidates;
    blocker = res.blocker;
    inspected = res.inspected;
    const { getSheets, readLeads } = await import("./sheet.mjs");
    if (!sheetId) fail("No Google Sheet id (persona.sheet_id/url or GOOGLE_SHEET_ID).");
    const sheets = await getSheets(config.credentialsPath);
    existingSheet = await readLeads(sheets, sheetId);
  }

  // 3) Score + plan (pure).
  const sourceType = config.mode === "public-web" ? "Public web" : "LinkedIn";
  const { scored, plan, counts } = runPipeline({ persona, existingSheet, candidates, nowMs, nowIso, sourceType });

  // 4) Always write a CSV artifact of accepted new/updated leads.
  const csvRows = [
    ...plan.newRows.map((r) => rowArray(r.cells)),
    ...plan.updates.map((u) => existingRowWithSet(existingSheet, u)),
  ];
  const csvPath = path.join(config.outDir, `${runId}.csv`);
  fs.writeFileSync(csvPath, toCsv(LEADS_HEADERS, csvRows));

  // 5) Apply to the Sheet unless dry-run / csv-only.
  let applied = null;
  if (!config.dryRun && !config.csvOnly && config.updateSheet && !flags.fixture) {
    const { getSheets, applyPlan, appendRunLog } = await import("./sheet.mjs");
    const sheets = await getSheets(config.credentialsPath);
    applied = await applyPlan(sheets, sheetId, plan, {
      headerRow: existingSheet.headerRow || 3,
      firstDataRow: existingSheet.firstDataRow || 4,
    });
    const report0 = buildRunReport({ runId, persona: slug, requestedTarget: config.target, counts, blocker: blocker ? `${blocker.kind}: ${blocker.reason}` : "", startedMs: nowMs, endedMs: Date.now(), nowIso });
    await appendRunLog(sheets, sheetId, report0);
  }

  // 6) Report.
  const report = buildRunReport({
    runId, persona: slug, requestedTarget: config.target, counts,
    blocker: blocker ? `${blocker.kind}: ${blocker.reason}` : "",
    startedMs: nowMs, endedMs: Date.now(), nowIso,
  });
  fs.writeFileSync(path.join(config.outDir, `${runId}.report.json`), JSON.stringify({ report, plan, rejected: plan.rejected.map(r => ({ name: r.candidate.name, reason: r.reason })) }, null, 2));
  console.log(formatRunReport(report));
  console.log(`CSV: ${csvPath}`);
  if (config.dryRun || flags.fixture) console.log("(dry-run / fixture: no Sheet was modified)");
  else if (applied) console.log(`Sheet: appended ${applied.appended}, updated ${applied.updated}`);

  if (blocker) { console.error(`BLOCKER: ${blocker.kind} — ${blocker.reason}. Stopped safely.`); process.exit(1); }
}

// --- helpers ---------------------------------------------------------------
function existingRowWithSet(existingSheet, update) {
  const row = (existingSheet.rows || []).find((r) => r.rowNumber === update.rowNumber);
  const cells = { ...(row ? row.cells : {}) };
  for (const [k, v] of Object.entries(update.set)) cells[k] = v;
  return rowArray(cells);
}
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function fail(msg) { console.error(msg); process.exit(2); }

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
