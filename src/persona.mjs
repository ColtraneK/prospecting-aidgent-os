// persona.mjs — load, validate, list, and scaffold ICP personas.
// A persona is a private, switchable profile that drives all sourcing. The
// sourcing implementation never hardcodes an ICP; it reads the active persona.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..");
export const PUBLIC_PERSONA_DIR = path.join(REPO_ROOT, "personas");
export const PRIVATE_PERSONA_DIR = path.join(REPO_ROOT, "private", "personas");

export const REQUIRED_FIELDS = [
  "persona",
  "version",
  "business",
  "offer",
  "customer_outcome",
  "target_industries",
  "company_sizes",
  "buyer_titles",
  "geography",
  "buying_signals",
  "exclusions",
  "opener_voice",
  "search_keywords",
  "research_sources",
  "created",
  "last_updated",
];

const ARRAY_FIELDS = [
  "target_industries",
  "company_sizes",
  "buyer_titles",
  "buying_signals",
  "exclusions",
  "search_keywords",
];

/** Validate a persona object. Returns { valid, errors: [] }. Pure. */
export function validatePersona(p) {
  const errors = [];
  if (!p || typeof p !== "object") return { valid: false, errors: ["persona is not an object"] };

  for (const f of REQUIRED_FIELDS) {
    if (p[f] === undefined || p[f] === null || p[f] === "") errors.push(`missing required field: ${f}`);
  }
  for (const f of ARRAY_FIELDS) {
    if (p[f] !== undefined && !Array.isArray(p[f])) errors.push(`field ${f} must be a list`);
    if (Array.isArray(p[f]) && p[f].length === 0) errors.push(`field ${f} must not be empty`);
  }
  if (p.business && typeof p.business === "object") {
    if (!p.business.name) errors.push("business.name is required");
    if (!p.business.website) errors.push("business.website is required");
  } else if (p.business !== undefined) {
    errors.push("business must be an object with name and website");
  }
  // At least one Sheet target.
  if (!p.sheet_id && !p.sheet_url) errors.push("one of sheet_id or sheet_url is required");
  // Geography can be a list, a string, or { include, exclude }.
  if (p.geography !== undefined) {
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

/** True when a sheet id is missing or still the shipped placeholder. */
export function isPlaceholderSheetId(id) {
  const s = String(id || "").trim();
  return !s || /EXAMPLE_SHEET_ID/i.test(s) || s === "replace_me";
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

/** Build a persona object from an approved ICP intake (for create-persona). */
export function personaTemplate(icp = {}, { nowIso = new Date().toISOString() } = {}) {
  const date = nowIso.slice(0, 10);
  return {
    persona: icp.persona || "New Persona",
    version: 1,
    business: { name: icp.businessName || "", website: icp.website || "" },
    offer: icp.offer || "",
    customer_outcome: icp.outcome || "",
    target_industries: icp.industries || [],
    company_sizes: icp.companySizes || [],
    buyer_titles: icp.titles || [],
    geography: icp.geography || { include: [], exclude: [] },
    buying_signals: icp.signals || [],
    core_topics: icp.coreTopics || icp.topics || [], // topics to prioritize recent activity about
    exclusions: icp.exclusions || [],
    opener_voice: icp.openerVoice || "",
    search_keywords: icp.keywords || [],
    research_sources: icp.researchSources || ["linkedin_profile", "linkedin_activity"],
    sheet_id: icp.sheetId || "",
    created: date,
    last_updated: date,
  };
}
