// csv.mjs — RFC-4180-ish CSV writing. Pure, no I/O.

/** Escape a single field: wrap in quotes and double embedded quotes. */
export function escapeCsvField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Serialize rows (array of arrays) to a CSV string with CRLF line breaks preserved-safe. */
export function toCsv(headers, rows) {
  const lines = [];
  if (headers && headers.length) lines.push(headers.map(escapeCsvField).join(","));
  for (const row of rows) lines.push(row.map(escapeCsvField).join(","));
  return lines.join("\n") + "\n";
}
