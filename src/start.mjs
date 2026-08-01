// start.mjs — the status engine behind `npm run start`.
//
// An agent cannot answer an interactive prompt, so this NEVER asks anything
// and NEVER blocks. It reads the current setup, prints a plain-English
// checklist of ~5 steps, and names exactly ONE next step. Run it, do the one
// thing, run it again; READY means every step was PROVED, not merely
// configured — the sheet and session steps read the proof files check-sheet
// and check-login wrote when they actually reached Google and LinkedIn.
//
// It is read-only and offline: no browser, no Sheet, no network.

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, loadDotEnv } from "./config.mjs";
import { listPersonaSlugs, resolvePersonaPath, loadPersonaFile, validatePersona, personaSheetId, isPlaceholderSheetId, sheetUrlFor, SHEET_TEMPLATE_ID, SHEET_TEMPLATE_COPY_URL } from "./persona.mjs";
import { profileState, sessionProofState } from "./session.mjs";
import { sheetProofState } from "./verified.mjs";

const SELECTED_FILE = path.join(REPO_ROOT, "private", "selected-persona.txt");

const OK = "[x]";
const NO = "[ ]";

// The one-click copy of the empty lead sheet. Copying it puts a sheet in the
// person's OWN Drive — this tool never creates a Sheet through the API.
export { SHEET_TEMPLATE_ID, SHEET_TEMPLATE_COPY_URL };

// The step where every first-time setup stalls. The whole walkthrough lives
// here so an agent can relay it without going and looking anything up.
export const SERVICE_ACCOUNT_WALKTHROUGH = [
  "Create a Google service account and give it access to your sheet. A service account is a robot Google account this tool signs in as, so it can write rows for you without ever holding your own password. Five minutes, once.",
  "",
  "1. Go to console.cloud.google.com and sign in. Create a new project — any name will do, for example aidgent.",
  "2. Search the bar at the top for \"Google Sheets API\", open it, and click Enable.",
  "3. Search that same bar for \"Credentials\" and open the Credentials page. Click \"Create credentials\", choose \"Service account\", give it any name, then Create and continue, then Done.",
  "4. Click the service account you just made, open its \"Keys\" tab, then \"Add key\", then \"Create new key\". Choose JSON and click Create. A .json file downloads to your computer.",
  "5. Move that .json file to a folder OUTSIDE this repo — your home folder or Documents is fine — and tell your agent where you put it. It writes the path into GOOGLE_APPLICATION_CREDENTIALS for you.",
  "6. Open that .json file in any text editor and copy the client_email value. It looks like something@your-project.iam.gserviceaccount.com.",
  "7. Open your Google Sheet, click Share, paste that client_email, set it to Editor, and click Send.",
  "",
  "Step 7 is the one people skip. The service account is a different identity from your own Google login, so an unshared sheet fails every run with a permission error that looks like a bug in this tool.",
].join("\n");

/**
 * Gather every fact the checklist needs. Reads the local filesystem only.
 * Injected env objects make it testable.
 */
export async function inspectSetup({ repoRoot = REPO_ROOT, env, fileEnv, shellEnv } = {}) {
  const file = fileEnv || loadDotEnv(path.join(repoRoot, ".env"));
  const shell = shellEnv || process.env;
  const e = env || { ...file, ...shell };

  const nodeMajor = Number(String(process.versions.node).split(".")[0]) || 0;
  const depsInstalled = fs.existsSync(path.join(repoRoot, "node_modules", "playwright")) &&
    fs.existsSync(path.join(repoRoot, "node_modules", "googleapis"));
  const envFileExists = fs.existsSync(path.join(repoRoot, ".env"));

  const credsPath = e.GOOGLE_APPLICATION_CREDENTIALS || "";
  const credsExist = !!credsPath && fs.existsSync(credsPath);

  const chromeProfile = e.AIDGENT_CHROME_PROFILE || "";
  const liAt = String(e.AIDGENT_LI_AT || "").trim();
  const profile = profileState(chromeProfile);
  const sessionVerified = sessionProofState({
    chromeProfile, liAt,
    proofPath: path.join(repoRoot, "private", "session-verified.json"),
  });

  let selected = "";
  try { selected = fs.readFileSync(path.join(repoRoot, "private", "selected-persona.txt"), "utf8").trim(); } catch { /* none */ }
  const activeSlug = e.AIDGENT_PERSONA || selected;
  const personaDirs = [path.join(repoRoot, "private", "personas"), path.join(repoRoot, "personas")];
  const personas = listPersonaSlugs(personaDirs).filter((p) => p.scope === "private");

  let persona = null, personaValid = false, personaErrors = [];
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
  const sheetId = (persona && personaSheetId(persona)) || e.GOOGLE_SHEET_ID || "";
  const sheetBound = !!sheetId && !isPlaceholderSheetId(sheetId);
  const sheetReachable = sheetProofState({
    sheetId: sheetBound ? sheetId : "",
    proofFile: path.join(repoRoot, "private", "sheet-verified.json"),
  });

  return {
    repoRoot,
    nodeMajor,
    nodeOk: nodeMajor >= 20,
    depsInstalled,
    envFileExists,
    credsPath, credsExist,
    chromeProfile, liAt,
    profilePlaceholder: profile.placeholder,
    sessionConfigured: !!liAt || (profile.set && !profile.placeholder),
    sessionVerified: sessionVerified.ok,
    sessionVerifiedReason: sessionVerified.reason,
    sessionVerifiedFix: sessionVerified.fix,
    sessionVerifiedAt: sessionVerified.verifiedAt,
    activeSlug,
    privatePersonaCount: personas.length,
    persona, personaValid, personaErrors,
    sheetId,
    sheetUrl: sheetUrlFor(sheetId),
    sheetBound,
    sheetReachable: sheetReachable.ok,
    sheetReachableReason: sheetReachable.reason,
    sheetReachableFix: sheetReachable.fix,
  };
}

/**
 * Facts -> an ordered checklist. The FIRST unmet item is the next step, so the
 * list stays in dependency order. Each item: { label, done, next, agentRuns }.
 */
export function buildChecklist(s) {
  const basicsMissing = [];
  if (!s.nodeOk) basicsMissing.push(`Node 20 or newer (you have Node ${s.nodeMajor || "?"}). Install it from nodejs.org — the installer is the whole job.`);
  if (!s.depsInstalled) basicsMissing.push("Dependencies are not installed. Nothing for you to do: your agent runs `npm install`. It goes quiet for a few minutes while it downloads a browser engine, which looks frozen and is not.");
  if (!s.envFileExists) basicsMissing.push("There is no .env yet. Your agent creates it with `npm run init-env`, and the two of you fill it in over the next steps.");
  if (!s.credsExist) {
    basicsMissing.push(s.credsPath
      ? `The Google key file is expected at "${s.credsPath}" and is not there. Find where the .json actually ended up and tell your agent; it corrects the path for you.`
      : SERVICE_ACCOUNT_WALKTHROUGH);
  }
  return [
    {
      label: "Basics: Node 20+, dependencies, .env, and the Google service-account key",
      done: basicsMissing.length === 0,
      next: basicsMissing.join("\n\n"),
      agentRuns: !s.depsInstalled ? "npm install" : !s.envFileExists ? "npm run init-env" : "npm run start",
    },
    {
      label: "A Google Sheet is bound AND the service account has opened it (you shared it)",
      done: s.sheetBound && s.sheetReachable,
      next: s.sheetBound
        ? [`Right now ${s.sheetReachableReason}`, "", s.sheetReachableFix].join("\n")
        : [
          "Point this at the Google Sheet you want filled in — one YOU own; this tool never creates one.",
          "",
          "If you do not have one, open this link and click \"Make a copy\":",
          "",
          `  ${SHEET_TEMPLATE_COPY_URL}`,
          "",
          "That drops a ready-made, empty copy into your own Drive, all tabs already built. Then share it with your service account's client_email as an Editor (step 6-7 of the key walkthrough), and paste the URL of YOUR copy to your agent — it binds it and proves access with check-sheet.",
        ].join("\n"),
      agentRuns: s.sheetBound ? "npm run check-sheet" : "npm run bind-sheet -- --sheet <their-sheet-url>  (then: npm run check-sheet)",
    },
    {
      label: "The LinkedIn session is proven to work (check-login reached your feed)",
      done: s.sessionVerified,
      next: [
        `Right now ${s.sessionVerifiedReason}`,
        "",
        s.sessionVerifiedFix,
        "",
        "If you would rather not have a window open at all, paste your LinkedIn li_at cookie into .env instead — .env.example says exactly where to copy it from. Either way is enough. check-login writes the proven value into .env itself, so the next command finds it too.",
      ].join("\n"),
      agentRuns: s.sessionConfigured ? "npm run check-login" : "npm run setup-login   (then: npm run check-login)",
    },
    {
      label: "An ICP persona is saved and selected",
      done: !!s.activeSlug && s.personaValid,
      next: s.personaErrors.length
        ? `Persona "${s.activeSlug}" still needs: ${s.personaErrors.join("; ")}.`
        : s.privatePersonaCount
          ? "You have saved personas but none is selected. Tell your agent which one to use."
          : "No persona yet. Talk it through with your agent: it looks at your website, proposes an ICP, you correct it, and it saves the persona once you confirm — one conversation, one confirmation. See AGENTS.md.",
      agentRuns: "npm run save-persona -- --file <persona.yaml>",
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
    lines.push("READY. Everything is set up and proven.");
    lines.push("");
    lines.push(`  Persona:  ${s.activeSlug}`);
    lines.push(`  Sheet:    ${s.sheetUrl || s.sheetId}`);
    lines.push(`  Session:  ${s.liAt ? "li_at cookie" : s.chromeProfile || "none"}`);
    lines.push(`  Verified: ${s.sessionVerifiedAt || "unknown"} — proved against LinkedIn, not inferred`);
    lines.push("");
    lines.push("The run loop: craft a search URL, open it, read the artifact, nominate,");
    lines.push("inspect, judge the evidence, qualify. See AGENTS.md.");
    lines.push("");
    lines.push("FOR THE AGENT, not for the person to type:");
    lines.push('  npm run open    -- --url "<linkedin search url>"');
    lines.push("  npm run inspect -- --nominations nominations.json");
    lines.push("  npm run qualify -- --decisions decisions.json --update-sheet");
  } else {
    const stepNo = checklist.indexOf(pending) + 1;
    lines.push(`NEXT STEP (${stepNo} of ${checklist.length}):`);
    lines.push("");
    for (const l of wrap(pending.next, 74)) lines.push(("  " + l).trimEnd());
    lines.push("");
    lines.push("  FOR THE AGENT, not for the person to type:");
    if (pending.agentRuns) lines.push(`    ${pending.agentRuns}`);
    lines.push("    npm run start        once the step above is done");
    lines.push("");
    lines.push("Nothing has been changed or sent.");
  }
  return lines.join("\n");
}

// Hints are prose, but the longest ones are numbered procedures. An explicit
// newline is honoured as a hard break; numbered steps hang their continuation.
function wrap(text, width) {
  const out = [];
  for (const para of String(text).split("\n")) {
    const indent = (para.match(/^\s*/) || [""])[0];
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
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

/** The same checklist as data, so an agent never scrapes prose meant for people. */
export function toJson(s, checklist = buildChecklist(s)) {
  const pending = checklist.find((i) => !i.done) || null;
  return {
    ready: checklist.every((i) => i.done),
    persona: s.activeSlug || null,
    personaValid: s.personaValid,
    sheetId: s.sheetId || null,
    sheetUrl: s.sheetUrl || null,
    sessionVerified: s.sessionVerified,
    sessionVerifiedAt: s.sessionVerifiedAt || null,
    checklist: checklist.map((i) => ({ label: i.label, done: !!i.done })),
    nextStep: pending
      ? { number: checklist.indexOf(pending) + 1, of: checklist.length, label: pending.label, hint: pending.next, agentRuns: pending.agentRuns || null }
      : null,
  };
}

/** Entry point. Exit code 0 when READY, 1 when something is still pending. */
export async function main(argv = process.argv.slice(2)) {
  const s = await inspectSetup();
  const checklist = buildChecklist(s);
  if (argv.includes("--json")) {
    console.log(JSON.stringify(toJson(s, checklist), null, 2));
  } else {
    console.log(formatStatus(s, checklist));
  }
  process.exitCode = checklist.every((i) => i.done) ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith("start.mjs")) main();

export { SELECTED_FILE };
