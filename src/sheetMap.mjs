// A local escape hatch for a genuinely custom attendee header.  Codex may
// choose the mapping after inspecting `check-sheet` output; it never changes
// the shared template or a live header to make the code happy.

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";

export const DEFAULT_SHEET_MAP_PATH = path.join(REPO_ROOT, "private", "sheet-map.json");

export function loadSheetMap(file = DEFAULT_SHEET_MAP_PATH) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string" && v.trim()));
  } catch { return {}; }
}

export function saveSheetMap(map, file = DEFAULT_SHEET_MAP_PATH) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(map, null, 2) + "\n");
  return file;
}
