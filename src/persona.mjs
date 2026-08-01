// persona.mjs — load, validate, list, and save ICP personas.
//
// A v6 persona is agent GUIDANCE plus hard lines, not a query config:
//   icp              prose paragraph — who this person sells to, in sentences
//   hard_exclusions  list — substrings that hard-disqualify (code enforces)
//   geography        optional — list/string, or { include: [], exclude: [] }
//   topics           list — search starting points, not query strings
//   voice            prose — how an opener should sound
//   sheet_id         added by bind-sheet
// The agent reads icp/topics/voice and judges; the code enforces only
// hard_exclusions and geography (disqualify.mjs).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..");
export const PUBLIC_PERSONA_DIR = path.join(REPO_ROOT, "personas");
export const PRIVATE_PERSONA_DIR = path.join(REPO_ROOT, "private", "personas");

/**
 * Validate a persona object. Returns { valid, errors: [] }. Pure.
 * The sheet binding is checked by the commands that need it, not here — a
 * persona is saved before a sheet is bound.
 */
export function validatePersona(p) {
  const errors = [];
  if (!p || typeof p !== "object") return { valid: false, errors: ["persona is not an object"] };
  if (typeof p.icp !== "string" || p.icp.trim().length < 40) {
    errors.push("icp must be a prose paragraph (a real description, not a label) — who they sell to, what the buyer looks like, what makes someone worth reaching this week");
  }
  if (!Array.isArray(p.hard_exclusions)) {
    errors.push("hard_exclusions must be a list (it may be empty) — these are the substrings code hard-disqualifies on");
  }
  if (!Array.isArray(p.topics) || p.topics.filter((t) => String(t).trim()).length === 0) {
    errors.push("topics must be a non-empty list of search starting points");
  }
  if (typeof p.voice !== "string" || !p.voice.trim()) {
    errors.push("voice must describe how an opener should sound");
  }
  if (p.geography !== undefined && p.geography !== null) {
    const g = p.geography;
    const ok = Array.isArray(g) || typeof g === "string" || (g && typeof g === "object");
    if (!ok) errors.push("geography must be a list, string, or { include, exclude }");
  }
  return { valid: errors.length === 0, errors };
}

/** Extract a spreadsheet ID from a raw id or a full Google Sheets URL. */
export function extractSheetId(input) {
  const s = String(input || "").trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return s;
}

/** Extract the spreadsheet ID from a persona (accepts sheet_id or sheet_url). */
export function personaSheetId(p) {
  if (p && p.sheet_id) return extractSheetId(p.sheet_id);
  if (p && p.sheet_url) return extractSheetId(p.sheet_url);
  return "";
}

/**
 * The person's sheet as a clickable link. The sheet IS the deliverable, and
 * every response that ends a run carries this line.
 */
export function sheetUrlFor(id) {
  const s = extractSheetId(id);
  return s && !isPlaceholderSheetId(s) ? `https://docs.google.com/spreadsheets/d/${s}/edit` : "";
}

/** True when a sheet id is missing or still the shipped placeholder. */
export function isPlaceholderSheetId(id) {
  const s = String(id || "").trim();
  return !s || /EXAMPLE_SHEET_ID/i.test(s) || s === "replace_me";
}

// The shared sheet everyone copies. Clicking "Make a copy" puts a copy in the
// person's OWN Drive; this tool never creates a spreadsheet through the API.
export const SHEET_TEMPLATE_ID = "1n9pMSXwSHe4Uh8tG65z2ZwWTWi3kuhGb43rXdXDrw9g";

export const SHEET_TEMPLATE_COPY_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_TEMPLATE_ID}/copy`;

/** What to say whenever the system needs a sheet and has not been given one. */
export function sheetSetupHelp() {
  return [
    "",
    "This tool never creates a spreadsheet. It only writes to one you own.",
    "If you do not have one yet, open this and click \"Make a copy\":",
    "",
    "  " + SHEET_TEMPLATE_COPY_URL,
    "",
    "That drops a ready-made, empty copy into your own Drive, owned by you, with",
    "every tab already built. Then bind the URL of YOUR COPY, not the template.",
  ].join("\n");
}

/**
 * True when someone bound the shared template instead of their own copy — the
 * easiest setup mistake, and it fails later with a permission error that looks
 * like the service-account sharing step went wrong. Refused at bind time.
 */
export function isSharedTemplateId(id) {
  return extractSheetId(id) === SHEET_TEMPLATE_ID;
}

// --- file operations (kept out of the pure validators) ---------------------

/** Parse a YAML persona file into an object. Requires js-yaml at runtime. */
export async function loadPersonaFile(filePath) {
  const { default: YAML } = await import("js-yaml");
  const raw = fs.readFileSync(filePath, "utf8");
  return YAML.load(raw);
}

/** List available persona slugs from private then public dirs (private wins). */
export function listPersonaSlugs(dirs = [PRIVATE_PERSONA_DIR, PUBLIC_PERSONA_DIR]) {
  const found = new Map(); // slug -> { slug, path, scope }
  for (const dir of dirs) {
    const scope = dir.includes(path.join("private", "personas")) ? "private" : "public";
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!/\.ya?ml$/i.test(f)) continue;
      const slug = f.replace(/\.ya?ml$/i, "");
      if (!found.has(slug)) found.set(slug, { slug, path: path.join(dir, f), scope });
    }
  }
  return [...found.values()];
}

/** Resolve a slug to its file, preferring private personas. */
export function resolvePersonaPath(slug, dirs = [PRIVATE_PERSONA_DIR, PUBLIC_PERSONA_DIR]) {
  for (const dir of dirs) {
    for (const ext of [".yaml", ".yml"]) {
      const p = path.join(dir, slug + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/** Load + validate a persona by slug. Throws on missing/invalid. */
export async function getPersona(slug) {
  const p = resolvePersonaPath(slug);
  if (!p) throw new Error(`persona not found: ${slug}`);
  const persona = await loadPersonaFile(p);
  const { valid, errors } = validatePersona(persona);
  if (!valid) throw new Error(`persona ${slug} is invalid:\n- ${errors.join("\n- ")}`);
  return { persona, path: p };
}
