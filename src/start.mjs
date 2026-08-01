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
import { listPersonaSlugs, resolvePersonaPath, loadPersonaFile, validatePersona, personaSheetId, isPlaceholderSheetId, sheetUrlFor, SHEET_TEMPLATE_ID, SHEET_TEMPLATE_COPY_URL } from "./persona.mjs";
import { profileState, envFileReproducesSession, provenanceOf, describeProvenance, sessionProofState, FROM_ENV_FILE } from "./session.mjs";
import { sheetProofState } from "./verified.mjs";

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
  "5. Move that .json file to a folder OUTSIDE this repo — your home folder or Documents is fine — and tell your agent where you put it. It writes the path into GOOGLE_APPLICATION_CREDENTIALS for you.",
  "6. Open that .json file in any text editor and copy the client_email value. It looks like something@your-project.iam.gserviceaccount.com.",
  "7. Open your Google Sheet, click Share, paste that client_email, set it to Editor, and click Send.",
  "",
  "Step 7 is the one people skip. The service account is a different identity from your own Google login, so an unshared sheet fails every run with a permission error that looks like a bug in this tool.",
].join("\n");

/**
 * Gather every fact the checklist needs. Pure-ish: reads the local filesystem
 * only. Injected paths make it testable.
 */
export async function inspectSetup({ repoRoot = REPO_ROOT, env, fileEnv, shellEnv } = {}) {
  // .env and the shell are kept apart on purpose. Merged, they hide the one
  // state that looks perfect here and fails on the next command: a session
  // that exists only as a variable in the terminal you are standing in.
  const file = fileEnv || loadDotEnv(path.join(repoRoot, ".env"));
  const shell = shellEnv || process.env;
  const e = env || { ...file, ...shell };

  const nodeMajor = Number(String(process.versions.node).split(".")[0]) || 0;
  const depsInstalled = fs.existsSync(path.join(repoRoot, "node_modules", "playwright")) &&
    fs.existsSync(path.join(repoRoot, "node_modules", "googleapis"));

  const chromeProfile = e.AIDGENT_CHROME_PROFILE || "";
  // A pasted li_at session cookie is a complete alternative to the profile:
  // with it, runs are headless from the first one and no login window opens.
  const liAt = !!String(e.AIDGENT_LI_AT || "").trim();
  // profileState knows that the .env.example placeholder is not a folder, so a
  // never-edited .env fails this step instead of passing it on a path that
  // would be created empty at launch.
  const profile = profileState(chromeProfile);
  const profileExists = profile.exists || liAt;
  const signedIn = profile.signedIn || liAt;
  const profilePlaceholder = profile.placeholder;
  const profileFrom = provenanceOf("AIDGENT_CHROME_PROFILE", { shellEnv: shell, fileEnv: file });
  // Report where the value is AVAILABLE from, not merely which layer won.
  // When .env carries the same value the shell does, saying "NOT from .env" is
  // false, and it is the sentence doing all the warning work — firing it on a
  // safe setup is how a warning gets tuned out.
  // Path normalisation (case, slash direction, trailing slash) is right for a
  // folder and wrong for a cookie, where case is significant.
  const samePathish = (a, b) =>
    String(a).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() ===
    String(b).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const inFile = (key, value, isPath) => {
    const onFile = String(file[key] || "").trim();
    if (!onFile) return false;
    return isPath ? samePathish(onFile, String(value || "").trim()) : onFile === String(value || "").trim();
  };
  const sessionKey = liAt ? "AIDGENT_LI_AT" : "AIDGENT_CHROME_PROFILE";
  const sessionValue = liAt ? String(e.AIDGENT_LI_AT || "").trim() : chromeProfile;
  const sessionFrom = inFile(sessionKey, sessionValue, !liAt)
    ? FROM_ENV_FILE
    : provenanceOf(sessionKey, { shellEnv: shell, fileEnv: file });
  // The check that catches a green checklist standing on a value the next
  // terminal will not have.
  // The only honest answer to "is this session good" comes from a command that
  // actually opened the feed. This reads what one of those recorded.
  const verified = sessionProofState({
    chromeProfile,
    liAt: String(e.AIDGENT_LI_AT || "").trim(),
    proofPath: path.join(repoRoot, "private", "session-verified.json"),
  });
  const reproduce = envFileReproducesSession({
    fileEnv: file,
    resolvedProfile: chromeProfile,
    resolvedLiAt: String(e.AIDGENT_LI_AT || "").trim(),
  });

  const credsPath = e.GOOGLE_APPLICATION_CREDENTIALS || "";
  const credsExist = !!credsPath && fs.existsSync(credsPath);

  let selected = "";
  try { selected = fs.readFileSync(path.join(repoRoot, "private", "selected-persona.txt"), "utf8").trim(); } catch { /* none */ }
  const activeSlug = e.AIDGENT_PERSONA || selected;

  // Injected repoRoot must win everywhere, or a test (or a checked-out copy in
  // another folder) would silently report on the wrong repo's personas.
  const personaDirs = [path.join(repoRoot, "private", "personas"), path.join(repoRoot, "personas")];
  const personas = listPersonaSlugs(personaDirs).filter((p) => p.scope === "private");

  let persona = null, personaValid = false, personaErrors = [], personaWarnings = [], sheetId = "";
  if (activeSlug) {
    const p = resolvePersonaPath(activeSlug, personaDirs);
    if (p) {
      try {
        persona = await loadPersonaFile(p);
        const v = validatePersona(persona);
        personaValid = v.valid;
        personaErrors = v.errors;
        personaWarnings = v.warnings || [];
      } catch (err) {
        personaErrors = [`could not read ${p}: ${err.message}`];
      }
    } else {
      personaErrors = [`persona "${activeSlug}" is selected but no file exists for it`];
    }
  }
  sheetId = (persona && personaSheetId(persona)) || e.GOOGLE_SHEET_ID || "";

  // Binding a sheet only writes its id down. It does not prove the service
  // account was ever given access to it — and "share the sheet with the
  // client_email" is the step almost everyone skips. Nothing local can tell
  // the difference, so this reads what `npm run check-sheet` recorded when it
  // actually opened the sheet as that identity.
  const sheetReachable = sheetProofState({
    sheetId: isPlaceholderSheetId(sheetId) ? "" : sheetId,
    proofFile: path.join(repoRoot, "private", "sheet-verified.json"),
  });

  return {
    repoRoot,
    nodeMajor,
    nodeOk: nodeMajor >= 20,
    depsInstalled,
    envFileExists: fs.existsSync(path.join(repoRoot, ".env")),
    chromeProfile, profileExists, signedIn, liAt,
    profilePlaceholder,
    profileFrom, sessionFrom,
    sessionVerified: verified.ok,
    sessionVerifiedReason: verified.reason,
    sessionVerifiedFix: verified.fix,
    sessionVerifiedCommand: verified.command,
    sessionVerifiedAt: verified.verifiedAt,
    envReproduces: reproduce.ok,
    envReproducesReason: reproduce.reason,
    envReproducesFix: reproduce.fix,
    credsPath, credsExist,
    activeSlug,
    privatePersonaCount: personas.length,
    persona, personaValid, personaErrors, personaWarnings,
    buyerTitles: (persona && Array.isArray(persona.buyer_titles) ? persona.buyer_titles : []),
    exclusions: (persona && Array.isArray(persona.exclusions) ? persona.exclusions : []),
    sheetId,
    sheetUrl: sheetUrlFor(sheetId),
    sheetBound: !!sheetId && !isPlaceholderSheetId(sheetId),
    sheetReachable: sheetReachable.ok,
    sheetReachableReason: sheetReachable.reason,
    sheetReachableFix: sheetReachable.fix,
    sheetReachableCommand: sheetReachable.command,
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
      next: "Install Node 20 or newer from nodejs.org. The installer is the whole job; your agent takes it from there.",
      agentRuns: "npm run start",
    },
    {
      label: "Project dependencies installed",
      done: s.depsInstalled,
      next: "Nothing for you to do here. Your agent installs these. It goes quiet for a few minutes while it downloads a browser engine, which looks like it has frozen and has not.",
      agentRuns: "npm install",
    },
    {
      label: "A .env file exists (your local settings)",
      done: s.envFileExists,
      next: "Nothing for you to do here. Your agent creates this settings file, and the two of you fill it in over the next few steps.",
      agentRuns: "cp .env.example .env",
    },
    {
      label: "Google service-account key file is set and exists",
      done: s.credsExist,
      next: s.credsPath
        ? `The key file is expected at "${s.credsPath}" and is not there. Find where the .json actually ended up and tell your agent; it will correct the path for GOOGLE_APPLICATION_CREDENTIALS for you.`
        : SERVICE_ACCOUNT_WALKTHROUGH,
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
        "Then paste the URL of YOUR copy to your agent and it will bind it for you.",
      ].join("\n"),
      agentRuns: `npm run bind-sheet -- --persona ${s.activeSlug || "<slug>"} --sheet <their-sheet-url>`,
    },
    {
      // The step that did not exist, which is why the failure it catches kept
      // happening. Sharing the sheet with the service account's client_email
      // is a separate action from creating the sheet, in a different product,
      // and nothing on this machine can observe whether it was done. So the
      // command that opens the sheet as that identity records the answer.
      label: "The service account can actually open that sheet (you shared it)",
      done: s.sheetReachable,
      next: [
        `Right now ${s.sheetReachableReason}`,
        "",
        s.sheetReachableFix,
      ].join("\n"),
      agentRuns: s.sheetReachableCommand,
    },
    {
      label: "A LinkedIn session source is set (Chrome profile folder, or an li_at cookie)",
      done: s.profileExists,
      next: s.profilePlaceholder
        ? `The Chrome profile setting still reads as fill-this-in example text (${s.chromeProfile}) rather than a real folder, which is what .env.example ships. Tell your agent where you want that folder to live, or hand it your li_at cookie instead and skip the folder entirely. This is refused on purpose: an unreal path gets CREATED empty when Chrome launches, so the run would open a signed-out browser and blame LinkedIn for it.`
        : s.chromeProfile
          ? `The Chrome profile folder "${s.chromeProfile}" is not on this machine. Pick a folder outside this project and tell your agent, or skip the folder by handing it your LinkedIn li_at cookie instead.`
          : "Two ways to give this tool a LinkedIn session, and either is enough. Simplest: in a browser where you are already signed into LinkedIn, copy the li_at cookie and hand it to your agent — .env.example says exactly where to find it, and then no login window ever opens. Or: your agent opens a Chrome window on a folder kept only for this, and you sign in there yourself, once.",
    },
    {
      // This step used to read the filesystem and guess. Chrome creates a
      // cookie file the moment it opens, so an abandoned profile passed and
      // READY appeared over a session that had never signed in. Nothing here
      // can reach LinkedIn — this command is offline by contract — so it now
      // requires a run that DID reach it to have left a record.
      label: "That session is proven to work (verified against LinkedIn, not guessed)",
      done: s.sessionVerified,
      next: [
        `Right now ${s.sessionVerifiedReason}`,
        "",
        s.sessionVerifiedFix,
        "",
        "If you would rather not have a window open at all, the alternative is to paste your LinkedIn li_at cookie into .env instead — .env.example says exactly where to copy it from. Either way is enough.",
      ].join("\n"),
      agentRuns: s.sessionVerifiedCommand,
    },
    {
      // The step that exists because everything above it can be green on a
      // configuration that only this terminal has. A shell variable makes the
      // two steps above pass and the next command fail, and the run report
      // blames LinkedIn rather than the setup.
      label: "That session is written in .env, so a new terminal has it too",
      done: s.envReproduces,
      next: [
        `Right now ${s.envReproducesReason}`,
        "",
        s.envReproducesFix,
        "",
        "Why this is its own step: settings can come from a --flag, from a variable set in this terminal, or from .env, and only .env survives into the next command. A session that lives in your shell makes this checklist say READY and the very next run stop at a LinkedIn login page.",
      ].join("\n"),
    },
    {
      label: "An ICP persona exists and is selected",
      done: !!s.activeSlug && !!s.persona,
      next: s.privatePersonaCount
        ? "You have more than one saved ICP. Tell your agent which one you want to use and it will select it."
        : "No persona yet. Talk this through with your agent: it will look at your website, ask you a handful of questions about who you sell to, propose an ICP, and only write the persona once you say yes. See AGENTS.md.",
    },
    {
      label: "That persona is complete and valid",
      done: s.personaValid,
      next: s.personaErrors.length
        ? `Persona "${s.activeSlug}" still needs: ${s.personaErrors.join("; ")}.`
        : "Fill in the remaining persona fields.",
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

  // A persona can be complete, valid, and aimed at half of LinkedIn. That is
  // not a checklist step — nothing here is unmet — so it is said next to the
  // list rather than hidden inside it.
  if (Array.isArray(s.personaWarnings) && s.personaWarnings.length) {
    lines.push("TARGETING WARNING — this persona will match more people than it should:");
    for (const w of s.personaWarnings) for (const l of wrap("- " + w, 74)) lines.push(("  " + l).trimEnd());
    lines.push("");
    lines.push("  Read the buyer titles and exclusions back to the person and get an");
    lines.push("  explicit yes on the titles specifically before sourcing with this.");
    lines.push("");
  }

  const pending = checklist.find((i) => !i.done);
  if (!pending) {
    lines.push("READY. Everything is set up.");
    lines.push("");
    lines.push(`  Persona:  ${s.activeSlug}`);
    lines.push(`  Sheet:    ${s.sheetUrl || s.sheetId}`);
    lines.push(`  Titles:   ${(s.buyerTitles || []).join(", ") || "(none)"}`);
    // Printing WHERE the session came from, not just that there is one. READY
    // has to be a claim about this machine, not about this terminal.
    lines.push(`  Session:  ${s.liAt ? "li_at cookie" : s.chromeProfile || "none"} (${describeProvenance(s.sessionFrom)})`);
    lines.push(`  Verified: ${s.sessionVerifiedAt || "unknown"} — proved against LinkedIn, not inferred`);
    lines.push(`  Warm-first: ${s.includeConnections ? "yes — your existing connections are mined too" : "no — net-new people only"}`);
    lines.push("");
    lines.push("Ask your agent for a small pilot run first, so you can see what lands in");
    lines.push("the sheet before there is a lot of it. Then a full run, and a daily one");
    lines.push("once you are happy with what it finds.");
    lines.push("");
    lines.push("FOR THE AGENT, not for the person to type:");
    lines.push("  npm run pilot      10 leads added, for review");
    lines.push("  npm run source     a full run");
    lines.push("  npm run daily      sources, then checks who accepted and who replied");
  } else {
    const stepNo = checklist.indexOf(pending) + 1;
    lines.push(`NEXT STEP (${stepNo} of ${checklist.length}):`);
    lines.push("");
    // trimEnd so a blank separator line is genuinely blank, not two spaces —
    // trailing whitespace shows up as diff noise wherever this gets pasted.
    for (const l of wrap(pending.next, 74)) lines.push(("  " + l).trimEnd());
    // Addressed to the agent, labelled so it does not get relayed to the person
    // as something to type. Setup is a conversation, not a terminal session:
    // the person clicks and signs in, the agent runs the commands. Even the
    // "run this again" belongs here — it was the last instruction still
    // pointing a non-developer at a terminal they may not have open.
    lines.push("");
    lines.push("  FOR THE AGENT, not for the person to type:");
    if (pending.agentRuns) lines.push(`    ${pending.agentRuns}`);
    lines.push("    npm run start        once the step above is done");
    lines.push("");
    lines.push("Nothing has been changed or sent.");
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

/**
 * The same checklist as a machine-readable object.
 *
 * `npm run start` is the loop an agent lives in, and until now the only way to
 * know what it said was to scrape the prose it prints for humans. That is a
 * parser aimed at a paragraph, and it breaks the first time the wording
 * improves. `--json` gives the agent the same facts as data: which steps are
 * met, which one is next, the command to run for it, and — so the agent can
 * report back — the sheet's URL.
 */
export function toJson(s, checklist = buildChecklist(s)) {
  const pending = checklist.find((i) => !i.done) || null;
  return {
    ready: checklist.every((i) => i.done),
    persona: s.activeSlug || null,
    personaValid: s.personaValid,
    personaWarnings: s.personaWarnings || [],
    buyerTitles: s.buyerTitles || [],
    exclusions: s.exclusions || [],
    includeConnections: s.includeConnections,
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
