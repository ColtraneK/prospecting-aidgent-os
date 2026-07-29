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
import { listPersonaSlugs, resolvePersonaPath, loadPersonaFile, validatePersona, personaSheetId, isPlaceholderSheetId, SHEET_TEMPLATE_ID, SHEET_TEMPLATE_COPY_URL } from "./persona.mjs";

const SELECTED_FILE = path.join(REPO_ROOT, "private", "selected-persona.txt");

const OK = "[x]";
const NO = "[ ]";

// The one-click copy of the empty Aidgent OS lead sheet. Copying it puts a
// sheet in the person's OWN Drive, owned by them — this tool still never
// creates a Sheet through the API, and never touches a sheet it was not given.
// The id itself lives in persona.mjs so bind-sheet can refuse it cheaply.
export { SHEET_TEMPLATE_ID, SHEET_TEMPLATE_COPY_URL };

// Step 6 is where every first-time setup stalls, and the person driving it is
// usually not a developer. An agent reading this output has to be able to
// relay the whole procedure without going and looking anything up, so the
// entire walkthrough lives here rather than as a pointer to README.md.
// No question marks anywhere: a question in this output invites the agent to
// answer it instead of doing the step.
// One logical line per beat; `wrap` does the line breaking and hangs the
// numbered steps, so nothing here has to be re-flowed by hand when it changes.
export const SERVICE_ACCOUNT_WALKTHROUGH = [
  "Create a Google service account and give it access to your sheet. A service account is a robot Google account this tool signs in as, so it can write rows for you without ever holding your own password. Five minutes, once.",
  "",
  "1. Go to console.cloud.google.com and sign in. Create a new project — any name will do, for example aidgent.",
  "2. Search the bar at the top for \"Google Sheets API\", open it, and click Enable.",
  "3. Search that same bar for \"Credentials\" and open the Credentials page. Click \"Create credentials\", choose \"Service account\", give it any name, then Create and continue, then Done.",
  "4. Click the service account you just made, open its \"Keys\" tab, then \"Add key\", then \"Create new key\". Choose JSON and click Create. A .json file downloads to your computer.",
  "5. Move that .json file to a folder OUTSIDE this repo — your home folder or Documents is fine — and set GOOGLE_APPLICATION_CREDENTIALS in .env to its full path.",
  "6. Open that .json file in any text editor and copy the client_email value. It looks like something@your-project.iam.gserviceaccount.com.",
  "7. Open your Google Sheet, click Share, paste that client_email, set it to Editor, and click Send.",
  "",
  "Step 7 is the one people skip. The service account is a different identity from your own Google login, so an unshared sheet fails every run with a permission error that looks like a bug in this tool.",
].join("\n");

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
        : SERVICE_ACCOUNT_WALKTHROUGH,
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
      label: "A Google Sheet is bound (you own it; this tool never creates one)",
      done: s.sheetBound,
      next: [
        "Point this at the Google Sheet you want filled in. If you already have one, skip to the commands below.",
        "",
        "If you do not have one, open this link and click \"Make a copy\":",
        "",
        `  ${SHEET_TEMPLATE_COPY_URL}`,
        "",
        "That drops a ready-made, empty copy of the lead sheet into your own Google Drive, owned by you — all seven tabs, headers, and dropdowns already built, and no data in it. It is your copy; nobody else can see it.",
        "",
        "Share that sheet with your service account's client_email as an Editor (the address from step 6), then run:",
        "",
        `  npm run bind-sheet -- --persona ${s.activeSlug || "<slug>"} --sheet <your-sheet-url>`,
        "  npm run check-sheet",
      ].join("\n"),
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
    // trimEnd so a blank separator line is genuinely blank, not two spaces —
    // trailing whitespace shows up as diff noise wherever this gets pasted.
    for (const l of wrap(pending.next, 74)) lines.push(("  " + l).trimEnd());
    lines.push("");
    lines.push("Then run `npm run start` again. Nothing has been changed or sent.");
  }
  return lines.join("\n");
}

// Hints are prose, but the longest ones are numbered procedures a
// non-developer has to follow with their hands. A single wrapped block turns
// "(4)" into something you lose your place in, so an explicit newline in a
// hint is honoured as a hard break and each line is wrapped on its own.
function wrap(text, width) {
  const out = [];
  for (const para of String(text).split("\n")) {
    const indent = (para.match(/^\s*/) || [""])[0];
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    // Continuation lines hang under the first, so a numbered step stays a
    // visible block instead of collapsing into the one after it.
    const hang = indent + (/^\s*\d+\.\s/.test(para) ? "   " : "");
    let line = indent;
    let first = true;
    for (const w of words) {
      const candidate = line === indent || line === hang ? line + w : line + " " + w;
      if (candidate.length > width && !(line === indent && first) && line.trim()) {
        out.push(line); line = hang + w;
      } else {
        line = candidate;
      }
      first = false;
    }
    if (line.trim()) out.push(line);
  }
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
