// config.mjs — resolve run configuration from CLI flags + environment.
// Env is loaded from a .env file if present (no dependency: tiny parser), but
// real values must live outside Git. See .env.example for variable names.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

/** Minimal .env loader: KEY=VALUE lines, no export, no interpolation. */
export function loadDotEnv(file = path.join(REPO_ROOT, ".env")) {
  const out = {};
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

/** The .env this repo reads. One place, so nothing guesses at the path. */
export const DOTENV_PATH = path.join(REPO_ROOT, ".env");

/**
 * Write KEY=value into .env, replacing an existing line for that key.
 *
 * WHY: a session verified with a --flag or a shell variable is real, but it
 * lives only in the terminal that verified it. The NEXT command reads .env and
 * gets whatever was there before — in practice, the example placeholder. So
 * the commands that prove a session works write the path they proved back into
 * the file. See src/session.mjs for the failure this prevents.
 *
 * Only ever called with a filesystem path. Secrets are never written here: an
 * li_at cookie that the person pasted on a command line stays on that command
 * line, because writing it to disk on their behalf is a decision that is not
 * ours to make.
 */
export function upsertDotEnv(key, value, file = DOTENV_PATH) {
  let raw = "";
  try { raw = fs.readFileSync(file, "utf8"); } catch { raw = ""; }
  // Match the file's existing line endings rather than imposing ours — this
  // file is hand-edited on Windows as often as not.
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const line = `${key}=${value}`;
  const isKeyLine = (l) => new RegExp(`^[ \\t]*${key}[ \\t]*=`).test(l);

  // Line-based rather than a regex replace, for two reasons that both bite in
  // practice. First, loadDotEnv is LAST-wins, so replacing only the first of
  // two lines for the same key writes a value that is then overridden by the
  // stale one below it — and this function would report success. Every
  // occurrence has to go. Second, a value is substituted literally: passing it
  // through String.replace would let a Windows path containing `$&` or "$`"
  // splice other parts of the file into itself.
  const lines = raw === "" ? [] : raw.split("\n");
  const trailing = lines.length > 1 && lines[lines.length - 1] === "";
  if (trailing) lines.pop();

  let replaced = false;
  const out = [];
  for (const l of lines) {
    // Strip a CR for the test only; the rewritten line gets one back below.
    if (!isKeyLine(l.replace(/\r$/, ""))) { out.push(l); continue; }
    if (replaced) continue; // collapse duplicates onto the first position
    out.push(eol === "\r\n" ? `${line}\r` : line);
    replaced = true;
  }
  if (!replaced) out.push(eol === "\r\n" ? `${line}\r` : line);

  let next = out.join("\n");
  if (trailing || raw === "" || /\n$/.test(raw)) next += "\n";
  fs.writeFileSync(file, next);
  return { file, key, value, replaced };
}

/** Parse argv (after the command) into flags. Supports --k v, --k=v, --flag. */
export function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

const bool = (v, dflt = false) => {
  if (v === undefined) return dflt;
  if (typeof v === "boolean") return v;
  return /^(1|true|yes|on)$/i.test(String(v));
};

/**
 * Resolve the effective config. Precedence: CLI flag > env > default.
 * Does NOT read secrets values here beyond names/paths.
 */
export function resolveConfig(flags = {}, env = { ...loadDotEnv(), ...process.env }) {
  const mode = (flags["connections"] || flags["from-connections"])
    ? "connections"
    : "local-linkedin";
  const headless = flags["headed"] ? false : bool(flags["headless"], bool(env.HEADLESS, false));
  return {
    mode,
    persona: flags.persona || env.AIDGENT_PERSONA || "",
    target: intOr(flags.target, intOr(env.TARGET_COUNT, 25)),
    headless,
    dryRun: bool(flags["dry-run"]),
    updateSheet: flags["csv-only"] ? false : bool(flags["update-sheet"], !flags["dry-run"]),
    csvOnly: bool(flags["csv-only"]),
    // `str` because parseFlags gives a bare `--profile` the value `true`, and a
    // boolean flowing into a path is a raw Playwright type error four calls
    // later. A valueless flag is not a value; fall through to the environment.
    chromeProfile: str(flags.profile) || env.AIDGENT_CHROME_PROFILE || "",
    chromeChannel: str(flags.channel) || env.AIDGENT_CHROME_CHANNEL || "chrome",
    // A pasted LinkedIn session cookie. Either this OR a signed-in profile is a
    // session; with the cookie alone, runs are headless from the very first one.
    liAt: str(flags["li-at"]) || env.AIDGENT_LI_AT || "",
    sheetId: flags.sheet || env.GOOGLE_SHEET_ID || "",
    credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS || "",
    dailyCap: intOr(flags["daily-cap"], intOr(env.AIDGENT_DAILY_CAP, 120)),
    minDelayMs: intOr(env.AIDGENT_MIN_DELAY_MS, 3500),
    maxDelayMs: intOr(env.AIDGENT_MAX_DELAY_MS, 9000),
    outDir: flags.out || path.join(REPO_ROOT, "run-artifacts"),
  };
}

const str = (v) => (typeof v === "string" ? v : "");

function intOr(v, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
}

export { REPO_ROOT };
