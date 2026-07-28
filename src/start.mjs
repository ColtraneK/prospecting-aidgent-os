// start.mjs — the status engine behind `npm run start`.
//
// WHY THIS EXISTS
// This repo is normally driven by an AI coding agent (Codex) reading AGENTS.md.
// An agent cannot answer an interactive prompt: a readline question would just
// hang its harness forever. So this command NEVER asks anything and NEVER
// blocks. It looks at the current state of your setup, prints a plain-English
// checklist, and names exactly ONE next step.
//
// The loop is: run it -> do the one thing it names -> run it again. When every
// line is a check mark it prints READY and tells you the command to run.
//
// It is read-only. It installs nothing, opens no browser, touches no Sheet, and
// makes no network calls.

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, loadDotEnv } from "./config.mjs";
import { listPersonaSlugs, resolvePersonaPath, loadPersonaFile, validatePersona, personaSheetId, isPlaceholderSheetId } from "./persona.mjs";

const SELECTED_FILE = path.join(REPO_ROOT, "private", "selected-persona.txt");

const OK = "[x]";
const NO = "[ ]";

/**
 * Gather every fact the checklist needs. Pure-ish: reads the local filesystem
 * only. Injected paths make it testable.
 */
export async function inspectSetup({ repoRoot = REPO_ROOT, env } = {}) {
  const e = env || { ...loadDotEnv(path.join(repoRoot, ".env")), ...process.env };

  const nodeMajor = Number(String(process.versions.node).split(".")[0]) || 0;
  const depsInstalled = fs.existsSync(path.join(repoRoot, "node_modules", "playwright")) &&
    fs.existsSync(path.join(repoRoot, "node_modules", "googleapis"));

  const chromeProfile = e.AIDGENT_CHROME_PROFILE || "";
  const profileExists = !!chromeProfile && fs.existsSync(chromeProfile);
  // A profile dir that has never been signed into has no cookie store.
  const signedIn = profileExists && (
    fs.existsSync(path.join(chromeProfile, "Default", "Cookies")) ||
    fs.existsSync(path.join(chromeProfile, "Default", "Network", "Cookies"))
  );

  const credsPath = e.GOOGLE_APPLICATION_CREDENTIALS || "";
  const credsExist = !!credsPath && fs.existsSync(credsPath);

  let selected = "";
  try { selected = fs.readFileSync(path.join(repoRoot, "private", "selected-persona.txt"), "utf8").trim(); } catch { /* none */ }
  const activeSlug = e.AIDGENT_PERSONA || selected;

  // Injected repoRoot must win everywhere, or a test (or a checked-out copy in
  // another folder) would silently report on the wrong repo's personas.
  const personaDirs = [path.join(repoRoot, "private", "personas"), path.join(repoRoot, "personas")];
  const personas = listPersonaSlugs(personaDirs).filter((p) => p.scope === "private");

  let persona = null, personaValid = false, personaErrors = [], sheetId = "";
  if (activeSlug) {
    const p = resolvePersonaPath(activeSlug, personaDirs);
    if (p) {
      try {
        persona = await loadPersonaFile(p);
        const v = validatePersona(persona);
        personaValid = v.valid;
        personaErrors = v.errors;
      } catch (err) {
        personaErrors = [`could not read ${p}: ${err.message}`];
      }
    } else {
      personaErrors = [`persona "${activeSlug}" is selected but no file exists for it`];
    }
  }
  sheetId = (persona && personaSheetId(persona)) || e.GOOGLE_SHEET_ID || "";

  return {
    repoRoot,
    nodeMajor,
    nodeOk: nodeMajor >= 20,
    depsInstalled,
    envFileExists: fs.existsSync(path.join(repoRoot, ".env")),
    chromeProfile, profileExists, signedIn,
    credsPath, credsExist,
    activeSlug,
    privatePersonaCount: personas.length,
    persona, personaValid, personaErrors,
    sheetId,
    sheetBound: !!sheetId && !isPlaceholderSheetId(sheetId),
    includeConnections: !!(persona && persona.include_connections === true),
  };
}

/**
 * Turn facts into an ordered checklist. The FIRST unmet item is the next step —
 * that ordering is the whole contract, so keep the list in dependency order.
 * Each item: { label, done, next } where `next` is what to do about it.
 */
export function buildChecklist(s) {
  return [
    {
      label: `Node 20 or newer (you have Node ${s.nodeMajor || "?"})`,
      done: s.nodeOk,
      next: "Install Node 20+ from nodejs.org, then run `npm run start` again.",
    },
    {
      label: "Project dependencies installed",
      done: s.depsInstalled,
      next: "Run `npm install` in this folder, then run `npm run start` again.",
    },
    {
      label: "A .env file exists (your local settings)",
      done: s.envFileExists,
      next: "Copy .env.example to .env (`cp .env.example .env`), then run `npm run start` again. You will fill it in over the next few steps.",
    },
    {
      label: "A dedicated Chrome profile folder is set and exists",
      done: s.profileExists,
      next: s.chromeProfile
        ? `AIDGENT_CHROME_PROFILE points at "${s.chromeProfile}", which does not exist yet. Create that folder (it must be OUTSIDE this repo), then run \`npm run start\` again.`
        : "Set AIDGENT_CHROME_PROFILE in .env to a NEW empty folder outside this repo — for example a folder called aidgent-chrome-profile in your home directory. This is a separate Chrome profile just for this tool, so your everyday browsing is untouched.",
    },
    {
      label: "You are signed into LinkedIn in that profile",
      done: s.signedIn,
      next: "Run `npm run setup-login`. A Chrome window opens; sign into LinkedIn yourself (including any 2-factor step), wait for your feed, then close the window. This tool never types your password and never handles your 2FA.",
    },
    {
      label: "Google service-account key file is set and exists",
      done: s.credsExist,
      next: s.credsPath
        ? `GOOGLE_APPLICATION_CREDENTIALS points at "${s.credsPath}", which is not there. Fix the path in .env, then run \`npm run start\` again.`
        : "Create a Google Cloud service account, download its JSON key to a folder OUTSIDE this repo, set GOOGLE_APPLICATION_CREDENTIALS in .env to that file's full path, and share your Google Sheet with the service account's client_email as an Editor. See README.md.",
    },
    {
      label: "An ICP persona exists and is selected",
      done: !!s.activeSlug && !!s.persona,
      next: s.privatePersonaCount
        ? "You have personas but none is selected. Run `npm run select-persona -- --persona <slug>` (see `npm run list-personas`)."
        : "No persona yet. Talk this through with your agent: it will look at your website, ask you a handful of questions about who you sell to, propose an ICP, and only write the persona once you say yes. See AGENTS.md.",
    },
    {
      label: "That persona is complete and valid",
      done: s.personaValid,
      next: s.personaErrors.length
        ? `Persona "${s.activeSlug}" still needs: ${s.personaErrors.join("; ")}.`
        : "Fill in the remaining persona fields.",
    },
    {
      label: "Your existing Google Sheet is bound (this tool never creates one)",
      done: s.sheetBound,
      next: `Run \`npm run bind-sheet -- --persona ${s.activeSlug || "<slug>"} --sheet <your-sheet-url>\`, then verify with \`npm run check-sheet\`.`,
    },
  ];
}

/** Render the checklist plus exactly one next step. Never asks a question. */
export function formatStatus(s, checklist = buildChecklist(s)) {
  const lines = [];
  lines.push("Prospect research setup — where you are right now");
  lines.push("");
  for (const item of checklist) lines.push(`  ${item.done ? OK : NO} ${item.label}`);
  lines.push("");

  const pending = checklist.find((i) => !i.done);
  if (!pending) {
    lines.push("READY. Everything is set up.");
    lines.push("");
    lines.push(`  Persona:  ${s.activeSlug}`);
    lines.push(`  Sheet:    ${s.sheetId}`);
    lines.push(`  Warm-first: ${s.includeConnections ? "yes — your existing connections are mined too" : "no — net-new people only"}`);
    lines.push("");
    lines.push("Do a small run first so you can see what lands in the sheet:");
    lines.push("  npm run pilot");
    lines.push("");
    lines.push("Then the real thing, and the daily command once you are happy:");
    lines.push("  npm run source");
    lines.push("  npm run daily      (sources new people, then checks who accepted and who replied)");
  } else {
    const stepNo = checklist.indexOf(pending) + 1;
    lines.push(`NEXT STEP (${stepNo} of ${checklist.length}):`);
    lines.push("");
    for (const l of wrap(pending.next, 74)) lines.push("  " + l);
    lines.push("");
    lines.push("Then run `npm run start` again. Nothing has been changed or sent.");
  }
  return lines.join("\n");
}

function wrap(text, width) {
  const words = String(text).split(/\s+/);
  const out = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > width) { out.push(line); line = w; }
    else line = line ? line + " " + w : w;
  }
  if (line) out.push(line);
  return out;
}

/** Entry point. Exit code 0 when READY, 1 when something is still pending. */
export async function main() {
  const s = await inspectSetup();
  const checklist = buildChecklist(s);
  console.log(formatStatus(s, checklist));
  process.exitCode = checklist.every((i) => i.done) ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith("start.mjs")) main();

export { SELECTED_FILE };
