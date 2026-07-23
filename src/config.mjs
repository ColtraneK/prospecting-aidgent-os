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
    : flags["public-web"] ? "public-web" : "local-linkedin";
  const headless = flags["headed"] ? false : bool(flags["headless"], bool(env.HEADLESS, false));
  return {
    mode,
    persona: flags.persona || env.AIDGENT_PERSONA || "",
    target: intOr(flags.target, intOr(env.TARGET_COUNT, 25)),
    headless,
    dryRun: bool(flags["dry-run"]),
    updateSheet: flags["csv-only"] ? false : bool(flags["update-sheet"], !flags["dry-run"]),
    csvOnly: bool(flags["csv-only"]),
    chromeProfile: flags.profile || env.AIDGENT_CHROME_PROFILE || "",
    chromeChannel: flags.channel || env.AIDGENT_CHROME_CHANNEL || "chrome",
    sheetId: flags.sheet || env.GOOGLE_SHEET_ID || "",
    credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS || "",
    dailyCap: intOr(flags["daily-cap"], intOr(env.AIDGENT_DAILY_CAP, 120)),
    minDelayMs: intOr(env.AIDGENT_MIN_DELAY_MS, 3500),
    maxDelayMs: intOr(env.AIDGENT_MAX_DELAY_MS, 9000),
    outDir: flags.out || path.join(REPO_ROOT, "run-artifacts"),
  };
}

function intOr(v, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
}

export { REPO_ROOT };
